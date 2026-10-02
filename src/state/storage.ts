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
