import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classById, fullName, subjectById } from '@/data/queries';
import { school, subjectIdsTaughtBy } from '@/data/school';
import { resolveText, type ID } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { fetchCapabilities } from '@/lib/ask/client';
import { classify } from '@/lib/ask/router';
import type { AskCapabilities } from '@/lib/ask/types';
import { lessonSlots } from '@/data/school';
import { daysFromToday } from '@/lib/dates';
import {
  useCurrentTeacher,
  useTeacherAssignments,
  useTeacherToday,
} from '@/state/selectors';
import { useApp, type AssignmentDraft } from '@/state/store';
import { postTeacherAi } from './client';
import {
  fallbackAssignment,
  fallbackExplanation,
  fallbackLessonPlan,
  fallbackQuiz,
} from './fallback';
import { answerFromTeacherFacts, buildTeacherContext, type TeacherFacts } from './schoolFacts';
import type {
  ContentSource,
  LessonLength,
  TeacherAiErrorCode,
  TeacherAiResult,
  TeacherAiScope,
  TeacherAiStatus,
  TeacherChatTurn,
} from './types';

/* ------------------------------------------------------------------
   One Teacher AI action at a time, for the signed-in teacher.

   Three things this hook is responsible for.

   AUTHORISATION IS NOT A DROPDOWN. The class and subject menus are
   built from this teacher's own teaching rows, and the server checks
   the same table again. The form cannot offer an unauthorised class,
   and a request that names one anyway is refused there.

   NOTHING IS PUBLISHED BY ITSELF. An assignment draft is text on a
   screen until the teacher presses save, and only then does it enter
   the existing assignment flow — with the teacher's chosen class,
   subject and date, not the model's.

   A FAILED REQUEST IS NOT A DEAD SCREEN. When no provider can answer,
   SchoolMind's own template takes over and the result is labelled
   `schoolmind`, never `ai`.
   ------------------------------------------------------------------ */

const MAX_CHAT_TURNS = 12;

