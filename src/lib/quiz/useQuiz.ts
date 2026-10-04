import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lessonsOfClass, subjectById } from '@/data/queries';
import { resolveText, type ID, type Weekday } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { fetchCapabilities } from '@/lib/ask/client';
import type { AskCapabilities } from '@/lib/ask/types';
import { todayISO } from '@/lib/dates';
import { checkTopic, type TopicProblem } from '@/lib/topic';
import { useCurrentStudent, useStudentItems } from '@/state/selectors';
import { useApp } from '@/state/store';
import { bankHasSubject, bankQuestions } from './bank';
import { postCheck, postQuiz } from './client';
import type {
  QuizAnswer,
  QuizDifficulty,
  QuizErrorCode,
  QuizHistoryEntry,
  QuizLength,
  QuizQuestion,
  QuizSession,
  QuizSignals,
  QuizStatus,
} from './types';

/* ------------------------------------------------------------------
   One quiz at a time, owned by the application store under the
   signed-in student's id.

   What costs a request and what does not is a deliberate line:

     generating a quiz        one request
     a multiple-choice answer none — two ids are compared here
     a typed answer           none when it matches the expected
                              wording, one request when it does not
     revealing a hint         none; hints arrive with the question

   When Gemini cannot generate, the quiz runs on SchoolMind's own
   question bank and says so. The loop never becomes a dead page.
   ------------------------------------------------------------------ */

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6];

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Loose equality for a typed answer: case, spacing, punctuation and
 *  decimal commas should not decide whether a student was right. */
