import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fullName, lessonsOfClass, subjectById } from '@/data/queries';
import { resolveText, type ID, type Weekday } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { fetchCapabilities } from '@/lib/ask/client';
import type { AskCapabilities } from '@/lib/ask/types';
import { daysFromToday } from '@/lib/dates';
import { checkTopic, type TopicProblem } from '@/lib/topic';
import { useCurrentStudent, useStudentItems } from '@/state/selectors';
import { useApp } from '@/state/store';
import { postTutor, type TutorRequest } from './client';
import {
  EMPTY_PROGRESS,
  type Difficulty,
  type TutorAction,
  type TutorErrorCode,
  type TutorMode,
  type TutorSession,
  type TutorTurn,
} from './types';

/* ------------------------------------------------------------------
   One tutoring session, owned by the application store under the
   signed-in student's id — so signing out and back in as somebody
   else opens their lesson, not this one.

   Two things deliberately cost no model call: revealing the next
   hint, which arrived with the turn, and switching mode, which only
   changes how the next turn is asked for.
   ------------------------------------------------------------------ */

/** Monday to Saturday — the school's teaching week. */
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6];

const MAX_TURNS = 12;
const MAX_HISTORY = 6;

function newId(): string {
  return `tt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** The rule behind "adaptive": two right in a row moves up, anything
 *  that went wrong or a plea for simpler moves down. Deterministic,
 *  so it can be explained rather than claimed. */
function nextDifficulty(current: Difficulty, action: TutorAction, session: TutorSession): Difficulty {
  const order: Difficulty[] = ['easy', 'medium', 'hard'];
  const index = order.indexOf(current);

  if (action === 'simplify') return order[Math.max(index - 1, 0)];
  if (action !== 'answer') return current;

  const last = [...session.turns].reverse().find((turn) => turn.verdict);
  if (!last?.verdict) return current;
  if (last.verdict === 'correct' && session.progress.streak >= 2) {
    return order[Math.min(index + 1, order.length - 1)];
  }
  if (last.verdict === 'incorrect') return order[Math.max(index - 1, 0)];
  return current;
}

/** A compact record of the lesson so far. The model gets the thread,
 *  not the transcript. */
function historyOf(session: TutorSession): TutorRequest['history'] {
  const out: TutorRequest['history'] = [];
  for (const turn of session.turns.slice(-MAX_HISTORY)) {
    if (turn.studentText) out.push({ role: 'user', text: turn.studentText });
    const said = [turn.feedback, turn.explanation, turn.question].filter(Boolean).join(' ');
    if (said) out.push({ role: 'model', text: said });
  }
  return out.slice(-MAX_HISTORY);
}

export interface UseTutor {
  /** Why a typed topic was refused, if it was. */
  topicProblem: TopicProblem | null;
  session: TutorSession | null;
  busy: boolean;
  error: TutorErrorCode | null;
  capabilities: AskCapabilities | null;
  /** Subjects this student actually studies. */
  subjects: Array<{ id: ID; name: string }>;
  /** Hints of the newest turn that are already on screen. */
  revealedHints: number;
  start: (subjectId: ID, topic: string, mode: TutorMode) => void;
  answer: (text: string) => void;
  simplify: () => void;
  example: () => void;
  next: () => void;
  setMode: (mode: TutorMode) => void;
  revealHint: () => void;
  findSources: () => void;
  reset: () => void;
}

export function useTutor(): UseTutor {
  const { locale } = useI18n();
  const { user, setTutorSession } = useApp();
  const { student, schoolClass } = useCurrentStudent();
  const items = useStudentItems();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TutorErrorCode | null>(null);
  const [topicProblem, setTopicProblem] = useState<TopicProblem | null>(null);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const session = user.tutor;

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

  /* A different student signed in: stop whatever was in flight so a
     late reply cannot land in their session. */
  useEffect(() => {
    abortRef.current?.abort();
    setBusy(false);
    setError(null);
  }, [student.id]);

  /** Subjects this student actually studies — taken from their own
   *  class timetable, so an 8-A list is not a 10-A list. */
  const subjects = useMemo(() => {
    const ids = new Set<ID>();
    for (const weekday of WEEKDAYS) {
      for (const entry of lessonsOfClass(schoolClass.id, weekday)) ids.add(entry.subject.id);
    }
    return [...ids]
      .map((id) => ({ id, name: resolveText(subjectById(id).name, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [locale, schoolClass.id]);

  /** A real upcoming test in that subject, if the records hold one.
   *  The tutor is told about it; it never invents one. */
  const schoolNoteFor = useCallback(
    (subjectId: ID): string => {
      const test = items.find(
        (item) =>
          item.subject.id === subjectId &&
          item.assignment.kind === 'test' &&
          daysFromToday(item.assignment.dueDate) >= 0,
      );
      if (!test) return '';
      const days = daysFromToday(test.assignment.dueDate);
      return `The student has a real test in this subject on ${test.assignment.dueDate} (in ${days} day(s)): "${resolveText(test.assignment.title, locale)}".`;
    },
    [items, locale],
  );

  const run = useCallback(
    (current: TutorSession, action: TutorAction, studentText: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const difficulty = nextDifficulty(current.difficulty, action, current);
      const id = newId();

      const pending: TutorTurn = {
        id,
        studentText: studentText || undefined,
        action,
        status: 'pending',
        mode: current.mode,
        difficulty,
        feedback: '',
        explanation: '',
        example: '',
        question: '',
        hints: [],
        schoolNote: '',
      };

      const withPending: TutorSession = {
        ...current,
        difficulty,
        turns: [...current.turns, pending].slice(-MAX_TURNS),
        revealedHints: 0,
      };
      setTutorSession(withPending);
      setBusy(true);
      setError(null);

      void (async () => {
        const response = await postTutor(
          {
            locale,
            action,
            mode: current.mode,
            difficulty,
            subject: resolveText(subjectById(current.subjectId).name, locale),
            topic: current.topic,
            studentName: fullName(student),
            classLabel: schoolClass.name,
            grade: schoolClass.grade,
            schoolNote: action === 'start' ? schoolNoteFor(current.subjectId) : '',
            studentAnswer: studentText,
            history: historyOf(current),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setError(response.error);
          setTutorSession({
            ...withPending,
            turns: withPending.turns.map((turn) =>
              turn.id === id ? { ...turn, status: 'error', error: response.error } : turn,
            ),
          });
          setBusy(false);
          return;
        }

        const { turn } = response;
        const verdict = turn.verdict ?? undefined;
        const progress = { ...current.progress };
        if (action === 'answer' && verdict) {
          progress.answered += 1;
          if (verdict === 'correct') {
            progress.correct += 1;
            progress.streak += 1;
          } else {
            if (verdict === 'partial') progress.partial += 1;
            progress.streak = 0;
          }
        }

        setTutorSession({
          ...withPending,
          progress,
          turns: withPending.turns.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  status: 'done',
                  verdict,
                  feedback: turn.feedback,
                  explanation: turn.explanation,
                  example: turn.example,
                  question: turn.question,
                  hints: turn.hints,
                  sources: response.sources,
                  usedWeb: response.usedWeb,
                  degraded: response.degraded ?? undefined,
                }
              : entry,
          ),
        });
        setBusy(false);
      })();
    },
    [locale, schoolClass.grade, schoolClass.name, schoolNoteFor, setTutorSession, student],
  );

  const start = useCallback(
    (subjectId: ID, topic: string, mode: TutorMode) => {
      /* An impossible topic is refused before anything is spent, so a
         lesson is never built on a premise that cannot be true. */
      const checked = checkTopic(topic);
      if (!checked.ok) {
        setTopicProblem(checked.problem);
        return;
      }
      setTopicProblem(null);
      const trimmed = checked.topic;
      const fresh: TutorSession = {
        subjectId,
        topic: trimmed,
        mode,
        difficulty: 'medium',
        locale,
        turns: [],
        progress: { ...EMPTY_PROGRESS },
        revealedHints: 0,
        startedAt: new Date().toISOString(),
      };
      run(fresh, 'start', '');
    },
    [locale, run],
  );

  const answer = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!session || !trimmed || busy) return;
      run(session, 'answer', trimmed);
    },
    [busy, run, session],
  );

  const simplify = useCallback(() => {
    if (session && !busy) run(session, 'simplify', '');
  }, [busy, run, session]);

  const example = useCallback(() => {
    if (session && !busy) run(session, 'example', '');
  }, [busy, run, session]);

  const next = useCallback(() => {
    if (session && !busy) run(session, 'next', '');
  }, [busy, run, session]);

  const findSources = useCallback(() => {
    if (session && !busy) run(session, 'sources', '');
  }, [busy, run, session]);

  /* Changing mode costs nothing until the next turn is asked for. */
  const setMode = useCallback(
    (mode: TutorMode) => {
      if (!session || busy || session.mode === mode) return;
      run({ ...session, mode }, 'mode', '');
    },
    [busy, run, session],
  );

  /* The hints came with the turn, so showing one is free. */
  const revealHint = useCallback(() => {
    if (!session) return;
    const last = session.turns[session.turns.length - 1];
    if (!last || session.revealedHints >= last.hints.length) return;
    setTutorSession({
      ...session,
      revealedHints: session.revealedHints + 1,
      progress: { ...session.progress, hintsUsed: session.progress.hintsUsed + 1 },
    });
  }, [session, setTutorSession]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTutorSession(null);
    setBusy(false);
    setError(null);
  }, [setTutorSession]);

  return {
    session,
    busy,
    error,
    /** Why a typed topic was refused, if it was. */
    topicProblem,
    capabilities,
    subjects,
    revealedHints: session?.revealedHints ?? 0,
    start,
    answer,
    simplify,
    example,
    next,
    setMode,
    revealHint,
    findSources,
    reset,
  };
}
