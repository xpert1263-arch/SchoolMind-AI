import type { ID, Locale } from '@/data/types';
import type { WebSource } from '@/lib/ask/types';

/* ------------------------------------------------------------------
   AI Tutor vocabulary.

   AskMySchool answers a question. SnapHomework reads one photograph.
   The tutor is the only surface that holds a *lesson*: a subject, a
   topic and a run of turns in which the student is asked something,
   answers it, and is told how they did.

   The session is the unit of state, and it belongs to one student —
   it is stored under their user id and never shown to anyone else.
   ------------------------------------------------------------------ */

/** How the tutor is teaching right now. */
export type TutorMode = 'explain' | 'practice' | 'test';

export const TUTOR_MODES: TutorMode[] = ['explain', 'practice', 'test'];

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** How the tutor judged an answer. `unclear` is a real outcome: an
 *  ambiguous reply is said to be ambiguous rather than scored. */
export type Verdict = 'correct' | 'partial' | 'incorrect' | 'unclear';

/** What the student asked the tutor to do next. */
export type TutorAction =
  | 'start'
  | 'answer'
  | 'simplify'
  | 'example'
  | 'next'
  | 'mode'
  | 'sources';

/** One thing the tutor said. */
export interface TutorTurn {
  id: string;
  /** Present when this turn was a reply to something the student sent. */
  studentText?: string;
  action: TutorAction;
  status: 'pending' | 'done' | 'error';
  mode: TutorMode;
  difficulty: Difficulty;
  /** How the answer was judged, when this turn judged one. */
  verdict?: Verdict;
  feedback: string;
  explanation: string;
  example: string;
  question: string;
  /** Progressive, revealed one at a time without another model call. */
  hints: string[];
  /** Mentioned only when real SchoolMind data backs it. */
  schoolNote: string;
  sources?: WebSource[];
  usedWeb?: boolean;
  degraded?: 'web_unavailable' | 'no_results';
  error?: TutorErrorCode;
}

export interface TutorProgress {
  /** Questions the student has answered, however they scored. */
  answered: number;
  correct: number;
  partial: number;
  /** Consecutive correct answers — what nudges difficulty up. */
  streak: number;
  hintsUsed: number;
}

export const EMPTY_PROGRESS: TutorProgress = {
  answered: 0,
  correct: 0,
  partial: 0,
  streak: 0,
  hintsUsed: 0,
};

export interface TutorSession {
  subjectId: ID;
  topic: string;
  mode: TutorMode;
  difficulty: Difficulty;
  locale: Locale;
  turns: TutorTurn[];
  progress: TutorProgress;
  /** How many hints of the newest turn are already on screen. */
  revealedHints: number;
  startedAt: string;
}

export type TutorErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'network'
  | 'upstream_error'
  | 'malformed_response'
  | 'empty_response'
  | 'bad_request'
  | 'server_error';
