import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppMode, ID } from '@/data/types';
import { clearStoredSession, readStoredSession, writeStoredSession } from '@/state/storage';
import { defaultUserIdFor, isKnownUser, matchAccount } from './credentials';

/* ------------------------------------------------------------------
   Who is signed in.

   Deliberately the smallest thing that can answer "which workspace,
   and whose records": a role and a user id. No password is kept, in
   memory or in storage.

   This sits above the application store so every screen, selector and
   AI context builder reads one identity rather than a constant.
   ------------------------------------------------------------------ */

export interface Session {
  authenticated: true;
  role: AppMode;
  userId: ID;
}

export type SignInResult = { ok: true; session: Session } | { ok: false };

function hydrate(): Session | null {
  const stored = readStoredSession<Session>();
  if (!stored || stored.authenticated !== true) return null;
  const role: AppMode = stored.role === 'teacher' ? 'teacher' : 'student';
  /* A user id from an older build may name somebody the dataset no
     longer contains; the role still says which account to restore. */
  const userId =
    typeof stored.userId === 'string' && isKnownUser(role, stored.userId)
      ? stored.userId
      : defaultUserIdFor(role);
  return { authenticated: true, role, userId };
}

export interface AuthContextValue {
  session: Session | null;
  signIn: (login: string, password: string) => SignInResult;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(hydrate);

  const signIn = useCallback((login: string, password: string): SignInResult => {
    const account = matchAccount(login, password);
    if (!account) return { ok: false };
    const next: Session = {
      authenticated: true,
      role: account.role,
      userId: account.userId,
    };
    writeStoredSession(next);
    setSession(next);
    return { ok: true, session: next };
  }, []);

  /* Signing out ends the session and nothing else: school data,
     teacher-created assignments and the study plan survive it. */
  const signOut = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ session, signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** The signed-in session, or null when nobody is signed in. */
export function useSession(): Session | null {
  return useAuth().session;
}
