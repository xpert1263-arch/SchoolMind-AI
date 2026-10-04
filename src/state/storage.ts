import { DEMO_REFERENCE_DATE } from '@/lib/dates';

/**
 * The only place in the app that touches localStorage.
 * One versioned key holds the whole demo session.
 */

export const STORAGE_KEY = 'schoolmind.v1';
export const STATE_VERSION = 4;

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
 * to sign in as.
 *
 * v3 (v1.6) adds the Teacher AI slice, which is purely additive — a
 * missing field is read as "nothing yet" either way, so the only
 * thing that migration owes anyone is not to lose what is there.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * The seeded dataset is not stored at all: it is rebuilt from offsets
 * against today's date on every load, so seeded homework, tests and
 * announcements cannot go stale and there is nothing about them to
 * migrate. What IS stored is what people did — completed homework,
 * study plans, tutor sessions, quiz history, read notifications and
 * assignments a teacher actually created — and none of it is touched.
 *
 * The single exception is residue: records from a demo run a month or
 * more ago, which are nobody's current work and would show up on a
 * presentation screen as deadlines from last month. Those are dropped
 * once, on this upgrade.
 *
 * Every step is idempotent: running it twice changes nothing, because
 * the version is only stamped once the shape already matches.
 */

/* ------------------------------------------------------------------
   v4 (v1.7): the demo clock, and what it means for stored records.

   WHAT WAS WRONG. Seeded content — homework, tests, announcements,
   the timetable — is not stored at all; it is rebuilt on every load
   as offsets from "today". That was supposed to keep it permanently
   current, and it does on the day of the presentation. Rehearsing a
   week earlier, though, "four teaching days ago" resolved to 29
   September, and the notification panel showed a September date on a
   screen that is meant to look like 10 October. The dates were never
   stale data; they were correctly counted from the wrong day.

   THE FIX is one line in `dates.ts` — the demo clock — and it needs
   no migration, because nothing seeded is persisted. Moving the clock
   moves every seeded date with it.

   WHAT DOES NEED MIGRATING is the opposite case: records a real
   person created DURING a rehearsal. An assignment set on 4 October
   with a deadline of 6 October is genuine work, but on a timeline
   that now says 10 October it reads as a missed deadline from last
   week. Those are re-anchored here: shifted forward as a block, so
   each one keeps exactly the gap it had between the day it was made
   and the day it was due.

   Nothing is deleted, nothing is reworded, and no score or answer is
   touched — only the calendar they hang on. Records made on or after
   the demo day are already on the right timeline and are left alone.
   ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

/** Whole days between two ISO dates, or null if either is unreadable. */
function dayGap(fromISO: unknown, toISO: unknown): number | null {
  if (typeof fromISO !== 'string' || typeof toISO !== 'string') return null;
  const a = Date.parse(fromISO.slice(0, 10));
  const b = Date.parse(toISO.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

function shiftISODate(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Moves records made during a rehearsal onto the demo timeline.
 *
 * Each assignment is shifted by the gap between the day it was
 * created and the demo day, so "set on the day, due two days later"
 * stays exactly that. A record already on or after the demo day is
 * untouched, which is what makes this safe to run on a machine where
 * the presentation has already happened.
 */
function reanchorToDemoDay(stored: Record<string, unknown>): Record<string, unknown> {
  const demoDay = DEMO_REFERENCE_DATE;

  const created = Array.isArray(stored.createdAssignments) ? stored.createdAssignments : [];
  const createdAssignments = created.map((entry) => {
    const row = entry as Record<string, unknown>;
    const shift = dayGap(row.createdAt, demoDay);
    /* Already on or past the demo day: leave the record exactly as the
       person who made it left it. */
    if (shift === null || shift <= 0) return row;
    return {
      ...row,
      createdAt: demoDay,
      dueDate: typeof row.dueDate === 'string' ? shiftISODate(row.dueDate, shift) : row.dueDate,
    };
  });

  const users = (stored.users ?? {}) as Record<string, Record<string, unknown>>;
  const movedUsers: Record<string, unknown> = {};
  for (const [userId, slice] of Object.entries(users)) {
    const history = Array.isArray(slice?.quizHistory) ? slice.quizHistory : null;
    movedUsers[userId] = history
      ? {
          ...slice,
          /* A quiz sat during a rehearsal belongs to the demo day, so
             the history does not read as a week old on stage. The
             score and the questions are untouched. */
          quizHistory: history.map((entry) => {
            const row = entry as Record<string, unknown>;
            const shift = dayGap(row.dateISO, demoDay);
            if (shift === null || shift <= 0) return row;
            return { ...row, dateISO: shiftISODate(String(row.dateISO), shift) };
          }),
        }
      : slice;
  }

  return { ...stored, createdAssignments, users: movedUsers };
}

/** Older than this, a stored demo record is residue rather than work. */
const RESIDUE_DAYS = 30;

function isResidue(iso: unknown): boolean {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  const age = (Date.now() - new Date(iso.slice(0, 10)).getTime()) / 86_400_000;
  return age > RESIDUE_DAYS;
}

/** Drops records left behind by a demo run a month or more ago. The
 *  cutoff is deliberately generous: anything a presenter could still
 *  think of as "the work I set" stays. */
function dropResidue(stored: Record<string, unknown>): Record<string, unknown> {
  const created = Array.isArray(stored.createdAssignments) ? stored.createdAssignments : [];
  const activity = Array.isArray(stored.activity) ? stored.activity : [];

  const keptAssignments = created.filter(
    (entry: Record<string, unknown>) => !isResidue(entry?.createdAt) || !isResidue(entry?.dueDate),
  );
  const keptIds = new Set(keptAssignments.map((entry: Record<string, unknown>) => entry?.id));

  return {
    ...stored,
    createdAssignments: keptAssignments,
    /* An activity line about an assignment that is gone has nothing
       to render, so the feed drops it with the record. */
    activity: activity.filter(
      (event: Record<string, unknown>) =>
        !isResidue(event?.at) && (!event?.assignmentId || keptIds.has(event.assignmentId)),
    ),
  };
}

export function migrateStoredState(
  stored: (Record<string, unknown> & { version?: number }) | null,
): (Record<string, unknown> & { version?: number }) | null {
  if (!stored) return null;
  if (stored.version === STATE_VERSION) return stored;

  if (stored.version === 1) {
    const { completedAssignmentIds, completedTaskIds, plan, completedPlanItemIds, ...shared } =
      stored;
    return {
      ...reanchorToDemoDay(dropResidue(shared)),
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

  if (stored.version === 2 || stored.version === 3) {
    /* Everything per-user carries over untouched; `readUser` supplies
       the fields newer versions added. Read notifications survive
       because announcement ids are stable — an1 is an1 whatever date
       the demo clock gives it. */
    return { ...reanchorToDemoDay(dropResidue(stored)), version: STATE_VERSION };
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
