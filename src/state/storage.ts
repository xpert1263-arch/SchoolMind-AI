/**
 * The only place in the app that touches localStorage.
 * One versioned key holds the whole demo session.
 */

export const STORAGE_KEY = 'schoolmind.v1';
export const STATE_VERSION = 1;

export function readStoredState<T>(): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<T> & { version?: number };
    if (parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch {
    // Private mode, disabled storage, or corrupted JSON — start fresh.
    return null;
  }
}

export function writeStoredState(state: unknown): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is a convenience here, never a requirement.
  }
}

export function clearStoredState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------
   Demo session.

   Kept under its own key, separate from the school session state, so
   signing out clears who is signed in without touching assignments,
   completions or a generated study plan.
   ------------------------------------------------------------------ */

export const SESSION_KEY = 'schoolmind.session.v1';

export function readStoredSession<T>(): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return null;
  }
}

export function writeStoredSession(session: unknown): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* A session that cannot be persisted still works until reload. */
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
