import type { ID } from '@/data/types';
import type { QuizQuestion } from '@/lib/quiz/types';

/* ------------------------------------------------------------------
   Teacher AI — what a teacher can ask for, and what comes back.

   Four structured actions and a conversation. Every result carries
   `source`, because a teacher is entitled to know whether they are
   reading a model's work or SchoolMind's own template: the two are
   useful in different ways, and claiming the second is the first
   would be a lie about the product.
   ------------------------------------------------------------------ */

export type TeacherAiAction = 'lesson' | 'assignment' | 'explain' | 'quiz' | 'chat';

/** Where the content on screen actually came from. */
export type ContentSource = 'ai' | 'schoolmind';

export type LessonLength = 45 | 90;
export const LESSON_LENGTHS: LessonLength[] = [45, 90];

export interface LessonPlan {
  objective: string;
  warmUp: string;
  explanation: string[];
  examples: string[];
  practice: string[];
  activity: string;
  checks: string[];
  conclusion: string;
  homework: string;
}

export interface AssignmentDraftContent {
  title: string;
  description: string;
  steps: string[];
  minutes: number;
}

export interface ExplanationMethod {
  simple: string;
  analogy: string;
  misconception: string;
  activity: string;
  checkQuestion: string;
}

export interface QuizDraft {
  questions: QuizQuestion[];
}

/** The settings an action was produced with, kept so the result can
 *  say what it is about and so "save" knows where work would go. */
export interface TeacherAiScope {
  classId: ID;
  classLabel: string;
  subjectId: ID;
  subject: string;
  topic: string;
}

export type TeacherAiResult =
  | { kind: 'lesson'; scope: TeacherAiScope; source: ContentSource; minutes: number; plan: LessonPlan }
  | {
      kind: 'assignment';
      scope: TeacherAiScope;
      source: ContentSource;
      draft: AssignmentDraftContent;
      /** Set once the teacher deliberately saved it. */
      savedAssignmentId?: ID;
    }
  | { kind: 'explain'; scope: TeacherAiScope; source: ContentSource; method: ExplanationMethod }
  | {
      kind: 'quiz';
      scope: TeacherAiScope;
      source: ContentSource;
      difficulty: 'easy' | 'medium' | 'hard';
      quiz: QuizDraft;
    };

export interface TeacherChatTurn {
  id: string;
  question: string;
  /** Empty while the answer is still coming, or when it was withheld. */
  answer: string;
  sources: Array<{ url: string; title: string; domain: string }>;
  usedWeb: boolean;
  /** True when the question needed live information that could not be
   *  verified, so nothing was answered. */
  withheld: boolean;
  /** Blocks answered from SchoolMind's own records, not from a model. */
  schoolBlocks: string[];
  source: ContentSource | null;
  at: string;
}

/** Persisted per teacher: the last result and the conversation. */
export interface TeacherAiState {
  result: TeacherAiResult | null;
  chat: TeacherChatTurn[];
}

export type TeacherAiErrorCode =
  | 'missing_api_key'
  | 'forbidden'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'upstream_error'
  | 'malformed_response'
  | 'empty_response'
  | 'bad_request'
  | 'server_error';

export type TeacherAiStatus = 'idle' | 'working';
