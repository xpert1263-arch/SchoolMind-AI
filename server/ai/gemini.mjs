import { GoogleGenAI } from '@google/genai';
import { activeModel, config, hasGeminiKey, markModelExhausted } from '../env.mjs';
import { AiUnavailableError, withTimeout } from './errors.mjs';

/* ------------------------------------------------------------------
   Gemini — the primary provider.

   Three capabilities, kept separate so the UI can be honest about
   which one actually ran:
     - generate()            plain model knowledge, no search
     - generate({web})       grounded Google Search, real citations
     - generateStructured()  JSON against a schema, text or image

   Vision and grounded search live here and nowhere else: no other
   provider in this project can read an image or cite the web, so
   neither capability may ever silently move.

   Nothing here fabricates a source. Citations are only ever read back
   out of the provider's own grounding metadata.
   ------------------------------------------------------------------ */

export { AiUnavailableError };

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
   straight past search. */
const GROUNDING_COOLDOWN_MS = 10 * 60 * 1000;
let groundingBlockedUntil = 0;

export function isGroundingAvailable() {
  return hasGeminiKey && config.webSearchEnabled && Date.now() >= groundingBlockedUntil;
}

function noteGroundingRefused() {
  groundingBlockedUntil = Date.now() + GROUNDING_COOLDOWN_MS;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* A provider call that has not answered by now is not going to. The
   vision budget is longer because an image takes longer to read. */
const TEXT_TIMEOUT_MS = 35 * 1000;
const VISION_TIMEOUT_MS = 60 * 1000;

/** A 503 is momentary oversubscription; park the model only briefly. */
const BUSY_COOLDOWN_MS = 60 * 1000;

/**
 * Walks the candidate models until one answers.
 *
 * A free-tier key hits two different walls, and they can chain: the
 * preferred model returns 429 because its daily quota is spent, and the
 * next one returns 503 because it is busy. Handling only one hop — as
 * this did originally — turned that pair into a hard failure.
 *
 *   429  quota spent        -> park 30 min, next candidate
 *   503  busy               -> one quick retry, then park 1 min, next
 *   anything else           -> a real error, surface it immediately
 *
 * `run` receives the model to use, so each attempt targets the right one.
 *
 * `onQuota` says what a 429 means for this call. For an ordinary
 * request it means the model is spent, so park it. For a *grounded*
 * request it usually means the plan lacks Google Search, which says
 * nothing about the model's plain-text quota — parking it there would
 * needlessly degrade every later answer.
 */
async function withModelFailover(run, { onQuota = 'park', timeoutMs = TEXT_TIMEOUT_MS } = {}) {
  const attempted = new Set();
  let lastError;

  while (attempted.size < config.models.length) {
    const model = activeModel();
    if (attempted.has(model)) break;
    attempted.add(model);

    try {
      return await withTimeout(run(model), timeoutMs);
    } catch (error) {
      lastError = error;

      /* A deadline is not a reason to try three more models and keep
         the student waiting three times as long. */
      if (error?.name === 'AiTimeoutError') throw error;

      if (error?.status === 503) {
        await sleep(1500);
        try {
          return await withTimeout(run(model), timeoutMs);
        } catch (retryError) {
          lastError = retryError;
          if (retryError?.status !== 503 && retryError?.status !== 429) throw retryError;
          markModelExhausted(model, BUSY_COOLDOWN_MS);
          continue;
        }
      }

      if (error?.status === 429) {
        if (onQuota === 'abort') throw error;
        markModelExhausted(model);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
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

  const buildRequest = (model) => ({
    model,
    contents: messages.map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    config: {
      systemInstruction: system,
      temperature: 0.3,
      ...(useWeb ? { tools: [{ googleSearch: {} }] } : {}),
    },
  });

  let response;
  try {
    response = await withModelFailover((model) => ai.models.generateContent(buildRequest(model)), {
      onQuota: useWeb ? 'abort' : 'park',
    });
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
 * Structured generation. `parts` may mix text and inlineData (image)
 * parts. The response is validated against `schema` by the provider
 * and parsed here.
 *
 * @returns {Promise<object>} the parsed object
 */
export async function generateStructured({ system, parts, schema, vision = false }) {
  const ai = getClient();
  const response = await withModelFailover(
    (model) =>
      ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: system,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    { timeoutMs: vision ? VISION_TIMEOUT_MS : TEXT_TIMEOUT_MS },
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
  const response = await withModelFailover((model) =>
    ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: question }] }],
      config: {
        temperature: 0,
        systemInstruction:
          'You classify a student question. Answer with exactly one word: ' +
          'WEB if answering correctly requires current, real-time or recent information ' +
          '(news, prices, weather, events, anything time-sensitive or post-training). ' +
          'KNOWLEDGE if stable general knowledge is enough. No punctuation, no explanation.',
      },
    }),
  );
  return readText(response).toUpperCase().includes('WEB');
}

/** The provider interface the router drives. */
export const geminiProvider = {
  id: 'gemini',
  /** Only ever reaches the server log. */
  label: 'Gemini',
  supportsVision: true,
  supportsGrounding: true,
  available: () => hasGeminiKey,
  generate,
  generateStructured,
};
