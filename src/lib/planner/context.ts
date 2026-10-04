import { school } from '@/data/school';
import { lessonsOfClass, subjectById } from '@/data/queries';
import { resolveText } from '@/data/types';
import type { Assignment, HomeworkItem, ID, Locale, SchoolClass } from '@/data/types';
import { addDays, formatDate, formatLongDate, minutesOf, nowMinutes, today, todayISO, weekdayOf } from '@/lib/dates';
import type { Intensity, PlannerContext, PlannerTask, Priority } from './types';

/* ------------------------------------------------------------------
   Deterministic planner context.

   Built entirely from SchoolMind records before any model is called.
   Whatever is not in here cannot legitimately appear in a plan.
   ------------------------------------------------------------------ */

/** A test two days out matters more than homework due next week. */
function urgencyOf(item: HomeworkItem): Priority {
  if (item.daysLeft < 0) return 'high';
  if (item.daysLeft === 0) return 'high';
  if (item.assignment.kind === 'test' && item.daysLeft <= 2) return 'high';
  if (item.daysLeft === 1) return 'medium';
  if (item.assignment.kind === 'test' && item.daysLeft <= 5) return 'medium';
  return 'low';
}

const URGENCY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** How far ahead work is worth planning for. Beyond this it is not
 *  today's problem, and padding the plan with it would be noise. */
const HOMEWORK_HORIZON_DAYS = 7;
const TEST_HORIZON_DAYS = 10;

function withinHorizon(item: HomeworkItem): boolean {
  if (item.completed) return false;
  const horizon = item.assignment.kind === 'test' ? TEST_HORIZON_DAYS : HOMEWORK_HORIZON_DAYS;
  return item.daysLeft <= horizon;
}

export function buildPlannerTasks(items: HomeworkItem[], locale: Locale): PlannerTask[] {
  return items
    .filter(withinHorizon)
    .map((item) => ({
      id: item.assignment.id,
      kind: item.assignment.kind,
      title: resolveText(item.assignment.title, locale),
      subjectId: item.subject.id,
      subjectName: resolveText(item.subject.name, locale),
      dueDate: item.assignment.dueDate,
      daysLeft: item.daysLeft,
      urgency: urgencyOf(item),
      overdue: item.daysLeft < 0,
      description: resolveText(item.assignment.description, locale).slice(0, 180),
    }))
    .sort(
      (a, b) =>
        URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] ||
        a.daysLeft - b.daysLeft ||
        a.title.localeCompare(b.title),
    )
    /* A believable evening, not an exhaustive backlog. */
    .slice(0, 8);
}

/**
 * When study can realistically begin: the next ten-minute mark, but
 * never before the last lesson of the day has finished.
 */
export function studyStartTime(classId: ID): string {
  const lessons = lessonsOfClass(classId, weekdayOf(today()));
  const lastEnd = lessons.length > 0 ? minutesOf(lessons[lessons.length - 1].slot.end) : 0;
  /* Half an hour to get home and eat before anything starts. */
  const earliest = lastEnd > 0 ? lastEnd + 30 : 0;
  const start = Math.max(nowMinutes(), earliest);
  const rounded = Math.ceil(start / 10) * 10;
  const clamped = Math.min(rounded, 21 * 60);
  return `${`${Math.floor(clamped / 60)}`.padStart(2, '0')}:${`${clamped % 60}`.padStart(2, '0')}`;
}

function lessonLines(classId: ID, dayOffset: number, locale: Locale): string[] {
  const date = addDays(today(), dayOffset);
  return lessonsOfClass(classId, weekdayOf(date)).map(
    (entry) =>
      `${entry.slot.start} ${resolveText(entry.subject.name, locale)} (${entry.lesson.room})`,
  );
}

export interface PlannerContextInput {
  locale: Locale;
  schoolClass: SchoolClass;
  studentName: string;
  items: HomeworkItem[];
  availableMinutes: number;
  intensity: Intensity;
}

export function buildPlannerContext(input: PlannerContextInput): PlannerContext {
  const { locale, schoolClass, studentName, availableMinutes, intensity } = input;
  const dateISO = todayISO();

  return {
    locale,
    dateISO,
    dateLabel: formatLongDate(dateISO, locale),
    weekdayLabel: formatDate(dateISO, locale, { weekday: 'long' }),
    startTime: studyStartTime(schoolClass.id),
    studentName,
    className: schoolClass.name,
    schoolName: resolveText(school.name, locale),
    availableMinutes,
    intensity,
    tasks: buildPlannerTasks(input.items, locale),
    lessonsToday: lessonLines(schoolClass.id, 0, locale),
    /* Tomorrow's timetable is what makes "do physics first, you have
       it first period" a real reason rather than a guess. */
    lessonsTomorrow: lessonLines(schoolClass.id, 1, locale),
  };
}

/** Assignment ids a plan is allowed to reference. */
export function allowedIds(tasks: PlannerTask[]): Set<ID> {
  return new Set(tasks.map((task) => task.id));
}

/** Resolves a plan item back to the live record, so a rendered plan
 *  follows the shared data rather than a snapshot of it. */
export function assignmentOf(
  assignments: Assignment[],
  id: ID | null,
): Assignment | undefined {
  if (!id) return undefined;
  return assignments.find((a) => a.id === id);
}

export function subjectNameOf(subjectId: ID | null, locale: Locale): string | null {
  if (!subjectId) return null;
  try {
    return resolveText(subjectById(subjectId).name, locale);
  } catch {
    return null;
  }
}
