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

/**
 * One chat completion. Returns the whole assistant message, because
 * the search path needs `executed_tools` — the record of what the
 * server actually ran — and not merely the prose at the end of it.
 */
async function call(model, { system, messages, responseFormat, temperature, tools, toolChoice, maxTokens }) {
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
    ...(tools ? { tools, tool_choice: toolChoice ?? 'required' } : {}),
    ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
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

  return body?.choices?.[0]?.message ?? {};
}

/** The prose part of a message. */
const contentOf = (message) =>
  typeof message?.content === 'string' ? message.content.trim() : '';

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
  const message = await withModelFailover((model) => call(model, { system, messages }));
  return { text: contentOf(message), sources: [], usedWeb: false, searchQueries: [] };
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

  const message = await withModelFailover((model) =>
    call(model, {
      system: systemWithSchema,
      messages: [{ role: 'user', text: prompt }],
      responseFormat: { type: 'json_object' },
      temperature: 0.2,
    }),
  );
  const text = contentOf(message);

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

/* ------------------------------------------------------------------
   Live web search, through Groq's server-side browser_search tool.

   This is a REAL search: Groq runs the queries and opens the pages on
   its own servers, and the reply carries `executed_tools` — a record
   of every search it ran and every result it saw. That record is the
   whole point. A "live" answer is only allowed to exist when this
   function can show the evidence behind it, so:

     - if `executed_tools` contains no browser search, the call throws
       rather than returning the model's own recollection
     - if no result carried a usable URL, it throws for the same reason
     - the sources rendered to a pupil are URLs the search actually
       returned, never URLs composed by a model

   Only the gpt-oss models support the tool; a Llama fallback cannot
   search, so the search path refuses rather than quietly answering
   from memory.
   ------------------------------------------------------------------ */

/* Searching browses several pages, so it is far slower than a chat
   completion and needs its own budget. */
const SEARCH_TIMEOUT_MS = 70 * 1000;
const MAX_SOURCES = 5;

/** Every configured model that can run browser_search, in order.
 *
 *  More than one matters: the daily token budget is counted PER
 *  MODEL, and a search is token-hungry because each page it opens is
 *  fed back in as prompt. One busy afternoon can exhaust the large
 *  model's day while the smaller one still has room, and a demo
 *  should fall to the smaller model rather than lose live search. */
function searchModels() {
  return config.groqModels.filter((model) => /gpt-oss/i.test(model));
}

export function canSearch() {
  return hasGroqKey && searchModels().length > 0;
}

/** Normalises one search hit, or null if it is not a usable source. */
function readSource(raw) {
  const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
  if (!/^https?:\/\//i.test(url)) return null;
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  return { url, title: title || domain, domain };
}

/**
 * Pulls the evidence out of a completed search.
 *
 * A search can return a hundred hits across a dozen queries, which is
 * not a source list — it is a haystack. The ones shown are the pages
 * the answer actually leans on: first any URL the model wrote into its
 * reply, then the earliest hits from the first query it ran.
 */
function readSearchEvidence(message, answerText) {
  const tools = Array.isArray(message?.executed_tools) ? message.executed_tools : [];
  const searches = tools.filter(
    (tool) => tool?.type === 'browser_search' || tool?.name === 'browser.search',
  );

  const queries = [];
  for (const tool of searches) {
    try {
      const args =
        typeof tool.arguments === 'string' ? JSON.parse(tool.arguments) : tool.arguments;
      if (args?.query) queries.push(String(args.query).slice(0, 120));
    } catch {
      /* Arguments we cannot read are not worth failing over. */
    }
  }

  /* Every hit, in the order the searches produced them. */
  const found = [];
  const seen = new Set();
  for (const tool of tools) {
    for (const raw of tool?.search_results?.results ?? []) {
      const source = readSource(raw);
      if (!source || seen.has(source.url)) continue;
      seen.add(source.url);
      found.push(source);
    }
  }

  /* A URL the model typed into its answer is one it definitely used. */
  const cited = new Set(
    (answerText.match(/https?:\/\/[^\s)<>"'\u3010\u3011]+/g) ?? []).map((url) =>
      url.replace(/[.,;:]+$/, ''),
    ),
  );

  const ranked = [
    ...found.filter((source) => cited.has(source.url)),
    ...found.filter((source) => !cited.has(source.url)),
  ];

  return {
    ran: searches.length > 0,
    searchQueries: [...new Set(queries)].slice(0, 4),
    sources: ranked.slice(0, MAX_SOURCES),
  };
}

/** Strips the tool's internal citation marks and bare URLs: the
 *  sources are rendered as real links beside the answer, so leaving
 *  "\u301021\u2020L14-L22\u3011" in the prose only makes it look broken. */
function tidyAnswer(text) {
  return text
    .replace(/\u3010[^\u3011]*\u3011/g, '')
    .replace(/\(?\s*https?:\/\/[^\s)<>"']+\s*\)?/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Answers a question from the live web.
 *
 * @returns {Promise<{text:string, sources:Array, usedWeb:boolean, searchQueries:string[]}>}
 * @throws when no real search ran, so the caller can withhold.
 */
export async function searchWeb({ system, messages }) {
  ensureKey();
  const models = searchModels();
  if (models.length === 0) throw new AiUnavailableError('search_unsupported');

  /* Kept deliberately tight. Left alone the tool will open a dozen
     pages and spend half a million prompt tokens on one question. */
  const searchSystem = [
    system,
    '',
    'HOW TO ANSWER THIS ONE:',
    '- Run one or two searches at most, and open at most two pages.',
    '- Answer in at most 4 short sentences.',
    '- Base every factual claim on what the pages actually say.',
    '- Do not state a date unless the page states it. Never guess at today\u2019s date.',
    '- Do not describe your searching. Give the answer.',
  ].join('\n');

  let message = null;
  let lastError;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      message = await withTimeout(
        call(model, {
          system: searchSystem,
          messages,
          tools: [{ type: 'browser_search' }],
          toolChoice: 'required',
          maxTokens: 900,
          temperature: 0.2,
        }),
        SEARCH_TIMEOUT_MS,
      );
      break;
    } catch (error) {
      lastError = error;
      const status = Number(error?.status);
      /* Out of budget or busy on this model: try the next one that
         can search. Anything else is not about the model. */
      const retriable = status === 429 || status === 503 || status === 502 || status === 404;
      if (!retriable || i === models.length - 1) throw error;
      console.info(
        `[schoolmind-ai] groq search: ${model} unavailable (${status}) — trying ${models[i + 1]}`,
      );
    }
  }
  if (!message) throw lastError ?? new AiUnavailableError('search_unsupported');

  const raw = contentOf(message);
  const { ran, sources, searchQueries } = readSearchEvidence(message, raw);

  /* No search, or nothing to stand behind: refuse rather than pass
     off model recollection as today's web. */
  if (!ran) throw new Error('search_not_executed');
  if (sources.length === 0) throw new Error('search_no_results');

  const text = tidyAnswer(raw);
  if (!text) throw new Error('empty_response');

  return { text, sources, usedWeb: true, searchQueries };
}
