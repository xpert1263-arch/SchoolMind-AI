import { logFailure, send } from '../http.mjs';

/* ------------------------------------------------------------------
   One place that decides what a provider failure means.

   Nothing a provider says ever reaches a browser. A 429, a 503, an
   SDK exception, a model name, a quota URL — all of it stops here and
   becomes one of a handful of categories, each with a status code and
   a short wire code the client turns into its own localised sentence.

   Before this existed the same catch-ladder was copied into four
   handlers, which is how a raw status reaches a demo screen sooner or
   later.

   Since v1.6 the same vocabulary also answers a second question: is
   this failure worth asking the OTHER provider about? `isRetriable`
   says yes for quota, busy, timeout, network and an unusable
   provider, and no for a request we built wrongly — because failing
   over then would only hide our own bug behind a second bill.
   ------------------------------------------------------------------ */

export const AiErrorCategory = {
  MISSING_API_KEY: 'MISSING_API_KEY',
  QUOTA_UNAVAILABLE: 'QUOTA_UNAVAILABLE',
  PROVIDER_BUSY: 'PROVIDER_BUSY',
  /** The key or the model is refused: this provider cannot serve us. */
  PROVIDER_UNUSABLE: 'PROVIDER_UNUSABLE',
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  SEARCH_UNAVAILABLE: 'SEARCH_UNAVAILABLE',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  BAD_REQUEST: 'BAD_REQUEST',
  UNKNOWN_AI_ERROR: 'UNKNOWN_AI_ERROR',
};

/** Raised when a provider call outlives its budget. */
export class AiTimeoutError extends Error {
  constructor(ms) {
    super(`ai_timeout_${ms}ms`);
    this.name = 'AiTimeoutError';
    this.timeoutMs = ms;
  }
}

/** Raised when no provider is configured, or none could be reached. */
export class AiUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

/* Category -> what the browser is told. The codes are the vocabulary
   the clients already speak, so each feature keeps its own wording. */
const WIRE = {
  [AiErrorCategory.MISSING_API_KEY]: { status: 503, code: 'missing_api_key' },
  [AiErrorCategory.QUOTA_UNAVAILABLE]: { status: 429, code: 'rate_limited' },
  [AiErrorCategory.PROVIDER_BUSY]: { status: 429, code: 'rate_limited' },
  [AiErrorCategory.PROVIDER_UNUSABLE]: { status: 502, code: 'upstream_error' },
  [AiErrorCategory.TIMEOUT]: { status: 504, code: 'timeout' },
  [AiErrorCategory.NETWORK_ERROR]: { status: 502, code: 'network' },
  [AiErrorCategory.SEARCH_UNAVAILABLE]: { status: 200, code: 'search_unavailable' },
  [AiErrorCategory.INVALID_RESPONSE]: { status: 502, code: 'malformed_response' },
  [AiErrorCategory.BAD_REQUEST]: { status: 400, code: 'bad_request' },
  [AiErrorCategory.UNKNOWN_AI_ERROR]: { status: 502, code: 'upstream_error' },
};

const NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** What kind of failure this is, from its shape alone. Both providers
 *  report HTTP-shaped statuses, so one ladder covers them. */
export function classifyAiError(error) {
  if (error?.name === 'AiUnavailableError') {
    return error.reason === 'missing_api_key'
      ? AiErrorCategory.MISSING_API_KEY
      : AiErrorCategory.PROVIDER_UNUSABLE;
  }
  if (error instanceof AiTimeoutError || error?.name === 'AiTimeoutError') {
    return AiErrorCategory.TIMEOUT;
  }

  const status = Number(error?.status);
  if (status === 429) return AiErrorCategory.QUOTA_UNAVAILABLE;
  if (status === 503 || status === 502 || status === 504 || status === 529) {
    return AiErrorCategory.PROVIDER_BUSY;
  }
  /* 401/403 is a key the provider will not accept; 404 is a model name
     it does not have. Both mean this provider cannot serve us, which
     is a fact about the provider and not about the question. */
  if (status === 401 || status === 403 || status === 404) {
    return AiErrorCategory.PROVIDER_UNUSABLE;
  }
  /* 400 is us: a malformed request or an unsupported option. Sending
     the same thing to another provider would fail the same way. */
  if (status === 400 || status === 422) return AiErrorCategory.BAD_REQUEST;

  const code = error?.cause?.code ?? error?.code;
  if (typeof code === 'string' && NETWORK_CODES.has(code)) return AiErrorCategory.NETWORK_ERROR;
  if (error?.name === 'AbortError') return AiErrorCategory.TIMEOUT;
  if (error?.name === 'TypeError' && /fetch/i.test(error?.message ?? '')) {
    return AiErrorCategory.NETWORK_ERROR;
  }

  const message = error instanceof Error ? error.message : '';
  if (message === 'malformed_response' || message === 'empty_response') {
    return AiErrorCategory.INVALID_RESPONSE;
  }
  if (message === 'empty_schema_response') return AiErrorCategory.INVALID_RESPONSE;

  return AiErrorCategory.UNKNOWN_AI_ERROR;
}

/** Categories where trying the other provider is the right move. */
const RETRIABLE = new Set([
  AiErrorCategory.QUOTA_UNAVAILABLE,
  AiErrorCategory.PROVIDER_BUSY,
  AiErrorCategory.PROVIDER_UNUSABLE,
  AiErrorCategory.TIMEOUT,
  AiErrorCategory.NETWORK_ERROR,
  AiErrorCategory.MISSING_API_KEY,
  /* A provider that answered with unusable JSON may simply be the
     weaker one at this task; the next provider gets one chance. */
  AiErrorCategory.INVALID_RESPONSE,
]);

/** Whether this failure justifies asking the next provider. */
export function isRetriable(error) {
  return RETRIABLE.has(classifyAiError(error));
}

/**
 * Logs the failure (scrubbed) and answers the request with a code the
 * client can translate. `label` only ever reaches the server log.
 */
export function sendAiError(res, error, label) {
  const category = classifyAiError(error);
  const { status, code } = WIRE[category] ?? WIRE[AiErrorCategory.UNKNOWN_AI_ERROR];

  /* The status is worth having in the log; it is exactly what must not
     be in the response. */
  const detail = error?.status
    ? `${label} (${category}, provider status ${error.status})`
    : `${label} (${category})`;
  logFailure(detail, error);

  send(res, status, { ok: false, error: code });
  return category;
}

/** Provider calls get a deadline so a stalled request cannot leave a
 *  spinner turning on somebody's screen for ever. */
export function withTimeout(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        onTimeout?.();
        reject(new AiTimeoutError(ms));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
