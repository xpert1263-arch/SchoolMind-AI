/* ------------------------------------------------------------------
   SchoolMind shared school domain model.

   ONE model powers both workspaces. A teacher creating an Assignment
   and a student seeing Homework are two views over the same records,
   never two parallel datasets.
   ------------------------------------------------------------------ */

export type ID = string;

export type Locale = 'uz' | 'ru';
export type Theme = 'light' | 'dark';
export type AppMode = 'student' | 'teacher';

/** A localized string. Demo content ships both languages; content a
 *  user types at runtime is a plain string. `resolveText` reads both. */
export type LocalizedText = Record<Locale, string>;
export type Text = string | LocalizedText;

export function resolveText(value: Text, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale];
}

/** 1 = Monday … 7 = Sunday (ISO weekday numbering). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface LessonSlot {
  /** Lesson period number as printed on the school timetable. */
  index: number;
  start: string; // "08:30"
  end: string; // "09:15"
}

export interface Subject {
  id: ID;
  name: LocalizedText;
  /** Two or three letter badge used in dense layouts. */
  short: string;
  /** Base hue (0–360) the subject colour system derives chips from. */
  hue: number;
}

export interface Teacher {
  id: ID;
  firstName: string;
  lastName: string;
  subjectIds: ID[];
  classIds: ID[];
  title: LocalizedText;
}

export interface SchoolClass {
  id: ID;
  /** Display name, e.g. "9-A". */
  name: string;
  grade: number;
  letter: string;
  homeroomTeacherId: ID;
  studentIds: ID[];
  room: string;
}

export interface Student {
  id: ID;
  firstName: string;
  lastName: string;
  classId: ID;
}

export interface Lesson {
  id: ID;
  classId: ID;
  subjectId: ID;
  teacherId: ID;
  weekday: Weekday;
  slot: number;
  room: string;
}

export type AssignmentKind = 'homework' | 'project' | 'test';

export interface Assignment {
  id: ID;
  kind: AssignmentKind;
  title: Text;
  description: Text;
  subjectId: ID;
  classId: ID;
  teacherId: ID;
  /** ISO calendar date, "YYYY-MM-DD". */
  dueDate: string;
  createdAt: string;
  /** Seeded demo record vs. created inside the running demo. */
  origin: 'seed' | 'teacher';
}

export type AnnouncementCategory = 'exam' | 'event' | 'schedule' | 'general';

export interface Announcement {
  id: ID;
  category: AnnouncementCategory;
  title: Text;
  body: Text;
  /** ISO calendar date. */
  date: string;
  audience: 'all' | 'students' | 'teachers';
  classId?: ID;
  pinned?: boolean;
}

export interface PersonalTask {
  id: ID;
  title: Text;
  dueDate: string;
  minutes: number;
}

/** Derived view model shared by Home, My Day and Homework. */
export type DueStatus = 'completed' | 'overdue' | 'today' | 'soon' | 'upcoming';

export interface HomeworkItem {
  assignment: Assignment;
  subject: Subject;
  teacher: Teacher;
  status: DueStatus;
  completed: boolean;
  /** Whole days from today; negative when the deadline has passed. */
  daysLeft: number;
}

export interface ScheduledLesson {
  lesson: Lesson;
  subject: Subject;
  teacher: Teacher;
  slot: LessonSlot;
}

export type ActivityKind = 'assignment_created' | 'homework_completed' | 'homework_reopened';

export interface ActivityEvent {
  id: ID;
  kind: ActivityKind;
  /** ISO timestamp. */
  at: string;
  assignmentId: ID;
  actorId: ID;
}

export interface School {
  name: LocalizedText;
  city: LocalizedText;
}
