import { useMemo } from 'react';
import {
  announcements,
  classes,
  DEMO_STUDENT_ID,
  DEMO_TEACHER_ID,
  personalTasks,
  seedAssignments,
} from '@/data/school';
import {
  assignmentsForClass,
  classById,
  completionFor,
  demoCompletedIdsFor,
  lessonsOfClass,
  lessonsOfTeacher,
  sortHomework,
  studentById,
  studentsOfClass,
  teacherById,
  toHomeworkItem,
} from '@/data/queries';
import type {
  Announcement,
  Assignment,
  HomeworkItem,
  ID,
  PersonalTask,
  ScheduledLesson,
  SchoolClass,
  Student,
  Teacher,
} from '@/data/types';
import {
  addDays,
  daysFromToday,
  minutesOf,
  nextTeachingDayISO,
  nowMinutes,
  today,
  toISODate,
  todayISO,
  weekdayOf,
  weekdayOfISO,
} from '@/lib/dates';
import { useSession } from '@/auth/AuthProvider';
import { useApp, type AppState } from './store';

/* Everything the screens render is derived here, from one assignment
   list that merges the seeded dataset with what the teacher creates. */

export function useAllAssignments(): Assignment[] {
  const { state } = useApp();
  return useMemo(
    () => [...state.createdAssignments, ...seedAssignments],
    [state.createdAssignments],
  );
}

/* The signed-in identity, with the demo account as the fallback so a
   screen rendered outside a session (or the other workspace's topbar)
   still has somebody to show. */

export function useCurrentStudentId(): ID {
  const session = useSession();
  return session?.role === 'student' ? session.userId : DEMO_STUDENT_ID;
}

export function useCurrentTeacherId(): ID {
  const session = useSession();
  return session?.role === 'teacher' ? session.userId : DEMO_TEACHER_ID;
}

export function useCurrentStudent(): { student: Student; schoolClass: SchoolClass } {
  const id = useCurrentStudentId();
  return useMemo(() => {
    const student = studentById(id);
    return { student, schoolClass: classById(student.classId) };
  }, [id]);
}

export function useCurrentTeacher(): { teacher: Teacher; taughtClasses: SchoolClass[] } {
  const id = useCurrentTeacherId();
  return useMemo(() => {
    const teacher = teacherById(id);
    return {
      teacher,
      taughtClasses: classes.filter((c) => teacher.classIds.includes(c.id)),
    };
  }, [id]);
}

/* ---- student ------------------------------------------------------- */

/** Every assignment addressed to the signed-in student's class. */
export function useStudentItems(): HomeworkItem[] {
  const { user } = useApp();
  const all = useAllAssignments();
  const { schoolClass } = useCurrentStudent();
  return useMemo(
    () =>
      sortHomework(
        assignmentsForClass(all, schoolClass.id).map((a) =>
          toHomeworkItem(a, user.completedAssignmentIds),
        ),
      ),
    [all, schoolClass.id, user.completedAssignmentIds],
  );
}

/** Homework and projects — the Homework screen's list. */
export function useStudentHomework(): HomeworkItem[] {
  const items = useStudentItems();
  return useMemo(() => items.filter((i) => i.assignment.kind !== 'test'), [items]);
}

/** Upcoming tests, nearest first. */
export function useStudentTests(): HomeworkItem[] {
  const items = useStudentItems();
  return useMemo(
    () =>
      items
        .filter((i) => i.assignment.kind === 'test' && i.daysLeft >= 0)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [items],
  );
}

export interface DayTimeline {
  lessons: ScheduledLesson[];
  /** Lesson happening right now, if the demo is running during school hours. */
  currentLessonId: ID | null;
  nextLesson: ScheduledLesson | null;
  nextTeachingDay: string | null;
}

function buildTimeline(dayLessons: ScheduledLesson[], isToday: boolean): DayTimeline {
  if (!isToday) {
    return {
      lessons: dayLessons,
      currentLessonId: null,
      nextLesson: dayLessons[0] ?? null,
      nextTeachingDay: null,
    };
  }
  const now = nowMinutes();
  const current =
    dayLessons.find((l) => now >= minutesOf(l.slot.start) && now <= minutesOf(l.slot.end)) ?? null;
  const next = dayLessons.find((l) => minutesOf(l.slot.start) > now) ?? null;
  return {
    lessons: dayLessons,
    currentLessonId: current?.lesson.id ?? null,
    nextLesson: current ?? next,
    nextTeachingDay:
      dayLessons.length === 0 || (!current && !next)
        ? nextTeachingDayISO(isoTomorrow())
        : null,
  };
}

