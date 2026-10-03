import type { PlanItem, PlannerContext, PlannerErrorCode, StudyPlan } from './types';

/* The browser's only channel to the planner endpoints. The key stays
   on the server; this module posts the SchoolMind context and reads
   back a validated plan. */

const ERRORS: PlannerErrorCode[] = [
  'missing_api_key',
  'rate_limited',
  'network',
  'upstream_error',
  'malformed_response',
  'empty_response',
  'bad_request',
  'server_error',
];

function toErrorCode(value: unknown): PlannerErrorCode {
  return ERRORS.includes(value as PlannerErrorCode) ? (value as PlannerErrorCode) : 'server_error';
}

/** The server-validated half of a plan: everything except the
 *  bookkeeping the client owns (date, intensity, generatedAt). */
export interface PlanPayload {
  title: string;
  summary: string;
  totalStudyMinutes: number;
  items: PlanItem[];
  warnings: string[];
  note: string;
  /** The budget the plan was built against. An adjustment such as
   *  "fit it into two hours" changes it, and it carries forward. */
  availableMinutes: number;
}

export type PlanResponse =
  | { ok: true; plan: PlanPayload }
  | { ok: false; error: PlannerErrorCode };

async function post(url: string, body: unknown, signal?: AbortSignal): Promise<PlanResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
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

  const data = payload as { ok?: boolean; error?: unknown; plan?: PlanPayload };
  if (!response.ok || data.ok !== true || !data.plan || !Array.isArray(data.plan.items)) {
    return { ok: false, error: toErrorCode(data.error) };
  }
  return { ok: true, plan: data.plan };
}

export function postPlan(
  body: { locale: string; context: PlannerContext },
  signal?: AbortSignal,
): Promise<PlanResponse> {
  return post('/api/plan', body, signal);
}

export function postAdjust(
  body: { locale: string; context: PlannerContext; plan: StudyPlan; request: string },
  signal?: AbortSignal,
): Promise<PlanResponse> {
  return post('/api/plan/adjust', body, signal);
}
