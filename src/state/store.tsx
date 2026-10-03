import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import type {
  ActivityEvent,
  AppMode,
  Assignment,
  AssignmentKind,
  ID,
  Locale,
  Theme,
} from '@/data/types';
import { DEMO_STUDENT_ID, DEMO_TEACHER_ID, seedCompletedAssignmentIds } from '@/data/school';
import { useAuth } from '@/auth/AuthProvider';
import type { StudyPlan } from '@/lib/planner/types';
import type { TutorSession } from '@/lib/tutor/types';
import { todayISO } from '@/lib/dates';
import { migrateStoredState, readStoredState, STATE_VERSION, writeStoredState } from './storage';

/* ------------------------------------------------------------------
   One small reducer holds everything the demo needs to remember.
   No external state library: the surface is deliberately tiny.

   Since v1.4 the store has two halves:

     shared   the school itself — assignments a teacher created and
              the activity feed. Everyone sees these, because that is
              what makes the teacher-to-student flow real.

     perUser  what one person has done: ticked homework, their study
              plan, their tutor session. Keyed by user id, so signing
              in as somebody else shows their work and not yours.
   ------------------------------------------------------------------ */

/** Everything that belongs to one signed-in person. */
export interface UserState {
  /** Assignments this student has ticked off. */
  completedAssignmentIds: ID[];
  /** Personal (non-school) tasks this student has ticked off. */
  completedTaskIds: ID[];
  /** The study plan AI Planner last produced, for today only. */
  plan: StudyPlan | null;
  /** Plan steps ticked off inside the planner. Deliberately separate
   *  from `completedAssignmentIds`: ticking a step off a study plan is
   *  not the same act as marking the homework itself done. */
  completedPlanItemIds: ID[];
  /** The AI Tutor lesson in progress, if any. */
  tutor: TutorSession | null;
}

export const EMPTY_USER: UserState = {
  completedAssignmentIds: [],
  completedTaskIds: [],
  plan: null,
  completedPlanItemIds: [],
  tutor: null,
};

export interface AppState {
  version: number;
  mode: AppMode;
  theme: Theme;
  locale: Locale;
  /** Assignments created by a teacher inside the running demo. */
  createdAssignments: Assignment[];
  activity: ActivityEvent[];
  /** Per-person state, keyed by student or teacher id. */
  users: Record<ID, UserState>;
}

export interface AssignmentDraft {
  title: string;
  description: string;
  classId: ID;
  subjectId: ID;
  kind: AssignmentKind;
  dueDate: string;
}

const initialState: AppState = {
  version: STATE_VERSION,
  mode: 'student',
  theme: 'light',
  locale: 'uz',
  createdAssignments: [],
  activity: [],
  /* The one student the demo opens on starts with a little history,
     so the first screen is not uniformly empty. */
  users: {
    [DEMO_STUDENT_ID]: { ...EMPTY_USER, completedAssignmentIds: [...seedCompletedAssignmentIds] },
  },
};

type Action =
  | { type: 'setMode'; mode: AppMode }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setLocale'; locale: Locale }
  | { type: 'toggleAssignment'; id: ID; userId: ID }
  | { type: 'toggleTask'; id: ID; userId: ID }
  | { type: 'createAssignment'; assignment: Assignment }
  | { type: 'setPlan'; plan: StudyPlan; userId: ID }
  | { type: 'clearPlan'; userId: ID }
  | { type: 'togglePlanItem'; id: ID; userId: ID }
  | { type: 'setTutor'; session: TutorSession | null; userId: ID }
  | { type: 'reset' };

const ACTIVITY_LIMIT = 12;

function pushActivity(state: AppState, event: ActivityEvent): ActivityEvent[] {
  return [event, ...state.activity].slice(0, ACTIVITY_LIMIT);
}

function newId(prefix: string): ID {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function userStateOf(state: AppState, userId: ID | null): UserState {
  if (!userId) return EMPTY_USER;
  return state.users[userId] ?? EMPTY_USER;
}

/** Applies a change to one person's slice, leaving everyone else's
 *  alone. Every per-user action goes through here. */
function patchUser(state: AppState, userId: ID, change: Partial<UserState>): AppState {
  const current = userStateOf(state, userId);
  return {
    ...state,
    users: { ...state.users, [userId]: { ...current, ...change } },
  };
}

function toggle(list: ID[], id: ID): ID[] {
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'setMode':
      return state.mode === action.mode ? state : { ...state, mode: action.mode };

    case 'setTheme':
      return { ...state, theme: action.theme };

    case 'setLocale':
      return { ...state, locale: action.locale };

    case 'toggleAssignment': {
      const current = userStateOf(state, action.userId);
      const done = current.completedAssignmentIds.includes(action.id);
      return {
        ...patchUser(state, action.userId, {
          completedAssignmentIds: toggle(current.completedAssignmentIds, action.id),
        }),
        activity: pushActivity(state, {
          id: newId('ev'),
          kind: done ? 'homework_reopened' : 'homework_completed',
          at: new Date().toISOString(),
          assignmentId: action.id,
          actorId: action.userId,
        }),
      };
    }

    case 'toggleTask': {
      const current = userStateOf(state, action.userId);
      return patchUser(state, action.userId, {
        completedTaskIds: toggle(current.completedTaskIds, action.id),
      });
    }

    case 'createAssignment':
      return {
        ...state,
        createdAssignments: [action.assignment, ...state.createdAssignments],
        activity: pushActivity(state, {
          id: newId('ev'),
          kind: 'assignment_created',
          at: new Date().toISOString(),
          assignmentId: action.assignment.id,
          actorId: action.assignment.teacherId,
        }),
      };

    case 'setPlan':
      /* A new plan replaces the old one, and the ticks that belonged
         to the old one go with it. */
      return patchUser(state, action.userId, { plan: action.plan, completedPlanItemIds: [] });

    case 'clearPlan':
      return patchUser(state, action.userId, { plan: null, completedPlanItemIds: [] });

    case 'togglePlanItem': {
      const current = userStateOf(state, action.userId);
      return patchUser(state, action.userId, {
        completedPlanItemIds: toggle(current.completedPlanItemIds, action.id),
      });
    }

    case 'setTutor':
      return patchUser(state, action.userId, { tutor: action.session });

    case 'reset':
      return { ...initialState };

    default:
      return state;
  }
}

