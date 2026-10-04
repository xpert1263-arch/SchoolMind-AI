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
  Announcement,
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
import type { QuizHistoryEntry, QuizSession } from '@/lib/quiz/types';
import type { TeacherAiState } from '@/lib/teacherAi/types';
import type { ClassPulse, ClassPulseResponse, PulseStatus } from '@/lib/pulse/types';
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
  /** Announcement ids this person has already seen in their
   *  notification panel. Read state is per person: one student
   *  reading theirs says nothing about anybody else's. */
  readAnnouncementIds: ID[];
  /** The quiz being taken, if any. */
  quiz: QuizSession | null;
  /** Finished quizzes, newest first. Facts about what was practised,
   *  never a claim about the student. */
  quizHistory: QuizHistoryEntry[];
  /** A teacher's last Teacher AI result and conversation. Keyed under
   *  the teacher, so two teachers never see each other's drafts. */
  teacherAi: TeacherAiState | null;
}

export const EMPTY_USER: UserState = {
  completedAssignmentIds: [],
  completedTaskIds: [],
  plan: null,
  completedPlanItemIds: [],
  tutor: null,
  readAnnouncementIds: [],
  quiz: null,
  quizHistory: [],
  teacherAi: null,
};

export interface AppState {
  version: number;
  mode: AppMode;
  theme: Theme;
  locale: Locale;
  /** Assignments created by a teacher inside the running demo. */
  createdAssignments: Assignment[];
  /** Notices raised by the running demo — today, only ClassPulse.
   *  Shared like assignments, because a notification one person
   *  creates is one everybody eligible can see. */
  createdAnnouncements: Announcement[];
  /** ClassPulse questions and the answers to them. Shared school
   *  data: the teacher writes one, every pupil in that class answers
   *  the same record, and the teacher reads the same answers back. */
  pulses: ClassPulse[];
  pulseResponses: ClassPulseResponse[];
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
  createdAnnouncements: [],
  pulses: [],
  pulseResponses: [],
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
  | { type: 'markAnnouncementsRead'; ids: ID[]; userId: ID }
  | { type: 'setQuiz'; quiz: QuizSession | null; userId: ID }
  | { type: 'recordQuiz'; entry: QuizHistoryEntry; userId: ID }
  | {
      type: 'setTeacherAi';
      /* Either the next state or a function of the current one: a chat
         turn is patched in place while a request is in flight, and the
         reducer is the only place that knows the current value. */
      update: TeacherAiState | ((current: TeacherAiState | null) => TeacherAiState);
      userId: ID;
    }
  | { type: 'createPulse'; pulse: ClassPulse }
  | { type: 'updatePulse'; id: ID; change: Partial<ClassPulse> }
  | { type: 'setPulseStatus'; id: ID; status: PulseStatus; announcement?: Announcement }
  | { type: 'answerPulse'; response: ClassPulseResponse }
  | { type: 'reset' };

const ACTIVITY_LIMIT = 12;
/** Enough history to show a trend, not enough to grow without end. */
const QUIZ_HISTORY_LIMIT = 20;

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

    case 'markAnnouncementsRead': {
      const current = userStateOf(state, action.userId);
      const unseen = action.ids.filter((id) => !current.readAnnouncementIds.includes(id));
      /* Nothing new to record — return the same object so opening the
         panel twice does not re-render or re-persist. */
      if (unseen.length === 0) return state;
      return patchUser(state, action.userId, {
        readAnnouncementIds: [...current.readAnnouncementIds, ...unseen],
      });
    }

    case 'setQuiz':
      return patchUser(state, action.userId, { quiz: action.quiz });

    case 'recordQuiz': {
      const current = userStateOf(state, action.userId);
      /* Replaying the same finished quiz must not log it twice. */
      if (current.quizHistory.some((entry) => entry.id === action.entry.id)) return state;
      return patchUser(state, action.userId, {
        quizHistory: [action.entry, ...current.quizHistory].slice(0, QUIZ_HISTORY_LIMIT),
      });
    }

    case 'setTeacherAi': {
      const current = userStateOf(state, action.userId);
      const next =
        typeof action.update === 'function' ? action.update(current.teacherAi) : action.update;
      return patchUser(state, action.userId, { teacherAi: next });
    }

    case 'createPulse':
      return { ...state, pulses: [action.pulse, ...state.pulses] };

    case 'updatePulse':
      return {
        ...state,
        pulses: state.pulses.map((pulse) =>
          pulse.id === action.id ? { ...pulse, ...action.change } : pulse,
        ),
      };

