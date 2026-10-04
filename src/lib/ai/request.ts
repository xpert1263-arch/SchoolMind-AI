/* ------------------------------------------------------------------
   One way to call a SchoolMind AI endpoint.

   Every AI request carries a deadline. A provider that never answers
   would otherwise leave a spinner turning on a student's screen with
   no way out — the worst thing that can happen on a stage. When the
   deadline passes the request is aborted and the caller is handed a
   `timeout`, which each feature phrases in its own words.

   The caller's own AbortSignal still works: cancelling a question
   because a newer one was asked aborts this too.
   ------------------------------------------------------------------ */

/** Plenty for a text turn; a stalled call is a failed call. */
export const AI_TIMEOUT_MS = 40_000;
/** Reading an image legitimately takes longer. */
export const VISION_TIMEOUT_MS = 70_000;
/* A live search runs queries and opens pages on the provider's side,
   so it routinely takes two or three times as long as an ordinary
   answer. Giving it the normal deadline would abort searches that
   were about to succeed. */
export const SEARCH_TIMEOUT_MS = 85_000;

export type AiTransportError = 'network' | 'timeout' | 'server_error';

export type JsonResult<T> =
  | { ok: true; status: number; body: T }
  | { ok: false; error: AiTransportError };

/**
 * POSTs JSON and returns the parsed body, whatever the status — a
 * handler's `{ ok: false, error }` payload is a normal response, not a
 * transport failure, and the caller decides what it means.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<JsonResult<T>> {
  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS;
  const controller = new AbortController();

  const timer = window.setTimeout(() => controller.abort('timeout'), timeoutMs);
  const relay = () => controller.abort('caller');
  options.signal?.addEventListener('abort', relay);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return { ok: false, error: 'server_error' };
    }
    return { ok: true, status: response.status, body: parsed as T };
  } catch {
    /* The caller cancelling is not a timeout; only our own deadline is. */
    if (options.signal?.aborted) return { ok: false, error: 'network' };
    return { ok: false, error: controller.signal.aborted ? 'timeout' : 'network' };
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', relay);
  }
}