function isoTomorrow(): string {
  /* Counted from the demo clock, like every other date on screen. */
  return toISODate(addDays(today(), 1));
}

export function useStudentToday(): DayTimeline {
  const { schoolClass } = useCurrentStudent();
  return useMemo(() => {
    const weekday = weekdayOf(today());
    return buildTimeline(lessonsOfClass(schoolClass.id, weekday), true);
  }, [schoolClass.id]);
}

export function useClassDay(classId: ID, dateISO: string): ScheduledLesson[] {
  return useMemo(() => lessonsOfClass(classId, weekdayOfISO(dateISO)), [classId, dateISO]);
}

/** What Student Home surfaces as "today's priorities". */
export function useTodayPriorities(): HomeworkItem[] {
  const items = useStudentItems();
  return useMemo(() => {
    const open = items.filter((i) => !i.completed);
    const overdue = open.filter((i) => i.daysLeft < 0);
    const dueToday = open.filter((i) => i.daysLeft === 0);
    const imminentTests = open.filter(
      (i) => i.assignment.kind === 'test' && i.daysLeft > 0 && i.daysLeft <= 2,
    );
    const finishedToday = items.filter((i) => i.completed && i.daysLeft >= 0 && i.daysLeft <= 1);
    return [...overdue, ...dueToday, ...imminentTests, ...finishedToday].slice(0, 5);
  }, [items]);
}

export interface StudentMetrics {
  lessonsToday: number;
  dueCount: number;
  testCount: number;
  completedCount: number;
  totalCount: number;
}

export function useStudentMetrics(): StudentMetrics {
  const items = useStudentItems();
  const today = useStudentToday();
  return useMemo(() => {
    const homework = items.filter((i) => i.assignment.kind !== 'test');
    return {
      lessonsToday: today.lessons.length,
      dueCount: homework.filter((i) => !i.completed && i.daysLeft <= 0).length,
      testCount: items.filter((i) => i.assignment.kind === 'test' && i.daysLeft >= 0).length,
      completedCount: homework.filter((i) => i.completed).length,
      totalCount: homework.length,
    };
  }, [items, today.lessons.length]);
}

export interface PersonalTaskItem {
  task: PersonalTask;
  completed: boolean;
}

export function usePersonalTasks(): PersonalTaskItem[] {
  const { user } = useApp();
  return useMemo(
    () =>
      personalTasks.map((task) => ({
        task,
        completed: user.completedTaskIds.includes(task.id),
      })),
    [user.completedTaskIds],
  );
}

/** Seeded notices plus anything the running demo raised — today, a
 *  ClassPulse going live. Newest first, pinned items ahead of the
 *  rest, exactly as the seeded list is already ordered. */
function useAllAnnouncements(): Announcement[] {
  const { state } = useApp();
  return useMemo(() => {
    if (state.createdAnnouncements.length === 0) return announcements;
    return [...state.createdAnnouncements, ...announcements].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
      return b.date.localeCompare(a.date);
    });
  }, [state.createdAnnouncements]);
}

export function useAnnouncements(limit?: number): Announcement[] {
  const { schoolClass } = useCurrentStudent();
  const all = useAllAnnouncements();
  return useMemo(() => {
    const visible = all.filter((a) => !a.classId || a.classId === schoolClass.id);
    return typeof limit === 'number' ? visible.slice(0, limit) : visible;
  }, [all, schoolClass.id, limit]);
}

/* ---- notifications --------------------------------------------------
   What the bell shows, and how many of them this person has not opened
   yet. Audience and class are both respected, so a teacher is not shown
   a note addressed to one class's students. */

/** How many notifications the panel lists, and therefore how many one
 *  visit can mark as read. */
const NOTIFICATION_LIMIT = 6;

export interface Notifications {
  items: Announcement[];
  unreadIds: ID[];
}

export function useNotifications(): Notifications {
  const session = useSession();
  const { user } = useApp();
  const { schoolClass } = useCurrentStudent();
  const { taughtClasses } = useCurrentTeacher();
  const all = useAllAnnouncements();

  const role = session?.role ?? 'student';
  const classKey =
    role === 'teacher' ? taughtClasses.map((c) => c.id).join(',') : schoolClass.id;

  return useMemo(() => {
    const mine = new Set(classKey ? classKey.split(',') : []);
    const items = all
      .filter((a) => {
        if (a.audience !== 'all' && a.audience !== `${role}s`) return false;
        return !a.classId || mine.has(a.classId);
      })
      .slice(0, NOTIFICATION_LIMIT);

    return {
      items,
      unreadIds: items
        .filter((a) => !user.readAnnouncementIds.includes(a.id))
        .map((a) => a.id),
    };
  }, [all, classKey, role, user.readAnnouncementIds]);
}

