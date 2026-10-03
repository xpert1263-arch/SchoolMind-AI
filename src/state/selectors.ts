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
  daysFromToday,
  minutesOf,
  nextTeachingDayISO,
  nowMinutes,
  todayISO,
  weekdayOf,
  weekdayOfISO,
} from '@/lib/dates';
import { useSession } from '@/auth/AuthProvider';
import { useApp } from './store';

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
  const { state } = useApp();
  const all = useAllAssignments();
  const { schoolClass } = useCurrentStudent();
  return useMemo(
    () =>
      sortHomework(
        assignmentsForClass(all, schoolClass.id).map((a) =>
          toHomeworkItem(a, state.completedAssignmentIds),
        ),
      ),
    [all, schoolClass.id, state.completedAssignmentIds],
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
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useStudentToday(): DayTimeline {
  const { schoolClass } = useCurrentStudent();
  return useMemo(() => {
    const weekday = weekdayOf(new Date());
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
  const { state } = useApp();
  return useMemo(
    () =>
      personalTasks.map((task) => ({
        task,
        completed: state.completedTaskIds.includes(task.id),
      })),
    [state.completedTaskIds],
  );
}

export function useAnnouncements(limit?: number): Announcement[] {
  const { schoolClass } = useCurrentStudent();
  return useMemo(() => {
    const visible = announcements.filter((a) => !a.classId || a.classId === schoolClass.id);
    return typeof limit === 'number' ? visible.slice(0, limit) : visible;
  }, [schoolClass.id, limit]);
}

/* ---- teacher -------------------------------------------------------- */

export function useTeacherToday(): DayTimeline {
  const { teacher } = useCurrentTeacher();
  return useMemo(() => {
    const weekday = weekdayOf(new Date());
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
  const signedInStudentId = useCurrentStudentId();
  return useMemo(
    () =>
      taughtClasses.flatMap((schoolClass) =>
        studentsOfClass(schoolClass.id).map((student) => {
          const completedIds =
            student.id === signedInStudentId
              ? state.completedAssignmentIds
              : demoCompletedIdsFor(student.id, all);
          const progress = completionFor(schoolClass.id, all, completedIds);
          return {
            student,
            schoolClass,
            ...progress,
            isCurrentUser: student.id === signedInStudentId,
          };
        }),
      ),
    [all, taughtClasses, state.completedAssignmentIds, signedInStudentId],
  );
}

/** Open assignments for one student, used by the student detail drawer. */
export function useAssignmentsForStudent(student: Student): HomeworkItem[] {
  const { state } = useApp();
  const all = useAllAssignments();
  const signedInStudentId = useCurrentStudentId();
  return useMemo(() => {
    const completedIds =
      student.id === signedInStudentId
        ? state.completedAssignmentIds
        : demoCompletedIdsFor(student.id, all);
    return sortHomework(
      assignmentsForClass(all, student.classId)
        .filter((a) => a.kind !== 'test')
        .map((a) => toHomeworkItem(a, completedIds)),
    );
  }, [all, student, state.completedAssignmentIds, signedInStudentId]);
}

/** Upcoming lessons for a class, starting from today. */
export function useUpcomingClassLessons(classId: ID, days = 3): Array<{ date: string; lessons: ScheduledLesson[] }> {
  return useMemo(() => {
    const out: Array<{ date: string; lessons: ScheduledLesson[] }> = [];
    const start = new Date();
    for (let i = 0; out.length < days && i < 10; i += 1) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const weekday = weekdayOf(d);
      if (weekday === 7) continue;
      const dayLessons = lessonsOfClass(classId, weekday);
      if (dayLessons.length === 0) continue;
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const day = `${d.getDate()}`.padStart(2, '0');
      out.push({ date: `${y}-${m}-${day}`, lessons: dayLessons });
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
