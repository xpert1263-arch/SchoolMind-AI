/**
 * The only place in the app that touches localStorage.
 * One versioned key holds the whole demo session.
 */

export const STORAGE_KEY = 'schoolmind.v1';
export const STATE_VERSION = 2;

/** Reads whatever is stored, whichever version wrote it. Deciding
 *  what an older shape means is `migrateStoredState`'s job. */
export function readStoredState<T>(): (Partial<T> & { version?: number }) | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<T> & { version?: number };
  } catch {
    // Private mode, disabled storage, or corrupted JSON — start fresh.
    return null;
  }
}

/**
 * Brings a stored session up to the current shape.
 *
 * v1 (through v1.3) held one person's work at the top level, because
 * there was only ever one student. v1.4 keys that work by user id, so
 * the migration files the old fields under the student the demo used
 * to sign in as. Nothing is discarded, and nobody has to clear their
 * browser storage to upgrade.
 */
export function migrateStoredState(
  stored: (Record<string, unknown> & { version?: number }) | null,
): (Record<string, unknown> & { version?: number }) | null {
  if (!stored) return null;
  if (stored.version === STATE_VERSION) return stored;

  if (stored.version === 1) {
    const { completedAssignmentIds, completedTaskIds, plan, completedPlanItemIds, ...shared } =
      stored;
    return {
      ...shared,
      version: STATE_VERSION,
      users: {
        [V1_STUDENT_ID]: {
          completedAssignmentIds,
          completedTaskIds,
          plan,
          completedPlanItemIds,
          tutor: null,
        },
      },
    };
  }

  /* A version we do not recognise: start clean rather than guess. */
  return null;
}

/** The only student v1 could have belonged to. Spelled out here so
 *  the migration does not depend on today's dataset. */
const V1_STUDENT_ID = '9a-s1';

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
