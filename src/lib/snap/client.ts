import type { WebSource } from '@/lib/ask/types';
import type { HelpLevel, SnapAnalysis, SnapErrorCode } from './types';

/* The browser's only channel to Gemini Vision. The key stays on the
   server; this module just posts the photo and reads back a typed
   result. */

const ERRORS: SnapErrorCode[] = [
  'missing_api_key',
  'rate_limited',
  'network',
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
  let response: Response;
  try {
    response = await fetch('/api/snap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: 'server_error' };
  }

  const data = payload as { ok?: boolean; error?: unknown; mode?: HelpLevel; result?: SnapAnalysis };
  if (!response.ok || data.ok !== true || !data.result) {
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
  let response: Response;
  try {
    response = await fetch('/api/snap/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, error: 'server_error' };
  }

  const data = payload as {
    ok?: boolean;
    error?: unknown;
    text?: string;
    sources?: WebSource[];
    usedWeb?: boolean;
    degraded?: 'web_unavailable' | 'no_results' | null;
  };
  if (!response.ok || data.ok !== true || typeof data.text !== 'string') {
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
