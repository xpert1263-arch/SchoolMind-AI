import { classes, students, teachers } from '@/data/school';
import { fullName } from '@/data/queries';
import type { AppMode, ID } from '@/data/types';

/* ------------------------------------------------------------------
   The demo account registry.

   This is a hackathon demo gate, NOT authentication. The credentials
   live in the client bundle, nothing is hashed, and nothing is
   verified by a server. Its only job is to decide which workspace
   opens and whose records the session belongs to.

   The registry is DERIVED from the school dataset rather than typed
   out beside it, so an account can never point at a student or
   teacher who does not exist, and adding a person to a class gives
   them a login automatically.

   Usernames are sequential — student1…studentN, teacher1…teacherN —
   and the password equals the username. Numbering follows the order
   people appear in the dataset, which groups students by class.
   ------------------------------------------------------------------ */

export interface DemoAccount {
  username: string;
  password: string;
  role: AppMode;
  /** The student or teacher record this login signs in as. */
  userId: ID;
  /** For the operator's credential sheet, never for the login page. */
  displayName: string;
  /** Class for a student, subjects for a teacher. */
  context: string;
}

function studentAccounts(): DemoAccount[] {
  return students.map((student, i) => {
    const username = `student${i + 1}`;
    const schoolClass = classes.find((c) => c.id === student.classId);
    return {
      username,
      password: username,
      role: 'student' as const,
      userId: student.id,
      displayName: fullName(student),
      context: schoolClass?.name ?? student.classId,
    };
  });
}

function teacherAccounts(): DemoAccount[] {
  return teachers.map((teacher, i) => {
    const username = `teacher${i + 1}`;
    return {
      username,
      password: username,
      role: 'teacher' as const,
      userId: teacher.id,
      displayName: fullName(teacher),
      context: teacher.subjectIds.join(', '),
    };
  });
}

export const accounts: DemoAccount[] = [...studentAccounts(), ...teacherAccounts()];

/** v1.3 used a single `student` / `teacher` pair. They still work and
 *  resolve to the first account of each role, so a demo script written
 *  against the old build does not break. */
const ALIASES: Record<string, string> = {
  student: 'student1',
  teacher: 'teacher1',
};

const byUsername = new Map(accounts.map((account) => [account.username, account]));

/** The account for these credentials, or null. The username is
 *  matched case- and space-insensitively; the password exactly. */
export function matchAccount(login: string, password: string): DemoAccount | null {
  const typed = login.trim().toLowerCase();
  const username = ALIASES[typed] ?? typed;
  const account = byUsername.get(username);
  if (!account) return null;
  /* An alias is accepted with either its own word or the real one. */
  return password === account.password || password === typed ? account : null;
}

export function accountFor(userId: ID): DemoAccount | undefined {
  return accounts.find((account) => account.userId === userId);
}

/** The record a role falls back to when a stored session names a user
 *  the dataset no longer contains. */
export function defaultUserIdFor(role: AppMode): ID {
  return accounts.find((account) => account.role === role)?.userId ?? '';
}

/** True when a stored session still points at a real person. */
export function isKnownUser(role: AppMode, userId: ID): boolean {
  return accounts.some((account) => account.role === role && account.userId === userId);
}
