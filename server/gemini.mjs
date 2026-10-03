import { GoogleGenAI } from '@google/genai';
import { activeModel, config, hasGeminiKey, markModelExhausted } from './env.mjs';

/* ------------------------------------------------------------------
   Gemini provider.

   Two capabilities, kept separate so the UI can be honest about which
   one actually ran:
     - generate()       plain model knowledge, no search
     - generate({web})  grounded Google Search, returns real citations

   Nothing here fabricates a source. Citations are only ever read back
   out of the provider's own grounding metadata.
   ------------------------------------------------------------------ */

export class AiUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

let client = null;
function getClient() {
  if (!hasGeminiKey) {
    throw new AiUnavailableError('missing_api_key');
  }
  if (!client) client = new GoogleGenAI({ apiKey: config.geminiApiKey });
  return client;
}

/** Pull citations out of the response's grounding metadata.
 *  Supports both the groundingChunks shape and the newer url_citation
 *  annotations, and returns [] when the provider gave us neither. */
function extractSources(response) {
  const seen = new Map();

  const add = (uri, title) => {
    if (typeof uri !== 'string' || !/^https?:\/\//i.test(uri)) return;
    if (seen.has(uri)) return;
    let domain = '';
    try {
      domain = new URL(uri).hostname.replace(/^www\./, '');
    } catch {
      return;
    }
    seen.set(uri, { url: uri, title: (title || domain).trim(), domain });
  };

  for (const candidate of response?.candidates ?? []) {
    for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
      if (chunk?.web) add(chunk.web.uri, chunk.web.title);
    }
    for (const part of candidate?.content?.parts ?? []) {
      for (const annotation of part?.annotations ?? []) {
        if (annotation?.type === 'url_citation') add(annotation.url, annotation.title);
      }
    }
  }

  return [...seen.values()];
}

function extractSearchQueries(response) {
  const queries = new Set();
  for (const candidate of response?.candidates ?? []) {
    for (const q of candidate?.groundingMetadata?.webSearchQueries ?? []) {
      if (typeof q === 'string' && q.trim()) queries.add(q.trim());
    }
  }
  return [...queries];
}

function readText(response) {
  if (typeof response?.text === 'string' && response.text.trim()) return response.text.trim();
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

/** Google returns 429 both for per-minute rate limits and for a plan
 *  that simply does not include a capability. Either way the caller
 *  should stop and say so rather than retrying into the same wall. */
export function isRateLimited(error) {
  return error?.status === 429;
}

/* Grounded Google Search needs a billed tier. When the account does not
   have it, every web question would otherwise burn one doomed request
   before falling back. Remember the refusal for a while and skip
   straight to the ungrounded answer. */
const GROUNDING_COOLDOWN_MS = 10 * 60 * 1000;
let groundingBlockedUntil = 0;

export function isGroundingAvailable() {
  return config.webSearchEnabled && Date.now() >= groundingBlockedUntil;
}

function noteGroundingRefused() {
  groundingBlockedUntil = Date.now() + GROUNDING_COOLDOWN_MS;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 503 UNAVAILABLE means the model is momentarily oversubscribed, which
 *  is worth one quick retry. 429 is a quota decision — retrying it just
 *  delays an answer we are not going to get, so it fails fast. */
/**
 * Survives the two transient walls a free-tier key actually hits:
 *   503 the model is momentarily oversubscribed -> brief retry
 *   429 that model's daily quota is spent       -> next candidate
 * Both end by trying the next model, so a demo keeps working.
 */
async function withOverloadRetry(run) {
  const model = activeModel();
  try {
    return await run();
  } catch (first) {
    if (first?.status === 503) {
      await sleep(1500);
      try {
        return await run();
      } catch (second) {
        if (second?.status !== 503 || !markModelExhausted(model)) throw second;
        return run();
      }
    }
    if (first?.status === 429 && markModelExhausted(model)) {
      return run();
    }
    throw first;
  }
}

/**
 * @param {object} params
 * @param {string} params.system        system instruction
 * @param {Array<{role:'user'|'model', text:string}>} params.messages
 * @param {boolean} [params.web]        request grounded Google Search
 * @returns {Promise<{text:string, sources:Array, usedWeb:boolean, searchQueries:string[]}>}
 */
export async function generate({ system, messages, web = false }) {
  const ai = getClient();
  const useWeb = web && isGroundingAvailable();

  const request = {
    model: activeModel(),
    contents: messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    config: {
      systemInstruction: system,
      temperature: 0.3,
      ...(useWeb ? { tools: [{ googleSearch: {} }] } : {}),
    },
  };

  let response;
  try {
    response = await withOverloadRetry(() => ai.models.generateContent(request));
  } catch (error) {
    /* A grounded call rejected for quota tells us the capability is not
       available on this key, not that the question was bad. */
    if (useWeb && isRateLimited(error)) noteGroundingRefused();
    throw error;
  }
  const sources = useWeb ? extractSources(response) : [];
  const searchQueries = useWeb ? extractSearchQueries(response) : [];

  return {
    text: readText(response),
    sources,
    /* Only true when search was requested AND the provider actually
       came back with grounding evidence. Drives the "Web" badge. */
    usedWeb: useWeb && (sources.length > 0 || searchQueries.length > 0),
    searchQueries,
  };
}

/** Strips a ```json fence if the model wrapped its JSON in one. */
function parseJson(raw) {
  const cleaned = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  return JSON.parse(cleaned);
}

/**
 * Structured generation, used by SnapHomework Vision. `parts` may mix
 * text and inlineData (image) parts. The response is validated against
 * `schema` by the provider and parsed here.
 *
 * @returns {Promise<object>} the parsed object
 */
export async function generateStructured({ system, parts, schema }) {
  const ai = getClient();
  const response = await withOverloadRetry(() =>
    ai.models.generateContent({
      model: activeModel(),
      contents: [{ role: 'user', parts }],
      config: {
        systemInstruction: system,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  );

  const text = readText(response);
  if (!text) throw new Error('empty_response');
  try {
    return parseJson(text);
  } catch {
    throw new Error('malformed_response');
  }
}

/** Cheap freshness check for questions the deterministic router is
 *  unsure about. Returns true when the answer depends on current data. */
export async function needsFreshInformation(question) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: activeModel(),
    contents: [{ role: 'user', parts: [{ text: question }] }],
    config: {
      temperature: 0,
      systemInstruction:
        'You classify a student question. Answer with exactly one word: ' +
        'WEB if answering correctly requires current, real-time or recent information ' +
        '(news, prices, weather, events, anything time-sensitive or post-training). ' +
        'KNOWLEDGE if stable general knowledge is enough. No punctuation, no explanation.',
    },
  });
  return readText(response).toUpperCase().includes('WEB');
}
