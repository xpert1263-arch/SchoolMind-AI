import type { Locale } from '@/data/types';
import type { Translator } from '@/i18n';
import { formatDate } from '@/lib/dates';
import { SCHOOL_TOPIC, TIME_CUES, WEEKDAY_CUES } from '@/lib/ask/lexicon';
import { detectSubjectId } from '@/lib/ask/subjectMatch';
import { hasStem, normalise } from '@/lib/ask/text';

/* ------------------------------------------------------------------
   The school facts a teacher may be told, and the deterministic
   answers that need no model at all.

   Teacher AI routes the same way AskMySchool does: a question about a
   SchoolMind record is answered FROM the record. Asking a model to
   paraphrase a list of deadlines would spend a request to make the
   answer less reliable, so these answers never leave the browser.

   Everything here is built from what the signed-in teacher is already
   authorised to see — their classes, their subjects, their own
   assignments. There is no path to another teacher's data, because no
   other teacher's data is in the object.
   ------------------------------------------------------------------ */

export interface TeacherFactLesson {
  time: string;
  classLabel: string;
  subject: string;
  room: string;
}

export interface TeacherFactAssignment {
  title: string;
  classLabel: string;
  subjectId: string;
  subject: string;
  kind: 'homework' | 'project' | 'test';
  dueDate: string;
  daysLeft: number;
}

export interface TeacherFactClass {
  id: string;
  label: string;
  grade: number;
  students: number;
  subjects: string[];
}

export interface TeacherFacts {
  teacherName: string;
  schoolName: string;
  subjects: string[];
  classes: TeacherFactClass[];
  todayLessons: TeacherFactLesson[];
  assignments: TeacherFactAssignment[];
}

/* ---- the model's context block ------------------------------------- */

/**
 * The authoritative block sent with a chat question. Compact on
 * purpose: it is context for phrasing, and every line of it is a real
 * record.
 */
export function buildTeacherContext(facts: TeacherFacts, t: Translator, locale: Locale): string {
  const lines: string[] = [
    `TEACHER: ${facts.teacherName}`,
    `SCHOOL: ${facts.schoolName}`,
    `SUBJECTS: ${facts.subjects.join(', ') || '—'}`,
    `CLASSES: ${facts.classes.map((c) => `${c.label} (${c.students})`).join(', ') || '—'}`,
  ];

  if (facts.todayLessons.length > 0) {
    lines.push(
      `TODAY: ${facts.todayLessons
        .map((l) => `${l.time} ${l.classLabel} ${l.subject} (${t('common.room')} ${l.room})`)
        .join('; ')}`,
    );
  }

  const open = facts.assignments.filter((a) => a.daysLeft >= 0).slice(0, 8);
  if (open.length > 0) {
    lines.push(
      `OPEN WORK SET BY THIS TEACHER: ${open
        .map(
          (a) =>
            `${a.title} — ${a.classLabel}, ${a.subject}, ${formatDate(a.dueDate, locale)}`,
        )
        .join('; ')}`,
    );
  }

  return lines.join('\n');
}

/* ---- deterministic answers ----------------------------------------- */

const LESSON_STEMS = [...SCHOOL_TOPIC.lesson];
const WORK_STEMS = [...SCHOOL_TOPIC.homework, ...SCHOOL_TOPIC.test];
const CLASS_STEMS = ['sinf', 'класс', 'sinflarim', 'sinflarimni'];
const COUNT_STEMS = ['nechta', 'necha', 'qancha', 'сколько'];

function dueLabel(entry: TeacherFactAssignment, t: Translator, locale: Locale): string {
  if (entry.daysLeft < 0) return t('teacherAi.facts.overdue');
  if (entry.daysLeft === 0) return t('teacherAi.facts.dueToday');
  if (entry.daysLeft === 1) return t('teacherAi.facts.dueTomorrow');
  return formatDate(entry.dueDate, locale);
}

/**
 * Answers from SchoolMind's own records, or returns null when the
 * question is not about one — in which case the caller asks a
 * provider, with these facts attached as context.
 */
export function answerFromTeacherFacts(
  question: string,
  facts: TeacherFacts,
  t: Translator,
  locale: Locale,
): string[] | null {
  const text = normalise(question);

  const aboutLessons = hasStem(text, LESSON_STEMS);
  const aboutWork = hasStem(text, WORK_STEMS);
  const aboutClasses = hasStem(text, CLASS_STEMS);
  const counting = hasStem(text, COUNT_STEMS);
  const today = hasStem(text, [...TIME_CUES.today]);
  const tomorrow = hasStem(text, [...TIME_CUES.tomorrow]);
  const namedWeekday = WEEKDAY_CUES.find((cue) => hasStem(text, cue.stems));
  const namedSubjectId = detectSubjectId(text);

  /* A named class in the question narrows every answer below. */
  const namedClass = facts.classes.find((entry) =>
    text.includes(entry.label.toLowerCase().replace('-', '-')),
  );

  if (aboutLessons && (today || (!tomorrow && !namedWeekday))) {
    /* Only today's timetable is in `facts`; a question about another
       day is better served by the Schedule screen than by a guess. */
    if (facts.todayLessons.length === 0) {
      return [t('teacherAi.facts.noLessonsToday')];
    }
    const rows = facts.todayLessons
      .filter((l) => !namedClass || l.classLabel === namedClass.label)
      .map((l) => `- ${l.time} · ${l.classLabel} · ${l.subject} · ${t('common.room')} ${l.room}`);
    return rows.length > 0
      ? [t('teacherAi.facts.todayTitle'), rows.join('\n')]
      : [t('teacherAi.facts.noLessonsToday')];
  }

  if (aboutWork) {
    const open = facts.assignments
      .filter((a) => a.daysLeft >= 0)
      .filter((a) => !namedClass || a.classLabel === namedClass.label)
      .filter((a) => !namedSubjectId || a.subjectId === namedSubjectId)
      .slice(0, 8);

    if (open.length === 0) return [t('teacherAi.facts.noOpenWork')];

    if (counting) {
      return [t('teacherAi.facts.openCount', { n: open.length })];
    }

    return [
      t('teacherAi.facts.openTitle'),
      open
        .map(
          (a) =>
            `- ${a.title} · ${a.classLabel} · ${a.subject} · ${dueLabel(a, t, locale)}`,
        )
        .join('\n'),
    ];
  }

  if (aboutClasses) {
    if (facts.classes.length === 0) return [t('teacherAi.facts.noClasses')];
    if (counting) {
      return [
        t('teacherAi.facts.classCount', {
          n: facts.classes.length,
          list: facts.classes.map((c) => c.label).join(', '),
        }),
      ];
    }
    return [
      t('teacherAi.facts.classesTitle'),
      facts.classes
        .map(
          (c) =>
            `- ${c.label} · ${t('teacherAi.facts.pupils', { n: c.students })} · ${c.subjects.join(', ')}`,
        )
        .join('\n'),
    ];
  }

  return null;
}
