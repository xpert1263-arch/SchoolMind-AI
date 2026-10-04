import { useCallback, useMemo, useState } from 'react';
import { classById, fullName, studentsOfClass, subjectById } from '@/data/queries';
import { subjectIdsTaughtBy } from '@/data/school';
import { resolveText, type Announcement, type ID } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { todayISO } from '@/lib/dates';
import { postTeacherAi } from '@/lib/teacherAi/client';
import { useCurrentStudent, useCurrentTeacher } from '@/state/selectors';
import { useApp } from '@/state/store';
import { buildResults, deterministicSummary, summaryEvidence } from './engine';
import type {
  ClassPulse,
  ClassPulseResponse,
  PulseResults,
  PulseStatus,
  PulseSummary,
  PulseType,
} from './types';

/* ------------------------------------------------------------------
   ClassPulse, both sides of it.

   The pulses themselves live in the shared half of the store, beside
   teacher-created assignments, because that is what makes the demo
   real: the teacher writes one record, and the pupils who answer it
   are answering that same record, not a copy. Sign out, sign in as
   someone else, and the question is still there.

   Identity is never taken from a form. A response is stamped with the
   signed-in pupil's id, and a teacher only ever sees the classes
   their own teaching rows cover.
   ------------------------------------------------------------------ */

