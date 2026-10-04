import {
  activeGroqModel,
  config,
  hasGroqKey,
  markGroqModelExhausted,
} from '../env.mjs';
import { AiUnavailableError, withTimeout } from './errors.mjs';

/* ------------------------------------------------------------------
   Groq — the secondary provider, text only.

   Reached over its OpenAI-compatible REST endpoint rather than with
   another SDK: one fetch call is less to go wrong, and nothing here
   needs streaming.

   What this provider deliberately CANNOT do:

     vision      it never sees an image. A request carrying image data
                 is refused outright, so a Gemini vision outage can
                 never be papered over with a guess about a photo
                 nobody looked at.
     web search  it has no grounding and returns no citations, so it is
                 never asked a question about what is true right now.

   Both refusals are the point. A fallback that quietly answers a
   different question than the one asked is worse than no fallback.
   ------------------------------------------------------------------ */

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS_ENDPOINT = 'https://api.groq.com/openai/v1/models';

const TEXT_TIMEOUT_MS = 30 * 1000;
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
const BUSY_COOLDOWN_MS = 60 * 1000;

/** An HTTP failure, shaped so `classifyAiError` can read it. */
function providerError(status, body) {
  const message =
    (typeof body === 'object' && body !== null && (body.error?.message ?? body.message)) ||
    `groq_http_${status}`;
  const error = new Error(String(message).slice(0, 200));
  error.status = status;
  error.name = 'GroqError';
  return error;
}

async function call(model, { system, messages, responseFormat, temperature }) {
  const payload = {
    model,
    temperature: temperature ?? 0.3,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      ...messages.map((m) => ({
        role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user',
        content: m.text,
      })),
    ],
    ...(responseFormat ? { response_format: responseFormat } : {}),
  };

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        /* The key is read from the server environment and used here.
           It is never returned, logged or echoed into a response. */
        Authorization: `Bearer ${config.groqApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    const error = new Error('groq_network');
    error.cause = cause;
    error.code = cause?.cause?.code ?? cause?.code;
    throw error;
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    /* A non-JSON body from a 5xx is still a provider failure. */
  }

  if (!response.ok) throw providerError(response.status, body);

  const choice = body?.choices?.[0]?.message;
  const text = typeof choice?.content === 'string' ? choice.content.trim() : '';
  return text;
}

/**
 * Walks the candidate models until one answers, with the same parking
 * rules as the Gemini side: a spent model is remembered rather than
 * retried on every request.
 */
async function withModelFailover(run) {
  const attempted = new Set();
  let lastError;

  while (attempted.size < config.groqModels.length) {
    const model = activeGroqModel();
    if (attempted.has(model)) break;
    attempted.add(model);

    try {
      return await withTimeout(run(model), TEXT_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      if (error?.name === 'AiTimeoutError') throw error;

      const status = Number(error?.status);
      if (status === 429) {
        markGroqModelExhausted(model, QUOTA_COOLDOWN_MS);
        continue;
      }
      if (status === 503 || status === 502 || status === 504) {
        markGroqModelExhausted(model, BUSY_COOLDOWN_MS);
        continue;
      }
      /* 404: this account cannot serve that model name. Park it for
         long enough that we stop asking, and try the next one. */
      if (status === 404 || status === 400) {
        markGroqModelExhausted(model, QUOTA_COOLDOWN_MS);
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new AiUnavailableError('no_groq_model');
}

function ensureKey() {
  if (!hasGroqKey) throw new AiUnavailableError('missing_api_key');
}

export async function generate({ system, messages }) {
  ensureKey();
  const text = await withModelFailover((model) => call(model, { system, messages }));
  return { text, sources: [], usedWeb: false, searchQueries: [] };
}

/* ---- structured output ---------------------------------------------
   Gemini validates JSON against a schema itself. Groq is asked for a
   JSON object and given the schema in words; every field is then
   re-read by the handler that asked, exactly as it already re-reads
   Gemini's. The trust level is identical: none. */

/** Gemini's uppercase schema dialect rendered as ordinary JSON Schema,
 *  which is what a general-purpose model understands best. */
function toJsonSchema(node) {
  if (!node || typeof node !== 'object') return {};
  const type = typeof node.type === 'string' ? node.type.toLowerCase() : undefined;
  const out = {};
  if (type) out.type = type === 'integer' ? 'integer' : type;
  if (Array.isArray(node.enum)) out.enum = node.enum;
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([key, value]) => [key, toJsonSchema(value)]),
    );
  }
  if (node.items) out.items = toJsonSchema(node.items);
  if (Array.isArray(node.required)) out.required = node.required;
  return out;
}

export async function generateStructured({ system, parts, schema, vision = false }) {
  ensureKey();

  /* The refusal that keeps this provider honest. */
  const carriesImage = (parts ?? []).some((part) => part?.inlineData || part?.fileData);
  if (vision || carriesImage) {
    throw new AiUnavailableError('vision_unsupported');
  }

  const prompt = (parts ?? [])
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n\n');

  const schemaText = JSON.stringify(toJsonSchema(schema));
  const systemWithSchema = [
    system,
    '',
    'OUTPUT FORMAT — this is absolute:',
    'Reply with a single JSON object and nothing else. No prose before or after it, no markdown fence, no comments.',
    `It must match this JSON Schema exactly, including every required key: ${schemaText}`,
    'Every key in "required" must be present. Use an empty string or an empty array for a field you have nothing to put in, never null and never a missing key.',
  ].join('\n');

  const text = await withModelFailover((model) =>
    call(model, {
      system: systemWithSchema,
      messages: [{ role: 'user', text: prompt }],
      responseFormat: { type: 'json_object' },
      temperature: 0.2,
    }),
  );

  if (!text) throw new Error('empty_response');

  /* Some models wrap JSON in a fence or prefix it with reasoning even
     when told not to. Recover the object rather than failing over for
     a formatting habit. */
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through to the single malformed_response below */
      }
    }
    throw new Error('malformed_response');
  }
}

/**
 * Which of the configured model names this key can actually serve.
 * Used once at start-up for the log line, so the final report can
 * name the model that really answered instead of the one we hoped
 * for. Returns [] when the key is missing or the catalogue cannot be
 * read — it is diagnostics, never a gate.
 */
export async function listUsableModels() {
  if (!hasGroqKey) return [];
  try {
    const response = await withTimeout(
      fetch(MODELS_ENDPOINT, { headers: { Authorization: `Bearer ${config.groqApiKey}` } }),
      8000,
    );
    if (!response.ok) return [];
    const body = await response.json();
    const ids = new Set((body?.data ?? []).map((entry) => entry?.id).filter(Boolean));
    return config.groqModels.filter((model) => ids.has(model));
  } catch {
    return [];
  }
}

/** The provider interface the router drives. */
export const groqProvider = {
  id: 'groq',
  label: 'Groq',
  supportsVision: false,
  supportsGrounding: false,
  available: () => hasGroqKey,
  generate,
  generateStructured,
};
