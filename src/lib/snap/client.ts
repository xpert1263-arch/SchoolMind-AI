import { postJson, VISION_TIMEOUT_MS } from '@/lib/ai/request';
import type { WebSource } from '@/lib/ask/types';
import type { HelpLevel, SnapAnalysis, SnapErrorCode } from './types';

/* The browser's only channel to Gemini Vision. The key stays on the
   server; this module just posts the photo and reads back a typed
   result. */

const ERRORS: SnapErrorCode[] = [
  'missing_api_key',
  'rate_limited',
  'network',
  'timeout',
  'upstream_error',
  'malformed_response',
  'empty_response',
  'image_too_large',
  'unsupported_type',
  'no_image',
  'read_failed',
  'question_too_long',
  'server_error',
  'bad_request',
];

function toErrorCode(value: unknown): SnapErrorCode {
  return ERRORS.includes(value as SnapErrorCode) ? (value as SnapErrorCode) : 'server_error';
}

export type AnalyseResponse =
  | { ok: true; mode: HelpLevel; result: SnapAnalysis }
  | { ok: false; error: SnapErrorCode };

export async function postAnalyse(
  body: { image: string; mimeType: string; locale: string; mode: HelpLevel },
  signal?: AbortSignal,
): Promise<AnalyseResponse> {
  const posted = await postJson<{
    ok?: boolean;
    error?: unknown;
    mode?: HelpLevel;
    result?: SnapAnalysis;
  }>('/api/snap', body, { signal, timeoutMs: VISION_TIMEOUT_MS });
  if (!posted.ok) return { ok: false, error: posted.error };

  const data = posted.body;
  if (posted.status >= 400 || data.ok !== true || !data.result) {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return { ok: true, mode: data.mode ?? body.mode, result: data.result };
}

export type FollowUpResponse =
  | {
      ok: true;
      text: string;
      sources: WebSource[];
      usedWeb: boolean;
      degraded: 'web_unavailable' | 'no_results' | null;
    }
  | { ok: false; error: SnapErrorCode };

export async function postFollowUp(
  body: {
    question: string;
    locale: string;
    task: string;
    web: boolean;
    history: Array<{ role: 'user' | 'model'; text: string }>;
  },
  signal?: AbortSignal,
): Promise<FollowUpResponse> {
  const posted = await postJson<{
    ok?: boolean;
    error?: unknown;
    text?: string;
    sources?: WebSource[];
    usedWeb?: boolean;
    degraded?: 'web_unavailable' | 'no_results' | null;
  }>('/api/snap/followup', body, { signal });
  if (!posted.ok) return { ok: false, error: posted.error };

  const data = posted.body;
  if (posted.status >= 400 || data.ok !== true || typeof data.text !== 'string') {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return {
    ok: true,
    text: data.text,
    sources: Array.isArray(data.sources) ? data.sources : [],
    usedWeb: data.usedWeb === true,
    degraded: data.degraded ?? null,
  };
}