function newId(prefix: string): ID {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The notification a pulse raises when it goes live. Its id is
 *  derived from the pulse, so activating twice cannot produce two. */
export function pulseAnnouncement(
  pulse: ClassPulse,
  subjectName: string,
  title: string,
  body: string,
): Announcement {
  return {
    id: `pulse-${pulse.id}`,
    category: 'general',
    title,
    body: `${subjectName} · ${body}`,
    date: pulse.dateISO,
    audience: 'students',
    classId: pulse.classId,
  };
}

/* ---- teacher --------------------------------------------------------- */

export interface PulseDraft {
  classId: ID;
  subjectId: ID;
  topic: string;
  type: PulseType;
  question: string;
  options: string[];
  /** Index into `options`, or null for an opinion poll. */
  correctIndex: number | null;
}

export interface UseTeacherPulse {
  classes: Array<{ id: ID; label: string; students: number }>;
  subjectsFor: (classId: ID) => Array<{ id: ID; name: string }>;
  /** This teacher's own pulses, newest first. */
  pulses: ClassPulse[];
  resultsFor: (pulse: ClassPulse) => PulseResults;
  create: (draft: PulseDraft) => ClassPulse | null;
  activate: (pulse: ClassPulse) => void;
  close: (pulse: ClassPulse) => void;
  /** The counted summary — no model, no network. */
  summaryFor: (pulse: ClassPulse) => string;
  /** The optional AI reading of the same evidence. */
  analyse: (pulse: ClassPulse) => void;
  analysis: PulseSummary | null;
  analysing: boolean;
  analysisError: string | null;
  clearAnalysis: () => void;
}

export function useTeacherPulse(): UseTeacherPulse {
  const { t, locale } = useI18n();
  const { state, createPulse, setPulseStatus } = useApp();
  const { teacher, taughtClasses } = useCurrentTeacher();

  const [analysis, setAnalysis] = useState<PulseSummary | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const classes = useMemo(
    () =>
      taughtClasses.map((schoolClass) => ({
        id: schoolClass.id,
        label: schoolClass.name,
        students: schoolClass.studentIds.length,
      })),
    [taughtClasses],
  );

  const subjectsFor = useCallback(
    (classId: ID) =>
      subjectIdsTaughtBy(teacher.id, classId).map((id) => ({
        id,
        name: resolveText(subjectById(id).name, locale),
      })),
    [locale, teacher.id],
  );

  /* Only this teacher's own pulses. Another teacher's question is not
     theirs to read, close, or analyse. */
  const pulses = useMemo(
    () =>
      state.pulses
        .filter((pulse) => pulse.teacherId === teacher.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.pulses, teacher.id],
  );

  const resultsFor = useCallback(
    (pulse: ClassPulse) =>
      buildResults(
        pulse,
        state.pulseResponses,
        studentsOfClass(pulse.classId).map((student) => ({
          id: student.id,
          name: fullName(student),
        })),
        t,
      ),
    [state.pulseResponses, t],
  );

  const create = useCallback(
    (draft: PulseDraft): ClassPulse | null => {
      /* The authorisation that matters, checked against the teaching
         table rather than against what the form offered. */
      const allowed =
        taughtClasses.some((entry) => entry.id === draft.classId) &&
        subjectIdsTaughtBy(teacher.id, draft.classId).includes(draft.subjectId);
      if (!allowed) return null;

      const topic = draft.topic.trim();
      if (!topic) return null;

      const options =
        draft.type === 'mcq'
          ? draft.options
              .map((text) => text.trim())
              .filter(Boolean)
              .map((text, i) => ({ id: `o${i}`, text }))
          : [];

      if (draft.type === 'mcq' && options.length < 2) return null;
      if (draft.type !== 'understanding' && !draft.question.trim()) return null;

      const pulse: ClassPulse = {
        id: newId('pulse'),
        teacherId: teacher.id,
        classId: draft.classId,
        subjectId: draft.subjectId,
        topic,
        type: draft.type,
        question: draft.type === 'understanding' ? '' : draft.question.trim(),
        options,
        correctOptionId:
          draft.type === 'mcq' && draft.correctIndex !== null && options[draft.correctIndex]
            ? options[draft.correctIndex].id
            : null,
        /* Written, not live. Nothing reaches a pupil until the
           teacher says so. */
        status: 'draft',
        createdAt: new Date().toISOString(),
        dateISO: todayISO(),
        activatedAt: null,
        closedAt: null,
      };

      createPulse(pulse);
      return pulse;
    },
    [createPulse, taughtClasses, teacher.id],
  );

  const activate = useCallback(
    (pulse: ClassPulse) => {
      if (pulse.teacherId !== teacher.id) return;
      const subjectName = resolveText(subjectById(pulse.subjectId).name, locale);
      setPulseStatus(
        pulse.id,
        'active',
        pulseAnnouncement(
          pulse,
          subjectName,
          t('pulse.notifyTitle', { subject: subjectName }),
          t('pulse.notifyBody', { topic: pulse.topic }),
        ),
      );
    },
    [locale, setPulseStatus, t, teacher.id],
  );

  const close = useCallback(
    (pulse: ClassPulse) => {
      if (pulse.teacherId !== teacher.id) return;
      setPulseStatus(pulse.id, 'closed');
    },
    [setPulseStatus, teacher.id],
  );

  const summaryFor = useCallback(
    (pulse: ClassPulse) => deterministicSummary(resultsFor(pulse), t),
    [resultsFor, t],
  );

  const analyse = useCallback(
    (pulse: ClassPulse) => {
      if (analysing || pulse.teacherId !== teacher.id) return;
      const results = resultsFor(pulse);
      if (results.responded === 0) return;

      setAnalysing(true);
      setAnalysisError(null);

      void (async () => {
        const response = await postTeacherAi({
          action: 'pulse',
          locale,
          teacherId: teacher.id,
          teacherName: fullName(teacher),
          classId: pulse.classId,
          classLabel: classById(pulse.classId).name,
          subjectId: pulse.subjectId,
          subject: resolveText(subjectById(pulse.subjectId).name, locale),
          topic: pulse.topic,
          evidence: summaryEvidence(results),
        });

        setAnalysing(false);

        if (!response.ok || !response.chat?.text) {
          /* The counted summary is always there, so a failed analysis
             costs the teacher nothing but the extra reading. */
          setAnalysisError(t('pulse.analysisFailed'));
          return;
        }
        setAnalysis({
          pulseId: pulse.id,
          text: response.chat.text,
          source: 'ai',
          at: new Date().toISOString(),
        });
      })();
    },
    [analysing, locale, resultsFor, t, teacher],
  );

  return {
    classes,
    subjectsFor,
    pulses,
    resultsFor,
    create,
    activate,
    close,
    summaryFor,
    analyse,
    analysis,
    analysing,
    analysisError,
    clearAnalysis: () => {
      setAnalysis(null);
      setAnalysisError(null);
    },
  };
}

/* ---- student --------------------------------------------------------- */

export interface StudentPulseItem {
  pulse: ClassPulse;
  subjectName: string;
  /** This pupil's own answer, if they have given one. */
  answer: ClassPulseResponse | null;
}

export interface UseStudentPulse {
  /** Active pulses for this pupil's class, newest first. */
  items: StudentPulseItem[];
  answer: (pulse: ClassPulse, value: string) => void;
}

export function useStudentPulse(): UseStudentPulse {
  const { locale } = useI18n();
  const { state, answerPulse } = useApp();
  const { student, schoolClass } = useCurrentStudent();

  const items = useMemo(
    () =>
      state.pulses
        .filter((pulse) => pulse.status === 'active' && pulse.classId === schoolClass.id)
        .slice()
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((pulse) => ({
          pulse,
          subjectName: resolveText(subjectById(pulse.subjectId).name, locale),
          answer:
            state.pulseResponses.find(
              (entry) => entry.pulseId === pulse.id && entry.studentId === student.id,
            ) ?? null,
        })),
    [locale, schoolClass.id, state.pulseResponses, state.pulses, student.id],
  );

  const answer = useCallback(
    (pulse: ClassPulse, value: string) => {
      const text = value.trim();
      if (!text) return;
      /* A pupil may only answer a live question set for their own
         class, and only ever as themselves. */
      if (pulse.status !== 'active' || pulse.classId !== schoolClass.id) return;

      answerPulse({
        id: newId('pr'),
        pulseId: pulse.id,
        studentId: student.id,
        answer: text,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      });
    },
    [answerPulse, schoolClass.id, student.id],
  );

  return { items, answer };
}

export type { PulseStatus };