/* ---- teacher -------------------------------------------------------- */

export function useTeacherToday(): DayTimeline {
  const { teacher } = useCurrentTeacher();
  return useMemo(() => {
    const weekday = weekdayOf(today());
    return buildTimeline(lessonsOfTeacher(teacher.id, weekday), true);
  }, [teacher.id]);
}

/** Assignments this teacher owns, nearest deadline first. */
export function useTeacherAssignments(): Assignment[] {
  const all = useAllAssignments();
  const { teacher } = useCurrentTeacher();
  return useMemo(
    () =>
      all
        .filter((a) => a.teacherId === teacher.id)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [all, teacher.id],
  );
}

export interface ClassSnapshot {
  schoolClass: SchoolClass;
  studentCount: number;
  activeAssignments: number;
  nextDueDate: string | null;
  subjectIds: ID[];
}

export function useClassSnapshots(): ClassSnapshot[] {
  const all = useAllAssignments();
  const { taughtClasses } = useCurrentTeacher();
  return useMemo(
    () =>
      taughtClasses.map((schoolClass) => {
        const active = all
          .filter((a) => a.classId === schoolClass.id && daysFromToday(a.dueDate) >= 0)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        return {
          schoolClass,
          studentCount: schoolClass.studentIds.length,
          activeAssignments: active.length,
          nextDueDate: active[0]?.dueDate ?? null,
          subjectIds: [...new Set(all.filter((a) => a.classId === schoolClass.id).map((a) => a.subjectId))],
        };
      }),
    [all, taughtClasses],
  );
}

/* What a teacher sees for one student: their real ticks once they
   have signed in and done something, and a stable stand-in before
   that, so a fresh class list is not uniformly empty. */
function completedIdsFor(state: AppState, student: Student, all: Assignment[]): ID[] {
  const own = state.users[student.id];
  return own ? own.completedAssignmentIds : demoCompletedIdsFor(student.id, all);
}

export interface StudentRow {
  student: Student;
  schoolClass: SchoolClass;
  done: number;
  total: number;
  percent: number;
  isCurrentUser: boolean;
}

export function useStudentRows(): StudentRow[] {
  const { state } = useApp();
  const all = useAllAssignments();
  const { taughtClasses } = useCurrentTeacher();
  return useMemo(
    () =>
      taughtClasses.flatMap((schoolClass) =>
        studentsOfClass(schoolClass.id).map((student) => {
          const progress = completionFor(
            schoolClass.id,
            all,
            completedIdsFor(state, student, all),
          );
          return {
            student,
            schoolClass,
            ...progress,
            /* Marks the account the demo opens on, so the operator can
               find Shohjahon in the roster at a glance. */
            isCurrentUser: student.id === DEMO_STUDENT_ID,
          };
        }),
      ),
    [all, taughtClasses, state],
  );
}

/** Open assignments for one student, used by the student detail drawer. */
export function useAssignmentsForStudent(student: Student): HomeworkItem[] {
  const { state } = useApp();
  const all = useAllAssignments();
  return useMemo(() => {
    const completedIds = completedIdsFor(state, student, all);
    return sortHomework(
      assignmentsForClass(all, student.classId)
        .filter((a) => a.kind !== 'test')
        .map((a) => toHomeworkItem(a, completedIds)),
    );
  }, [all, student, state]);
}

/** Upcoming lessons for a class, starting from today. */
export function useUpcomingClassLessons(classId: ID, days = 3): Array<{ date: string; lessons: ScheduledLesson[] }> {
  return useMemo(() => {
    const out: Array<{ date: string; lessons: ScheduledLesson[] }> = [];
    const start = today();
    for (let i = 0; out.length < days && i < 10; i += 1) {
      const d = addDays(start, i);
      const weekday = weekdayOf(d);
      if (weekday === 7) continue;
      const dayLessons = lessonsOfClass(classId, weekday);
      if (dayLessons.length === 0) continue;
      out.push({ date: toISODate(d), lessons: dayLessons });
    }
    return out;
  }, [classId, days]);
}

export function useActivityFeed() {
  const { state } = useApp();
  const all = useAllAssignments();
  return useMemo(
    () =>
      state.activity
        .map((event) => ({
          event,
          assignment: all.find((a) => a.id === event.assignmentId) ?? null,
        }))
        .filter((row) => row.assignment !== null),
    [state.activity, all],
  );
}

export function useCreatedTodayCount(): number {
  const assignments = useTeacherAssignments();
  return useMemo(
    () => assignments.filter((a) => a.createdAt === todayISO() && a.origin === 'teacher').length,
    [assignments],
  );
}