    case 'setPulseStatus': {
      const now = new Date().toISOString();
      const pulses = state.pulses.map((pulse) =>
        pulse.id === action.id
          ? {
              ...pulse,
              status: action.status,
              activatedAt: action.status === 'active' ? now : pulse.activatedAt,
              closedAt: action.status === 'closed' ? now : pulse.closedAt,
            }
          : pulse,
      );

      /* Activating raises exactly one notice, and only the first
         time: the id is derived from the pulse, so a repeated
         activation finds it already there instead of adding a
         second one. */
      const announcement = action.announcement;
      const already =
        announcement && state.createdAnnouncements.some((a) => a.id === announcement.id);

      return {
        ...state,
        pulses,
        createdAnnouncements:
          announcement && !already
            ? [announcement, ...state.createdAnnouncements]
            : state.createdAnnouncements,
      };
    }

    case 'answerPulse': {
      /* One answer per pupil per pulse. A second submission edits the
         first rather than stacking up beside it. */
      const existing = state.pulseResponses.find(
        (entry) =>
          entry.pulseId === action.response.pulseId &&
          entry.studentId === action.response.studentId,
      );
      if (existing) {
        return {
          ...state,
          pulseResponses: state.pulseResponses.map((entry) =>
            entry.id === existing.id
              ? { ...entry, answer: action.response.answer, updatedAt: new Date().toISOString() }
              : entry,
          ),
        };
      }
      return { ...state, pulseResponses: [...state.pulseResponses, action.response] };
    }

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
    readAnnouncementIds: Array.isArray(value.readAnnouncementIds)
      ? value.readAnnouncementIds
      : [],
    quiz: value.quiz && typeof value.quiz === 'object' ? value.quiz : null,
    quizHistory: Array.isArray(value.quizHistory) ? value.quizHistory : [],
    teacherAi:
      value.teacherAi && typeof value.teacherAi === 'object'
        ? {
            result: value.teacherAi.result ?? null,
            chat: Array.isArray(value.teacherAi.chat) ? value.teacherAi.chat : [],
          }
        : null,
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
    createdAnnouncements: Array.isArray(stored.createdAnnouncements)
      ? (stored.createdAnnouncements as Announcement[])
      : [],
    pulses: Array.isArray(stored.pulses) ? (stored.pulses as ClassPulse[]) : [],
    pulseResponses: Array.isArray(stored.pulseResponses)
      ? (stored.pulseResponses as ClassPulseResponse[])
      : [],
    activity: Array.isArray(stored.activity) ? stored.activity : [],
    users: Object.keys(users).length > 0 ? users : initialState.users,
  };
}

export interface AppContextValue {
  state: AppState;
  /** The signed-in person's own slice. Empty when nobody is. */
  user: UserState;
  /** The signed-in teacher's Teacher AI state. */
  teacherAi: TeacherAiState | null;
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
  markAnnouncementsRead: (ids: ID[]) => void;
  setQuiz: (quiz: QuizSession | null) => void;
  recordQuiz: (entry: QuizHistoryEntry) => void;
  setTeacherAi: (
    update: TeacherAiState | ((current: TeacherAiState | null) => TeacherAiState),
  ) => void;
  createPulse: (pulse: ClassPulse) => void;
  updatePulse: (id: ID, change: Partial<ClassPulse>) => void;
  setPulseStatus: (id: ID, status: PulseStatus, announcement?: Announcement) => void;
  answerPulse: (response: ClassPulseResponse) => void;
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
  /* Notifications belong to whoever is signed in, teacher or student. */
  const readerId = currentId ?? studentId;

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
      teacherAi: userStateOf(state, teacherId).teacherAi,
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
      markAnnouncementsRead: (ids) =>
        dispatch({ type: 'markAnnouncementsRead', ids, userId: readerId }),
      setQuiz: (quiz) => dispatch({ type: 'setQuiz', quiz, userId: studentId }),
      recordQuiz: (entry) => dispatch({ type: 'recordQuiz', entry, userId: studentId }),
      setTeacherAi: (update) => dispatch({ type: 'setTeacherAi', update, userId: teacherId }),
      createPulse: (pulse) => dispatch({ type: 'createPulse', pulse }),
      updatePulse: (id, change) => dispatch({ type: 'updatePulse', id, change }),
      setPulseStatus: (id, status, announcement) =>
        dispatch({ type: 'setPulseStatus', id, status, announcement }),
      answerPulse: (response) => dispatch({ type: 'answerPulse', response }),
      resetDemo: () => dispatch({ type: 'reset' }),
    }),
    [state, user, createAssignment, studentId, teacherId, readerId],
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