/** A stored slice may be half-written or come from an older build. */
function readUser(raw: unknown): UserState {
  const value = (raw ?? {}) as Partial<UserState>;
  return {
    completedAssignmentIds: Array.isArray(value.completedAssignmentIds)
      ? value.completedAssignmentIds
      : [],
    completedTaskIds: Array.isArray(value.completedTaskIds) ? value.completedTaskIds : [],
    /* A plan is only ever for one day. Yesterday's is dropped on load
       rather than shown as if it were current. */
    plan:
      value.plan && typeof value.plan === 'object' && value.plan.dateISO === todayISO()
        ? value.plan
        : null,
    completedPlanItemIds: Array.isArray(value.completedPlanItemIds)
      ? value.completedPlanItemIds
      : [],
    tutor: value.tutor && typeof value.tutor === 'object' ? value.tutor : null,
  };
}

function hydrate(): AppState {
  const stored = migrateStoredState(readStoredState<Record<string, unknown>>());
  if (!stored) return initialState;

  const users: Record<ID, UserState> = {};
  const storedUsers = (stored.users ?? {}) as Record<string, unknown>;
  for (const [userId, slice] of Object.entries(storedUsers)) {
    users[userId] = readUser(slice);
  }

  return {
    ...initialState,
    mode: stored.mode === 'teacher' ? 'teacher' : 'student',
    theme: stored.theme === 'dark' ? 'dark' : 'light',
    locale: stored.locale === 'ru' ? 'ru' : 'uz',
    version: STATE_VERSION,
    createdAssignments: Array.isArray(stored.createdAssignments) ? stored.createdAssignments : [],
    activity: Array.isArray(stored.activity) ? stored.activity : [],
    users: Object.keys(users).length > 0 ? users : initialState.users,
  };
}

export interface AppContextValue {
  state: AppState;
  /** The signed-in person's own slice. Empty when nobody is. */
  user: UserState;
  setMode: (mode: AppMode) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleAssignmentDone: (id: ID) => void;
  toggleTaskDone: (id: ID) => void;
  createAssignment: (draft: AssignmentDraft) => Assignment;
  setPlan: (plan: StudyPlan) => void;
  clearPlan: () => void;
  togglePlanItemDone: (id: ID) => void;
  setTutorSession: (session: TutorSession | null) => void;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);
  const { session } = useAuth();

  /* Records are attributed to whoever is signed in. With no session
     the demo accounts stand in, so the store never depends on one. */
  const studentId = session?.role === 'student' ? session.userId : DEMO_STUDENT_ID;
  const teacherId = session?.role === 'teacher' ? session.userId : DEMO_TEACHER_ID;
  const currentId = session?.userId ?? null;

  /* Persist the whole session under one key. */
  useEffect(() => {
    writeStoredState(state);
  }, [state]);

  /* Reflect theme / mode / locale on <html> so CSS tokens and the
     document language follow the application state. */
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', state.theme === 'dark');
    el.classList.toggle('light', state.theme !== 'dark');
    el.setAttribute('data-mode', state.mode);
    el.setAttribute('lang', state.locale);
    el.style.colorScheme = state.theme;
  }, [state.theme, state.mode, state.locale]);

  const createAssignment = useCallback(
    (draft: AssignmentDraft): Assignment => {
      const assignment: Assignment = {
        id: newId('as'),
        kind: draft.kind,
        title: draft.title.trim(),
        description: draft.description.trim(),
        subjectId: draft.subjectId,
        classId: draft.classId,
        teacherId,
        dueDate: draft.dueDate,
        createdAt: todayISO(),
        origin: 'teacher',
      };
      dispatch({ type: 'createAssignment', assignment });
      return assignment;
    },
    [teacherId],
  );

  const user = useMemo(() => userStateOf(state, currentId), [state, currentId]);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      user,
      setMode: (mode) => dispatch({ type: 'setMode', mode }),
      setTheme: (theme) => dispatch({ type: 'setTheme', theme }),
      toggleTheme: () =>
        dispatch({ type: 'setTheme', theme: state.theme === 'dark' ? 'light' : 'dark' }),
      setLocale: (locale) => dispatch({ type: 'setLocale', locale }),
      toggleAssignmentDone: (id) =>
        dispatch({ type: 'toggleAssignment', id, userId: studentId }),
      toggleTaskDone: (id) => dispatch({ type: 'toggleTask', id, userId: studentId }),
      createAssignment,
      setPlan: (plan) => dispatch({ type: 'setPlan', plan, userId: studentId }),
      clearPlan: () => dispatch({ type: 'clearPlan', userId: studentId }),
      togglePlanItemDone: (id) => dispatch({ type: 'togglePlanItem', id, userId: studentId }),
      setTutorSession: (tutorSession) =>
        dispatch({ type: 'setTutor', session: tutorSession, userId: studentId }),
      resetDemo: () => dispatch({ type: 'reset' }),
    }),
    [state, user, createAssignment, studentId],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useLocale(): Locale {
  return useApp().state.locale;
}
