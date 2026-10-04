import type { ID, TeachingAssignment } from './types';

/* Types for the shared roster. The implementation is plain JavaScript
   so the Node side can import it; this file is how TypeScript sees it. */

export const teachingAssignments: TeachingAssignment[];
export const teacherIdentities: Array<{ id: ID; firstName: string; lastName: string }>;
export const classIds: ID[];
export const studentsPerClass: number;

export function teacherNameOf(teacherId: ID): string;
export function classOfStudentId(studentId: string): ID | null;
export function subjectIdsTaughtBy(teacherId: ID, classId: ID): ID[];
export function teacherTeachesClass(teacherId: ID, classId: ID): boolean;
export function teacherTeachesStudent(teacherId: ID, studentId: ID): boolean;
