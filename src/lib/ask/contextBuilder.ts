import { announcements as allAnnouncements } from '@/data/school';
import { lessonsOfClass, subjectById } from '@/data/queries';
import { resolveText, type Assignment, type ID, type Locale, type SchoolClass } from '@/data/types';
import { addDays, daysFromToday, formatDate, todayISO, toISODate, weekdayOf } from '@/lib/dates';
import { detectSubjectId } from './subjectMatch';
import { normalise } from './text';
import type { AskFocus } from './types';

/* ------------------------------------------------------------------
   Compact context builder.

   The model never receives the dataset. It receives a few lines that
   are actually relevant to the question — the student's class, the
   day in question, the subject in question, and nothing else.
   ------------------------------------------------------------------ */

const MAX_LINES = 30;

export interface ContextInput {
  question: string;
  locale: Locale;
  schoolClass: SchoolClass;
  studentName: string;
  assignments: Assignment[];
  completedIds: ID[];
  focus: AskFocus;
  /** Facts the school engine already resolved, if any. */
  factSummary?: string;
}

export function buildSchoolContext(input: ContextInput): string {
  const { locale, schoolClass, studentName, assignments, completedIds, focus } = input;
  const text = normalise(input.question);
  const subjectId = detectSubjectId(text) ?? focus.subjectId;

  const lines: string[] = [
    `Student: ${studentName}, class ${schoolClass.name} (${schoolClass.studentIds.length} students, room ${schoolClass.room}).`,
    `Today: ${todayISO()} (${formatDate(todayISO(), locale, { weekday: 'long', day: 'numeric', month: 'long' })}).`,
  ];

  if (input.factSummary) {
    lines.push('Resolved school facts:', input.factSummary);
  }

  if (subjectId) {
    const subject = subjectById(subjectId);
    lines.push(`Subject in question: ${subject.name[locale]}.`);

    /* Next two lessons of that subject, so the model can talk about
       "before your next lesson" without inventing a time. */
    const upcoming: string[] = [];
    for (let i = 0; i < 14 && upcoming.length < 2; i += 1) {
      const date = addDays(new Date(), i);
      for (const entry of lessonsOfClass(schoolClass.id, weekdayOf(date))) {
        if (entry.subject.id !== subjectId) continue;
        upcoming.push(`${toISODate(date)} ${entry.slot.start} room ${entry.lesson.room}`);
        if (upcoming.length >= 2) break;
      }
    }
    if (upcoming.length) lines.push(`Upcoming ${subject.name[locale]} lessons: ${upcoming.join('; ')}.`);

    const related = assignments.filter(
      (a) => a.classId === schoolClass.id && a.subjectId === subjectId && daysFromToday(a.dueDate) >= -3,
    );
    for (const a of related.slice(0, 4)) {
      lines.push(
        `${a.kind === 'test' ? 'Test' : 'Homework'}: "${resolveText(a.title, locale)}" due ${a.dueDate}${
          completedIds.includes(a.id) ? ' (completed)' : ''
        } — ${resolveText(a.description, locale)}`,
      );
    }
  } else {
    /* No subject in play: a thin slice of what is due soon is enough
       for the model to stay oriented. */
    const soon = assignments
      .filter((a) => a.classId === schoolClass.id && daysFromToday(a.dueDate) >= 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 4);
    for (const a of soon) {
      lines.push(
        `${a.kind === 'test' ? 'Test' : 'Homework'}: "${resolveText(a.title, locale)}" (${
          subjectById(a.subjectId).name[locale]
        }) due ${a.dueDate}${completedIds.includes(a.id) ? ' (completed)' : ''}`,
      );
    }
  }

  const pinned = allAnnouncements.filter(
    (a) => (!a.classId || a.classId === schoolClass.id) && daysFromToday(a.date) >= -3,
  );
  for (const a of pinned.slice(0, 2)) {
    lines.push(`Announcement (${a.date}): ${resolveText(a.title, locale)}`);
  }

  return lines.slice(0, MAX_LINES).join('\n');
}