function looksEqual(given: string, expected: string): boolean {
  const tidy = (value: string) =>
    value
      .toLowerCase()
      .replace(/,/g, '.')
      .replace(/[^\p{L}\p{N}.]+/gu, '')
      .trim();
  const a = tidy(given);
  const b = tidy(expected);
  if (!a || !b) return false;
  if (a === b) return true;

  /* "5" and "5.0" are the same answer. */
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

export interface UseQuiz {
  session: QuizSession | null;
  /** Why a typed topic was refused, if it was. */
  topicProblem: TopicProblem | null;
  status: QuizStatus;
  error: QuizErrorCode | null;
  capabilities: AskCapabilities | null;
  subjects: Array<{ id: ID; name: string }>;
  /** Topics drawn from this student's real open work for one subject,
   *  never invented. */
  topicsFor: (subjectId: ID) => string[];
  history: QuizHistoryEntry[];
  signals: QuizSignals;
  busy: boolean;
  /** The answer to the question on screen, once given. */
  currentAnswer: QuizAnswer | null;
  start: (subjectId: ID, topic: string, difficulty: QuizDifficulty, length: QuizLength) => void;
  answer: (given: string) => void;
  next: () => void;
  restart: () => void;
  discard: () => void;
}

export function useQuiz(): UseQuiz {
  const { locale } = useI18n();
  const { user, setQuiz, recordQuiz } = useApp();
  const { student, schoolClass } = useCurrentStudent();
  const items = useStudentItems();

  const [status, setStatus] = useState<QuizStatus>(user.quiz ? 'running' : 'setup');
  const [error, setError] = useState<QuizErrorCode | null>(null);
  const [topicProblem, setTopicProblem] = useState<TopicProblem | null>(null);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const session = user.quiz ?? null;

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

  /* A different student signed in: drop anything in flight so a late
     reply cannot land in their quiz. */
  useEffect(() => {
    abortRef.current?.abort();
    setError(null);
  }, [student.id]);

  /* Keep the screen in step with whichever quiz is stored. */
  useEffect(() => {
    if (!session) {
      setStatus((current) => (current === 'generating' ? current : 'setup'));
      return;
    }
    setStatus((current) =>
      current === 'checking' ? current : session.finishedAt ? 'done' : 'running',
    );
  }, [session]);

  /** Subjects this student actually studies, from their timetable. */
  const subjects = useMemo(() => {
    const ids = new Set<ID>();
    for (const weekday of WEEKDAYS) {
      for (const entry of lessonsOfClass(schoolClass.id, weekday)) ids.add(entry.subject.id);
    }
    return [...ids]
      .map((id) => ({ id, name: resolveText(subjectById(id).name, locale) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [locale, schoolClass.id]);

  /** Real open work makes an honest topic suggestion. */
  const topicsBySubject = useMemo(() => {
    const map = new Map<ID, string[]>();
    for (const item of items) {
      if (item.completed) continue;
      const list = map.get(item.subject.id) ?? [];
      const title = resolveText(item.assignment.title, locale);
      if (!list.includes(title)) list.push(title);
      map.set(item.subject.id, list.slice(0, 3));
    }
    return map;
  }, [items, locale]);

  /* A slice stored by an older build has no history yet. */
  const history = user.quizHistory ?? [];

  const signals = useMemo<QuizSignals>(() => {
    const recent = history.slice(0, 5);
    return {
      quizzes: history.length,
      answered: history.reduce((sum, entry) => sum + entry.total, 0),
      correct: history.reduce((sum, entry) => sum + entry.correct, 0),
      recentSubjects: [...new Set(recent.map((entry) => entry.subjectId))],
      review: recent.flatMap((entry) =>
        entry.review.map((prompt) => ({
          subjectId: entry.subjectId,
          topic: entry.topic,
          prompt,
        })),
      ),
    };
  }, [history]);

  const begin = useCallback(
    (
      subjectId: ID,
      topic: string,
      difficulty: QuizDifficulty,
      length: QuizLength,
      questions: QuizQuestion[],
      source: 'ai' | 'bank',
    ) => {
      setQuiz({
        id: newId('quiz'),
        subjectId,
        topic,
        difficulty,
        source,
        locale,
        questions: questions.slice(0, length),
        answers: [],
        index: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
      });
      setStatus('running');
    },
    [locale, setQuiz],
  );

  const start = useCallback(
    (subjectId: ID, rawTopic: string, difficulty: QuizDifficulty, length: QuizLength) => {
      if (status === 'generating' || status === 'checking') return;
      /* Refused before a request is spent: a quiz is never written
         about a period that cannot exist. */
      const checked = checkTopic(rawTopic);
      if (!checked.ok) {
        setTopicProblem(checked.problem);
        return;
      }
      setTopicProblem(null);
      const topic = checked.topic;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('generating');
      setError(null);

      void (async () => {
        const response = await postQuiz(
          {
            locale,
            subject: resolveText(subjectById(subjectId).name, locale),
            topic,
            difficulty,
            count: length,
            grade: schoolClass.grade,
            classLabel: schoolClass.name,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (response.ok) {
          begin(subjectId, topic, difficulty, length, response.questions, 'ai');
          return;
        }

        /* The model could not write this quiz. SchoolMind has its own
           questions for this subject, so the loop still runs — clearly
           labelled as SchoolMind's, never as AI's. */
        const fallback = bankQuestions(subjectId, locale, length);
        if (fallback.length === 0) {
          setError(response.error);
          setStatus('setup');
          return;
        }
        setError(response.error);
        begin(subjectId, topic, difficulty, length, fallback, 'bank');
      })();
    },
    [begin, locale, schoolClass.grade, schoolClass.name, status],
  );

  const currentAnswer = useMemo(() => {
    if (!session) return null;
    const question = session.questions[session.index];
    if (!question) return null;
    return session.answers.find((a) => a.questionId === question.id) ?? null;
  }, [session]);

  const answer = useCallback(
    (given: string) => {
      if (!session || status === 'checking') return;
      const question = session.questions[session.index];
      if (!question) return;
      /* Already answered: the loop moves on, it does not re-mark. */
      if (session.answers.some((a) => a.questionId === question.id)) return;

      const record = (entry: QuizAnswer) => {
        setQuiz({ ...session, answers: [...session.answers, entry] });
      };

      /* A choice question is decided here. Asking a model to compare
         two option ids would be a request spent on nothing. */
      if (question.type !== 'short') {
        const correct = given === question.correctOptionId;
        record({
          questionId: question.id,
          given,
          verdict: correct ? 'correct' : 'incorrect',
          feedback: question.explanation,
          evaluatedBy: 'schoolmind',
        });
        return;
      }

      const typed = given.trim();
      if (!typed) return;

      /* A typed answer that matches the expected wording needs no
         judgement either. */
      if (looksEqual(typed, question.correctAnswer)) {
        record({
          questionId: question.id,
          given: typed,
          verdict: 'correct',
          feedback: question.explanation,
          evaluatedBy: 'schoolmind',
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus('checking');

      void (async () => {
        const response = await postCheck(
          {
            locale,
            prompt: question.prompt,
            expected: question.correctAnswer,
            given: typed,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (!response.ok) {
          /* Marking is unavailable. Say that plainly rather than
             guessing — and still show the explanation, which is the
             part the student learns from. */
          record({
            questionId: question.id,
            given: typed,
            verdict: 'unclear',
            feedback: question.explanation,
            evaluatedBy: 'schoolmind',
          });
          setError(response.error);
          setStatus('running');
          return;
        }

        record({
          questionId: question.id,
          given: typed,
          verdict: response.verdict,
          feedback: response.feedback || question.explanation,
          evaluatedBy: 'ai',
        });
        setStatus('running');
      })();
    },
    [locale, session, setQuiz, status],
  );

  const next = useCallback(() => {
    if (!session) return;
    const last = session.index >= session.questions.length - 1;

    if (!last) {
      setQuiz({ ...session, index: session.index + 1 });
      return;
    }

    const finished: QuizSession = { ...session, finishedAt: new Date().toISOString() };
    setQuiz(finished);
    setStatus('done');

    const correct = finished.answers.filter((a) => a.verdict === 'correct').length;
    recordQuiz({
      id: finished.id,
      at: finished.finishedAt ?? new Date().toISOString(),
      dateISO: todayISO(),
      subjectId: finished.subjectId,
      topic: finished.topic,
      difficulty: finished.difficulty,
      total: finished.questions.length,
      correct,
      review: finished.questions
        .filter((question) => {
          const given = finished.answers.find((a) => a.questionId === question.id);
          return !given || given.verdict !== 'correct';
        })
        .map((question) => question.prompt),
    });
  }, [recordQuiz, session, setQuiz]);

  /** Same subject, topic and settings, fresh questions. */
  const restart = useCallback(() => {
    if (!session) return;
    start(
      session.subjectId,
      session.topic,
      session.difficulty,
      (session.questions.length >= 10 ? 10 : 5) as QuizLength,
    );
  }, [session, start]);

  const discard = useCallback(() => {
    abortRef.current?.abort();
    setQuiz(null);
    setError(null);
    setStatus('setup');
  }, [setQuiz]);

  const topicsFor = useCallback(
    (subjectId: ID) => topicsBySubject.get(subjectId) ?? [],
    [topicsBySubject],
  );

  return {
    session,
    topicProblem,
    status,
    error,
    capabilities,
    subjects,
    topicsFor,
    history,
    signals,
    busy: status === 'generating' || status === 'checking',
    currentAnswer,
    start,
    answer,
    next,
    restart,
    discard,
  };
}

/** Whether SchoolMind could run this subject without the model. */
export function bankCovers(subjectId: ID): boolean {
  return bankHasSubject(subjectId);
}
