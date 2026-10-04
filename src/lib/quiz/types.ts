import type { ID, Locale } from '@/data/types';

/* ------------------------------------------------------------------
   Quiz / learning loop vocabulary.

   The loop is: ask one question, take the answer, say how it went and
   why, move on. The point is the explanation after each answer, not
   the score at the end.

   Two things are kept deliberately separate:

     the quiz        questions, answers and explanations, which may
                     come from Gemini or from SchoolMind's own bank
     the history     a short factual record per student — what was
                     practised and how it went. No inferred "mastery".
   ------------------------------------------------------------------ */

export type QuizQuestionType = 'multiple' | 'boolean' | 'short';

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export const QUIZ_DIFFICULTIES: QuizDifficulty[] = ['easy', 'medium', 'hard'];

export const QUIZ_LENGTHS = [5, 10] as const;

export type QuizLength = (typeof QUIZ_LENGTHS)[number];

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  type: QuizQuestionType;
  prompt: string;
  /** Empty for a short answer. */
  options: QuizOption[];
  /** The option that is right, for a choice question. */
  correctOptionId: string;
  /** The expected wording, for a short answer — and the readable
   *  answer shown in the review for any question. */
  correctAnswer: string;
  explanation: string;
  hint: string;
}

export type QuizVerdict = 'correct' | 'partial' | 'incorrect' | 'unclear';

export interface QuizAnswer {
  questionId: string;
  /** An option id, or what the student typed. */
  given: string;
  verdict: QuizVerdict;
  /** What the student is told after answering. */
  feedback: string;
  /** Whether SchoolMind decided this itself or had to ask the model.
   *  A choice question is always decided here — comparing two ids is
   *  not worth a request. */
  evaluatedBy: 'schoolmind' | 'ai';
}

export interface QuizSession {
  id: string;
  subjectId: ID;
  topic: string;
  difficulty: QuizDifficulty;
  /** Where the questions came from. Never dressed up as the other. */
  source: 'ai' | 'bank';
  locale: Locale;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  /** Index of the question on screen. */
  index: number;
  startedAt: string;
  finishedAt: string | null;
}

/** One finished quiz, kept per student. Facts only. */
export interface QuizHistoryEntry {
  id: string;
  at: string;
  dateISO: string;
  subjectId: ID;
  topic: string;
  difficulty: QuizDifficulty;
  total: number;
  correct: number;
  /** Prompts the student did not get right, so "needs review" is a
   *  list of real questions rather than a claim about the student. */
  review: string[];
}

export type QuizErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'upstream_error'
  | 'malformed_response'
  | 'empty_response'
  | 'bad_request'
  | 'server_error';

export type QuizStatus = 'setup' | 'generating' | 'running' | 'checking' | 'done';

/** The defensible signals a finished quiz leaves behind. Nothing here
 *  claims to measure a person — only what was practised recently. */
export interface QuizSignals {
  quizzes: number;
  answered: number;
  correct: number;
  recentSubjects: ID[];
  /** Questions from the last few quizzes that went wrong. */
  review: Array<{ subjectId: ID; topic: string; prompt: string }>;
}
