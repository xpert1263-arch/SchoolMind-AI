import { postJson } from '@/lib/ai/request';
import type { WebSource } from '@/lib/ask/types';
import type { Difficulty, TutorAction, TutorErrorCode, TutorMode, Verdict } from './types';

/* The browser's only channel to the tutor. The key stays on the
   server; this module posts the lesson state and reads back one
   validated turn. */

const ERRORS: TutorErrorCode[] = [
  'missing_api_key',
  'rate_limited',
  'network',
  'timeout',
  'upstream_error',
  'malformed_response',
  'empty_response',
  'bad_request',
  'server_error',
];

function toErrorCode(value: unknown): TutorErrorCode {
  return ERRORS.includes(value as TutorErrorCode) ? (value as TutorErrorCode) : 'server_error';
}

/** The server-validated half of a turn. */
export interface TurnPayload {
  verdict: Verdict | null;
  feedback: string;
  explanation: string;
  example: string;
  question: string;
  hints: string[];
}

export interface TutorRequest {
  locale: string;
  action: TutorAction;
  mode: TutorMode;
  difficulty: Difficulty;
  subject: string;
  topic: string;
  studentName: string;
  classLabel: string;
  grade: number;
  /** A real SchoolMind fact the tutor may refer to, or ''. */
  schoolNote: string;
  studentAnswer: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}

export type TutorResponse =
  | {
      ok: true;
      turn: TurnPayload;
      sources: WebSource[];
      usedWeb: boolean;
      degraded: 'web_unavailable' | 'no_results' | null;
    }
  | { ok: false; error: TutorErrorCode };

export async function postTutor(
  body: TutorRequest,
  signal?: AbortSignal,
): Promise<TutorResponse> {
  const result = await postJson<{
    ok?: boolean;
    error?: unknown;
    turn?: TurnPayload;
    sources?: WebSource[];
    usedWeb?: boolean;
    degraded?: 'web_unavailable' | 'no_results' | null;
  }>('/api/tutor', body, { signal });
  if (!result.ok) return { ok: false, error: result.error };

  const data = result.body;
  if (result.status >= 400 || data.ok !== true || !data.turn) {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return {
    ok: true,
    turn: data.turn,
    sources: Array.isArray(data.sources) ? data.sources : [],
    usedWeb: data.usedWeb === true,
    degraded: data.degraded ?? null,
  };
}
