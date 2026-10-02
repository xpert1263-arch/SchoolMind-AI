import {
  classes,
  lessons,
  lessonSlots,
  students,
  subjects,
  teachers,
} from './school';
import type {
  Assignment,
  HomeworkItem,
  ID,
  Lesson,
  LessonSlot,
  ScheduledLesson,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  Weekday,
} from './types';
import { daysFromToday, dueStatusOf, minutesOf } from '@/lib/dates';

/* Pure lookups over the shared dataset. Both workspaces read from here,
   which is what keeps "teacher creates" and "student sees" in sync. */

const index = <T extends { id: ID }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

const subjectIndex = index(subjects);
const teacherIndex = index(teachers);
const classIndex = index(classes);
const studentIndex = index(students);
const slotIndex = new Map(lessonSlots.map((s) => [s.index, s]));

export function subjectById(id: ID): Subject {
  const found = subjectIndex.get(id);
  if (!found) throw new Error(`Unknown subject: ${id}`);
  return found;
}

export function teacherById(id: ID): Teacher {
  const found = teacherIndex.get(id);
  if (!found) throw new Error(`Unknown teacher: ${id}`);
  return found;
}

export function classById(id: ID): SchoolClass {
  const found = classIndex.get(id);
  if (!found) throw new Error(`Unknown class: ${id}`);
  return found;
}

export function studentById(id: ID): Student {
  const found = studentIndex.get(id);
  if (!found) throw new Error(`Unknown student: ${id}`);
  return found;
}

export function slotByIndex(n: number): LessonSlot {
  const found = slotIndex.get(n);
  if (!found) throw new Error(`Unknown lesson slot: ${n}`);
  return found;
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function initialsOf(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}

export function studentsOfClass(classId: ID): Student[] {
  return students.filter((s) => s.classId === classId);
}

/* ---- timetable ----------------------------------------------------- */

export function decorate(lesson: Lesson): ScheduledLesson {
  return {
    lesson,
    subject: subjectById(lesson.subjectId),
    teacher: teacherById(lesson.teacherId),
    slot: slotByIndex(lesson.slot),
  };
}

const bySlot = (a: ScheduledLesson, b: ScheduledLesson) =>
  minutesOf(a.slot.start) - minutesOf(b.slot.start);

const lessonIndex = new Map(lessons.map((l) => [l.id, l]));

/** Decorated lesson by id — used when an answer references one. */
export function scheduledLessonById(id: ID): ScheduledLesson | undefined {
  const lesson = lessonIndex.get(id);
  return lesson ? decorate(lesson) : undefined;
}

export function lessonsOfClass(classId: ID, weekday: Weekday): ScheduledLesson[] {
  return lessons
    .filter((l) => l.classId === classId && l.weekday === weekday)
    .map(decorate)
    .sort(bySlot);
}

export function lessonsOfTeacher(teacherId: ID, weekday: Weekday): ScheduledLesson[] {
  return lessons
    .filter((l) => l.teacherId === teacherId && l.weekday === weekday)
    .map(decorate)
    .sort(bySlot);
}

export function teacherHasLessonsOn(teacherId: ID, weekday: Weekday): boolean {
  return lessons.some((l) => l.teacherId === teacherId && l.weekday === weekday);
}

export function classHasLessonsOn(classId: ID, weekday: Weekday): boolean {
  return lessons.some((l) => l.classId === classId && l.weekday === weekday);
}

/* ---- assignments --------------------------------------------------- */

export function toHomeworkItem(assignment: Assignment, completedIds: ID[]): HomeworkItem {
  const completed = completedIds.includes(assignment.id);
  return {
    assignment,
    subject: subjectById(assignment.subjectId),
    teacher: teacherById(assignment.teacherId),
    completed,
    status: dueStatusOf(assignment.dueDate, completed),
    daysLeft: daysFromToday(assignment.dueDate),
  };
}

/** Open work first, nearest deadline on top; finished work drops below. */
export function sortHomework(items: HomeworkItem[]): HomeworkItem[] {
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.completed) return b.assignment.dueDate.localeCompare(a.assignment.dueDate);
    return a.assignment.dueDate.localeCompare(b.assignment.dueDate);
  });
}

export function assignmentsForClass(all: Assignment[], classId: ID): Assignment[] {
  return all.filter((a) => a.classId === classId);
}

export function isActiveAssignment(a: Assignment): boolean {
  return daysFromToday(a.dueDate) >= 0;
}

/** Share of a class's active assignments a student has ticked off. */
export function completionFor(
  studentClassId: ID,
  all: Assignment[],
  completedIds: ID[],
): { done: number; total: number; percent: number } {
  const relevant = all.filter((a) => a.classId === studentClassId && a.kind !== 'test');
  const done = relevant.filter((a) => completedIds.includes(a.id)).length;
  const total = relevant.length;
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/* ---- per-student demo progress -------------------------------------
   The running demo only tracks the signed-in student's real state. So
   the rest of the roster gets a *stable* pseudo-random completion
   derived from (studentId, assignmentId) — demo data, not analytics.
   Assignments created during the demo start out incomplete for
   everyone, which is what a teacher would actually expect to see. */

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Avalanche step: without it the trailing characters dominate and
  // every student ends up with an identical pattern.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function demoCompletedIdsFor(studentId: ID, all: Assignment[]): ID[] {
  return all
    .filter((a) => a.origin === 'seed' && hash(`${studentId}:${a.id}`) > 0.38)
    .map((a) => a.id);
}
