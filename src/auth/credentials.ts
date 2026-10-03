import { DEMO_STUDENT_ID, DEMO_TEACHER_ID } from '@/data/school';
import type { AppMode, ID } from '@/data/types';

/* ------------------------------------------------------------------
   Local demo sign-in.

   This is a hackathon demo gate, NOT authentication. The credentials
   live in the client bundle, nothing is hashed, and nothing is
   verified by a server. Its only job is to decide which of the two
   workspaces opens and whose records the session belongs to.

   One table, so no component ever compares a password itself.
   ------------------------------------------------------------------ */

export interface DemoAccount {
  login: string;
  password: string;
  role: AppMode;
  /** The record in the shared school dataset this login signs in as. */
  userId: ID;
}

const accounts: DemoAccount[] = [
  { login: 'student', password: 'student', role: 'student', userId: DEMO_STUDENT_ID },
  { login: 'teacher', password: 'teacher', role: 'teacher', userId: DEMO_TEACHER_ID },
];

/** The account for these credentials, or null. Login is case- and
 *  space-insensitive; the password is compared exactly. */
export function matchAccount(login: string, password: string): DemoAccount | null {
  const normalised = login.trim().toLowerCase();
  return (
    accounts.find((account) => account.login === normalised && account.password === password) ?? null
  );
}

/** The record a role signs in as, used when a stored session names a
 *  role but its user id is no longer recognisable. */
export function defaultUserIdFor(role: AppMode): ID {
  return role === 'teacher' ? DEMO_TEACHER_ID : DEMO_STUDENT_ID;
}
