import type { WebSource } from '@/lib/ask/types';

/* ------------------------------------------------------------------
   SnapHomework vocabulary.

   The analysis shape is validated by the provider against a schema on
   the server, so the client never parses prose or markdown.
   ------------------------------------------------------------------ */

/** How much of the solution the student wants revealed. */
export type HelpLevel = 'hint' | 'explain' | 'solve';

export const HELP_LEVELS: HelpLevel[] = ['hint', 'explain', 'solve'];

export type SnapSubjectId =
  | 'math'
  | 'physics'
  | 'biology'
  | 'chemistry'
  | 'english'
  | 'history'
  | 'native'
  | 'it'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export interface SnapStep {
  title: string;
  detail: string;
}

export interface SnapAnalysis {
  /** False when the photo is not a school exercise at all. */
  isSchoolTask: boolean;
  /** False when the photo cannot actually be read. */
  readable: boolean;
  detectedSubject: SnapSubjectId;
  subjectConfidence: Confidence;
  detectedTasks: string[];
  taskSummary: string;
  conceptExplanation: string;
  hints: string[];
  steps: SnapStep[];
  /** Only ever populated at the "solve" help level. */
  finalAnswer: string;
  understandingQuestion: string;
  warnings: string[];
}

export type SnapErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'network'
  | 'upstream_error'
  | 'malformed_response'
  | 'empty_response'
  | 'image_too_large'
  | 'unsupported_type'
  | 'no_image'
  | 'read_failed'
  | 'question_too_long'
  | 'server_error'
  | 'bad_request';

export interface SelectedImage {
  /** Displayable and re-sendable; the photo never leaves memory. */
  dataUrl: string;
  base64: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export type SnapStatus = 'idle' | 'ready' | 'analysing' | 'done' | 'error';

/** Honest progress labels while one request is in flight. */
export type SnapPhase = 'reading' | 'detecting' | 'teaching';

export interface SnapFollowUp {
  id: string;
  question: string;
  status: 'pending' | 'searching' | 'done' | 'error';
  text?: string;
  sources?: WebSource[];
  usedWeb?: boolean;
  degraded?: 'web_unavailable' | 'no_results';
  error?: SnapErrorCode;
}
