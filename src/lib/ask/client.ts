import type { AskCapabilities, AskErrorCode, AskRoute, WebSource } from './types';

/* The only place the browser talks to the AskMySchool API. No key ever
   crosses this boundary — it lives in the Node process. */

export interface AskRequest {
  question: string;
  locale: string;
  route: AskRoute;
  confidence: 'high' | 'low';
  schoolContext?: string;
  history: Array<{ role: 'user' | 'model'; text: string }>;
}

export interface AskSuccess {
  ok: true;
  text: string;
  sources: WebSource[];
  usedWeb: boolean;
  searchQueries: string[];
  route: AskRoute;
  routedByModel: boolean;
  degraded: 'web_unavailable' | 'no_results' | null;
}

export interface AskFailure {
  ok: false;
  error: AskErrorCode;
}

export type AskResponse = AskSuccess | AskFailure;

const KNOWN_ERRORS: AskErrorCode[] = [
  'missing_api_key',
  'network',
  'upstream_error',
  'empty_response',
  'question_too_long',
  'server_error',
];

function toErrorCode(value: unknown): AskErrorCode {
  return KNOWN_ERRORS.includes(value as AskErrorCode) ? (value as AskErrorCode) : 'server_error';
}

export async function postAsk(request: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
  let response: Response;
  try {
    response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
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

  const body = payload as Partial<AskSuccess> & { error?: unknown };
  if (!response.ok || body.ok !== true) {
    return { ok: false, error: toErrorCode(body.error) };
  }

  return {
    ok: true,
    text: typeof body.text === 'string' ? body.text : '',
    sources: Array.isArray(body.sources) ? body.sources : [],
    usedWeb: body.usedWeb === true,
    searchQueries: Array.isArray(body.searchQueries) ? body.searchQueries : [],
    route: (body.route as AskRoute) ?? request.route,
    routedByModel: body.routedByModel === true,
    degraded: body.degraded ?? null,
  };
}

/** What the server can actually do right now, for honest UI. */
export async function fetchCapabilities(): Promise<AskCapabilities> {
  try {
    const response = await fetch('/api/ask/status');
    if (!response.ok) return { geminiConfigured: false, webSearchEnabled: false };
    const body = (await response.json()) as Partial<AskCapabilities>;
    return {
      geminiConfigured: body.geminiConfigured === true,
      webSearchEnabled: body.webSearchEnabled === true,
    };
  } catch {
    return { geminiConfigured: false, webSearchEnabled: false };
  }
}