const ERROR_TEXT: Record<TeacherAiErrorCode, TranslationKey> = {
  missing_api_key: 'teacherAi.error.noKey',
  forbidden: 'teacherAi.error.forbidden',
  rate_limited: 'teacherAi.error.unavailable',
  network: 'teacherAi.error.network',
  timeout: 'teacherAi.error.timeout',
  upstream_error: 'teacherAi.error.unavailable',
  malformed_response: 'teacherAi.error.unavailable',
  empty_response: 'teacherAi.error.unavailable',
  bad_request: 'teacherAi.error.badRequest',
  server_error: 'teacherAi.error.unavailable',
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface TeacherClassOption {
  id: ID;
  label: string;
  grade: number;
  students: number;
  subjectIds: ID[];
}

export interface UseTeacherAi {
  status: TeacherAiStatus;
  busy: boolean;
  /** The last error, already translated. */
  errorText: string | null;
  /** True when the error came from SchoolMind's own template taking
   *  over, so the UI can say so quietly rather than as a failure. */
  capabilities: AskCapabilities | null;
  classes: TeacherClassOption[];
  subjectsFor: (classId: ID) => Array<{ id: ID; name: string }>;
  /** Topic suggestions from this teacher's real open work. */
  topicsFor: (classId: ID, subjectId: ID) => string[];
  result: TeacherAiResult | null;
  chat: TeacherChatTurn[];
  runLesson: (classId: ID, subjectId: ID, topic: string, minutes: LessonLength) => void;
  runAssignment: (classId: ID, subjectId: ID, topic: string, note: string) => void;
  runExplain: (classId: ID, subjectId: ID, topic: string) => void;
  runQuiz: (
    classId: ID,
    subjectId: ID,
    topic: string,
    difficulty: 'easy' | 'medium' | 'hard',
    count: number,
  ) => void;
  /** Saves the current assignment draft as real work. Returns its id. */
  saveDraft: (draft: AssignmentDraft) => ID | null;
  ask: (question: string) => void;
  clearResult: () => void;
  clearChat: () => void;
}

export function useTeacherAi(): UseTeacherAi {
  const { t, locale } = useI18n();
  const { teacherAi, setTeacherAi, createAssignment } = useApp();
  const { teacher, taughtClasses } = useCurrentTeacher();
  const assignments = useTeacherAssignments();
  const today = useTeacherToday();

  const [status, setStatus] = useState<TeacherAiStatus>('idle');
  const [error, setError] = useState<TeacherAiErrorCode | null>(null);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    fetchCapabilities().then((caps) => {
      if (active) setCapabilities(caps);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  /* A different teacher signed in: drop anything in flight so a late
     reply cannot land in their workspace. */
  useEffect(() => {
    abortRef.current?.abort();
    setError(null);
    setStatus('idle');
  }, [teacher.id]);

  const state = teacherAi;

  /** Only classes this teacher actually teaches. */
  const classes = useMemo<TeacherClassOption[]>(
    () =>
      taughtClasses.map((schoolClass) => ({
        id: schoolClass.id,
        label: schoolClass.name,
        grade: schoolClass.grade,
        students: schoolClass.studentIds.length,
        subjectIds: subjectIdsTaughtBy(teacher.id, schoolClass.id),
      })),
    [taughtClasses, teacher.id],
  );

  const subjectsFor = useCallback(
    (classId: ID) =>
      subjectIdsTaughtBy(teacher.id, classId).map((id) => ({
        id,
        name: resolveText(subjectById(id).name, locale),
      })),
    [locale, teacher.id],
  );

  /** Real work this teacher has set makes an honest topic suggestion. */
  const topicsFor = useCallback(
    (classId: ID, subjectId: ID) => {
      const seen: string[] = [];
      for (const assignment of assignments) {
        if (assignment.classId !== classId || assignment.subjectId !== subjectId) continue;
        const title = resolveText(assignment.title, locale);
        if (!seen.includes(title)) seen.push(title);
        if (seen.length === 3) break;
      }
      return seen;
    },
    [assignments, locale],
  );

  const facts = useMemo<TeacherFacts>(() => {
    const slotTime = (slot: number) =>
      lessonSlots.find((entry) => entry.index === slot)?.start ?? '';
    return {
      teacherName: fullName(teacher),
      schoolName: resolveText(school.name, locale),
      subjects: teacher.subjectIds.map((id) => resolveText(subjectById(id).name, locale)),
      classes: classes.map((entry) => ({
        id: entry.id,
        label: entry.label,
        grade: entry.grade,
        students: entry.students,
        subjects: entry.subjectIds.map((id) => resolveText(subjectById(id).name, locale)),
      })),
      todayLessons: today.lessons.map((lesson) => ({
        time: slotTime(lesson.lesson.slot),
        classLabel: classById(lesson.lesson.classId).name,
        subject: resolveText(lesson.subject.name, locale),
        room: lesson.lesson.room,
      })),
      assignments: assignments.map((assignment) => ({
        title: resolveText(assignment.title, locale),
        classLabel: classById(assignment.classId).name,
        subjectId: assignment.subjectId,
        subject: resolveText(subjectById(assignment.subjectId).name, locale),
        kind: assignment.kind,
        dueDate: assignment.dueDate,
        /* Counted from the demo clock, so a teacher's "due tomorrow"
           means the same day the pupil's screen says it does. */
        daysLeft: daysFromToday(assignment.dueDate),
      })),
    };
  }, [assignments, classes, locale, teacher, today.lessons]);

  const scopeOf = useCallback(
    (classId: ID, subjectId: ID, topic: string): TeacherAiScope => ({
      classId,
      classLabel: classById(classId).name,
      subjectId,
      subject: resolveText(subjectById(subjectId).name, locale),
      topic: topic.trim(),
    }),
    [locale],
  );

  const beginRequest = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('working');
    setError(null);
    return controller;
  }, []);

  const common = useCallback(
    (scope: TeacherAiScope) => {
      const option = classes.find((entry) => entry.id === scope.classId);
      return {
        locale,
        teacherId: teacher.id,
        teacherName: fullName(teacher),
        classId: scope.classId,
        classLabel: scope.classLabel,
        subjectId: scope.subjectId,
        subject: scope.subject,
        topic: scope.topic,
        grade: option?.grade ?? 9,
        studentCount: option?.students ?? 6,
      };
    },
    [classes, locale, teacher],
  );

  /** Shared tail of every structured action: store the result, and on
   *  failure store SchoolMind's own version instead of nothing. */
  const finish = useCallback(
    (result: TeacherAiResult | null, failure: TeacherAiErrorCode | null) => {
      if (failure) setError(failure);
      if (result) setTeacherAi({ result, chat: state?.chat ?? [] });
      setStatus('idle');
    },
    [setTeacherAi, state?.chat],
  );

  const runLesson = useCallback(
    (classId: ID, subjectId: ID, rawTopic: string, minutes: LessonLength) => {
      const scope = scopeOf(classId, subjectId, rawTopic);
      if (!scope.topic || status === 'working') return;
      const controller = beginRequest();

      void (async () => {
        const response = await postTeacherAi(
          { action: 'lesson', ...common(scope), minutes },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (response.ok && response.lesson) {
          finish({ kind: 'lesson', scope, source: 'ai', minutes, plan: response.lesson }, null);
          return;
        }
        finish(
          {
            kind: 'lesson',
            scope,
            source: 'schoolmind',
            minutes,
            plan: fallbackLessonPlan(scope, minutes, t),
          },
          response.ok ? 'upstream_error' : response.error,
        );
      })();
    },
    [beginRequest, common, finish, scopeOf, status, t],
  );

  const runAssignment = useCallback(
    (classId: ID, subjectId: ID, rawTopic: string, note: string) => {
      const scope = scopeOf(classId, subjectId, rawTopic);
      if (!scope.topic || status === 'working') return;
      const controller = beginRequest();

      void (async () => {
        const response = await postTeacherAi(
          { action: 'assignment', ...common(scope), note: note.trim() },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (response.ok && response.assignment) {
          finish(
            { kind: 'assignment', scope, source: 'ai', draft: response.assignment },
            null,
          );
          return;
        }
        finish(
          {
            kind: 'assignment',
            scope,
            source: 'schoolmind',
            draft: fallbackAssignment(scope, t),
          },
          response.ok ? 'upstream_error' : response.error,
        );
      })();
    },
    [beginRequest, common, finish, scopeOf, status, t],
  );

  const runExplain = useCallback(
    (classId: ID, subjectId: ID, rawTopic: string) => {
      const scope = scopeOf(classId, subjectId, rawTopic);
      if (!scope.topic || status === 'working') return;
      const controller = beginRequest();

      void (async () => {
        const response = await postTeacherAi(
          { action: 'explain', ...common(scope) },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (response.ok && response.explain) {
          finish({ kind: 'explain', scope, source: 'ai', method: response.explain }, null);
          return;
        }
        finish(
          {
            kind: 'explain',
            scope,
            source: 'schoolmind',
            method: fallbackExplanation(scope, t),
          },
          response.ok ? 'upstream_error' : response.error,
        );
      })();
    },
    [beginRequest, common, finish, scopeOf, status, t],
  );

  const runQuiz = useCallback(
    (
      classId: ID,
      subjectId: ID,
      rawTopic: string,
      difficulty: 'easy' | 'medium' | 'hard',
      count: number,
    ) => {
      const scope = scopeOf(classId, subjectId, rawTopic);
      if (!scope.topic || status === 'working') return;
      const controller = beginRequest();

      void (async () => {
        const response = await postTeacherAi(
          { action: 'quiz', ...common(scope), difficulty, count },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (response.ok && response.questions && response.questions.length > 0) {
          finish(
            {
              kind: 'quiz',
              scope,
              source: 'ai',
              difficulty,
              quiz: { questions: response.questions },
            },
            null,
          );
          return;
        }

        /* SchoolMind's own question bank, the same one a student's
           quiz falls back to. Empty for a subject it does not cover,
           and then there is nothing honest to show. */
        const bank = fallbackQuiz(subjectId, locale, count);
        finish(
          bank.length > 0
            ? {
                kind: 'quiz',
                scope,
                source: 'schoolmind',
                difficulty,
                quiz: { questions: bank },
              }
            : null,
          response.ok ? 'upstream_error' : response.error,
        );
      })();
    },
    [beginRequest, common, finish, locale, scopeOf, status],
  );

  const saveDraft = useCallback(
    (draft: AssignmentDraft): ID | null => {
      /* The teacher's deliberate act. The class and subject come from
         the form, and the server-side teaching table already decided
         the form could offer them. */
      const created = createAssignment(draft);
      if (state?.result?.kind === 'assignment') {
        setTeacherAi({
          result: { ...state.result, savedAssignmentId: created.id },
          chat: state.chat,
        });
      }
      return created.id;
    },
    [createAssignment, setTeacherAi, state],
  );

  /* ---- chat ---- */

  const patchTurn = useCallback(
    (id: string, update: Partial<TeacherChatTurn>) => {
      setTeacherAi((current) => ({
        result: current?.result ?? null,
        chat: (current?.chat ?? []).map((turn) =>
          turn.id === id ? { ...turn, ...update } : turn,
        ),
      }));
    },
    [setTeacherAi],
  );

  const ask = useCallback(
    (rawQuestion: string) => {
      const question = rawQuestion.trim();
      if (!question || status === 'working') return;

      const id = newId('tc');
      const turn: TeacherChatTurn = {
        id,
        question,
        answer: '',
        sources: [],
        usedWeb: false,
        withheld: false,
        schoolBlocks: [],
        source: null,
        at: new Date().toISOString(),
      };

      setTeacherAi((current) => ({
        result: current?.result ?? null,
        chat: [...(current?.chat ?? []), turn].slice(-MAX_CHAT_TURNS),
      }));

      const classification = classify(question);

      /* A question about a SchoolMind record is answered from the
         record. No request, no paraphrase, nothing to invent. */
      const direct =
        classification.route === 'SCHOOL_DATA'
          ? answerFromTeacherFacts(question, facts, t, locale)
          : null;

      if (direct) {
        patchTurn(id, { schoolBlocks: direct, source: 'schoolmind' });
        return;
      }

      const controller = beginRequest();
      const wantsWeb =
        classification.route === 'WEB_SEARCH' || classification.route === 'HYBRID';

      void (async () => {
        const history = (state?.chat ?? [])
          .slice(-3)
          .flatMap((entry) =>
            entry.answer
              ? [
                  { role: 'user' as const, text: entry.question },
                  { role: 'model' as const, text: entry.answer },
                ]
              : [],
          );

        const response = await postTeacherAi(
          {
            action: 'chat',
            locale,
            teacherId: teacher.id,
            teacherName: fullName(teacher),
            message: question,
            web: wantsWeb,
            schoolContext: buildTeacherContext(facts, t, locale),
            history,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setStatus('idle');

        if (!response.ok) {
          setError(response.error);
          patchTurn(id, { answer: '', source: null });
          return;
        }

        if (response.withheld) {
          /* Live information that could not be verified. Say that, and
             say nothing else — this is the rule AskMySchool set. */
          patchTurn(id, {
            withheld: true,
            answer: '',
            source: null,
          });
          return;
        }

        patchTurn(id, {
          answer: response.chat?.text ?? '',
          sources: response.chat?.sources ?? [],
          usedWeb: response.chat?.usedWeb === true,
          source: 'ai',
        });
      })();
    },
    [beginRequest, facts, locale, patchTurn, setTeacherAi, state?.chat, status, t, teacher],
  );

  const clearResult = useCallback(() => {
    abortRef.current?.abort();
    setError(null);
    setStatus('idle');
    setTeacherAi((current) => ({ result: null, chat: current?.chat ?? [] }));
  }, [setTeacherAi]);

  const clearChat = useCallback(() => {
    abortRef.current?.abort();
    setError(null);
    setStatus('idle');
    setTeacherAi((current) => ({ result: current?.result ?? null, chat: [] }));
  }, [setTeacherAi]);

  return {
    status,
    busy: status === 'working',
    errorText: error ? t(ERROR_TEXT[error]) : null,
    capabilities,
    classes,
    subjectsFor,
    topicsFor,
    result: state?.result ?? null,
    chat: state?.chat ?? [],
    runLesson,
    runAssignment,
    runExplain,
    runQuiz,
    saveDraft,
    ask,
    clearResult,
    clearChat,
  };
}

/** What a result's label should say about where it came from. */
export function sourceLabelKey(source: ContentSource): TranslationKey {
  return source === 'ai' ? 'teacherAi.badgeAi' : 'teacherAi.badgeSchoolmind';
}
