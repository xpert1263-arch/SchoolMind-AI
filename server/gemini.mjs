import { GoogleGenAI } from '@google/genai';
import { config, hasGeminiKey } from './env.mjs';

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

/**
 * @param {object} params
 * @param {string} params.system        system instruction
 * @param {Array<{role:'user'|'model', text:string}>} params.messages
 * @param {boolean} [params.web]        request grounded Google Search
 * @returns {Promise<{text:string, sources:Array, usedWeb:boolean, searchQueries:string[]}>}
 */
export async function generate({ system, messages, web = false }) {
  const ai = getClient();
  const useWeb = web && config.webSearchEnabled;

  const request = {
    model: config.model,
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

  const response = await ai.models.generateContent(request);
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

/** Cheap freshness check for questions the deterministic router is
 *  unsure about. Returns true when the answer depends on current data. */
export async function needsFreshInformation(question) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: config.model,
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
