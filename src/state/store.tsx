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
import { CURRENT_STUDENT_ID, CURRENT_TEACHER_ID, seedCompletedAssignmentIds } from '@/data/school';
import { todayISO } from '@/lib/dates';
import { readStoredState, STATE_VERSION, writeStoredState } from './storage';

/* ------------------------------------------------------------------
   One small reducer holds everything the demo needs to remember.
   No external state library: the surface is deliberately tiny.
   ------------------------------------------------------------------ */

export interface AppState {
  version: number;
  mode: AppMode;
  theme: Theme;
  locale: Locale;
  /** Assignments the student has ticked off. */
  completedAssignmentIds: ID[];
  /** Personal (non-school) tasks the student has ticked off. */
  completedTaskIds: ID[];
  /** Assignments created by a teacher inside the running demo. */
  createdAssignments: Assignment[];
  activity: ActivityEvent[];
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
  completedAssignmentIds: [...seedCompletedAssignmentIds],
  completedTaskIds: [],
  createdAssignments: [],
  activity: [],
};

type Action =
  | { type: 'setMode'; mode: AppMode }
  | { type: 'setTheme'; theme: Theme }
  | { type: 'setLocale'; locale: Locale }
  | { type: 'toggleAssignment'; id: ID }
  | { type: 'toggleTask'; id: ID }
  | { type: 'createAssignment'; assignment: Assignment }
  | { type: 'reset' };

const ACTIVITY_LIMIT = 12;

function pushActivity(state: AppState, event: ActivityEvent): ActivityEvent[] {
  return [event, ...state.activity].slice(0, ACTIVITY_LIMIT);
}

function newId(prefix: string): ID {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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
      const done = state.completedAssignmentIds.includes(action.id);
      return {
        ...state,
        completedAssignmentIds: done
          ? state.completedAssignmentIds.filter((id) => id !== action.id)
          : [...state.completedAssignmentIds, action.id],
        activity: pushActivity(state, {
          id: newId('ev'),
          kind: done ? 'homework_reopened' : 'homework_completed',
          at: new Date().toISOString(),
          assignmentId: action.id,
          actorId: CURRENT_STUDENT_ID,
        }),
      };
    }

    case 'toggleTask': {
      const done = state.completedTaskIds.includes(action.id);
      return {
        ...state,
        completedTaskIds: done
          ? state.completedTaskIds.filter((id) => id !== action.id)
          : [...state.completedTaskIds, action.id],
      };
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

    case 'reset':
      return { ...initialState };

    default:
      return state;
  }
}

function hydrate(): AppState {
  const stored = readStoredState<AppState>();
  if (!stored) return initialState;
  return {
    ...initialState,
    ...stored,
    version: STATE_VERSION,
    // Arrays are validated defensively: a half-written session must not
    // break the app on the next load.
    completedAssignmentIds: Array.isArray(stored.completedAssignmentIds)
      ? stored.completedAssignmentIds
      : initialState.completedAssignmentIds,
    completedTaskIds: Array.isArray(stored.completedTaskIds) ? stored.completedTaskIds : [],
    createdAssignments: Array.isArray(stored.createdAssignments) ? stored.createdAssignments : [],
    activity: Array.isArray(stored.activity) ? stored.activity : [],
  };
}

export interface AppContextValue {
  state: AppState;
  setMode: (mode: AppMode) => void;
  toggleMode: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleAssignmentDone: (id: ID) => void;
  toggleTaskDone: (id: ID) => void;
  createAssignment: (draft: AssignmentDraft) => Assignment;
  resetDemo: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, hydrate);

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

  const createAssignment = useCallback((draft: AssignmentDraft): Assignment => {
    const assignment: Assignment = {
      id: newId('as'),
      kind: draft.kind,
      title: draft.title.trim(),
      description: draft.description.trim(),
      subjectId: draft.subjectId,
      classId: draft.classId,
      teacherId: CURRENT_TEACHER_ID,
      dueDate: draft.dueDate,
      createdAt: todayISO(),
      origin: 'teacher',
    };
    dispatch({ type: 'createAssignment', assignment });
    return assignment;
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      state,
      setMode: (mode) => dispatch({ type: 'setMode', mode }),
      toggleMode: () =>
        dispatch({ type: 'setMode', mode: state.mode === 'student' ? 'teacher' : 'student' }),
      setTheme: (theme) => dispatch({ type: 'setTheme', theme }),
      toggleTheme: () =>
        dispatch({ type: 'setTheme', theme: state.theme === 'dark' ? 'light' : 'dark' }),
      setLocale: (locale) => dispatch({ type: 'setLocale', locale }),
      toggleAssignmentDone: (id) => dispatch({ type: 'toggleAssignment', id }),
      toggleTaskDone: (id) => dispatch({ type: 'toggleTask', id }),
      createAssignment,
      resetDemo: () => dispatch({ type: 'reset' }),
    }),
    [state, createAssignment],
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
