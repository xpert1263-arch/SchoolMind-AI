import { postJson } from '@/lib/ai/request';
import type { QuizDifficulty, QuizErrorCode, QuizQuestion, QuizVerdict } from './types';

/* The browser's only channel to the quiz endpoints. Generation is one
   request per quiz; marking is one request per typed answer that
   SchoolMind could not settle itself. */

const ERRORS: QuizErrorCode[] = [
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

function toErrorCode(value: unknown): QuizErrorCode {
  return ERRORS.includes(value as QuizErrorCode) ? (value as QuizErrorCode) : 'server_error';
}

export interface GenerateRequest {
  locale: string;
  subject: string;
  topic: string;
  difficulty: QuizDifficulty;
  count: number;
  grade: number;
  classLabel: string;
}

export type GenerateResponse =
  | { ok: true; questions: QuizQuestion[] }
  | { ok: false; error: QuizErrorCode };

export async function postQuiz(
  body: GenerateRequest,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  const result = await postJson<{ ok?: boolean; error?: unknown; questions?: QuizQuestion[] }>(
    '/api/quiz',
    body,
    { signal },
  );
  if (!result.ok) return { ok: false, error: result.error };

  const data = result.body;
  if (result.status >= 400 || data.ok !== true || !Array.isArray(data.questions)) {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return { ok: true, questions: data.questions };
}

export type CheckResponse =
  | { ok: true; verdict: QuizVerdict; feedback: string }
  | { ok: false; error: QuizErrorCode };

export async function postCheck(
  body: { locale: string; prompt: string; expected: string; given: string },
  signal?: AbortSignal,
): Promise<CheckResponse> {
  const result = await postJson<{
    ok?: boolean;
    error?: unknown;
    verdict?: QuizVerdict;
    feedback?: string;
  }>('/api/quiz/check', body, { signal });
  if (!result.ok) return { ok: false, error: result.error };

  const data = result.body;
  if (result.status >= 400 || data.ok !== true || !data.verdict) {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return { ok: true, verdict: data.verdict, feedback: typeof data.feedback === 'string' ? data.feedback : '' };
}
