import { hasAnyAiKey, hasGroqKey, hasGeminiKey } from '../env.mjs';
import { AiUnavailableError, isRetriable, classifyAiError } from './errors.mjs';
import { geminiProvider, isGroundingAvailable, needsFreshInformation } from './gemini.mjs';
import { canSearch, groqProvider, listUsableModels, searchWeb as groqSearchWeb } from './groq.mjs';

/* ------------------------------------------------------------------
   The provider router.

   Every AI call in SchoolMind comes through here, and the order is
   always the same:

     Gemini  ->  Groq  ->  the caller's own deterministic fallback

   Three rules shape it.

   ONE AT A TIME. Providers are tried in sequence, never together. A
   question that Gemini answers costs exactly one request; Groq is
   only reached when Gemini could not answer at all. Asking both to
   race would double the bill on every keystroke of a free tier.

   ONLY FOR THE RIGHT FAILURES. Quota, busy, timeout, a network drop
   and a key the provider refuses are all reasons to ask somebody
   else. A request we built wrongly is not: failing over then would
   hide our own bug and spend a second provider's quota discovering
   the same thing. `isRetriable` draws that line.

   CAPABILITIES DO NOT MOVE. Reading an image and searching the live
   web exist on the Gemini side only. A call that needs either is
   never re-routed, because the honest answer when Gemini cannot run
   is "not available now" — not an answer from a provider that never
   saw the photo and cannot cite a page.

   The deterministic third tier is not here: it belongs to each
   feature, which knows what a trustworthy answer without a model
   looks like (a question bank, a lesson-plan skeleton, a timetable
   lookup). This file's job is to fail cleanly enough that the feature
   can reach it.
   ------------------------------------------------------------------ */

export { isGroundingAvailable, needsFreshInformation };
export { AiUnavailableError };

/** Configured providers in preference order. */
function providerChain() {
  return [geminiProvider, groqProvider].filter((provider) => provider.available());
}

export function aiAvailable() {
  return hasAnyAiKey;
}

/** Vision lives on the Gemini side alone. */
export function visionAvailable() {
  return hasGeminiKey;
}

/** True when SOME real search mechanism is configured. It says a path
 *  exists, never that a search succeeded — only a completed search
 *  with evidence may claim that. */
export function searchConfigured() {
  return (hasGeminiKey && isGroundingAvailable()) || canSearch();
}

/** Logged, never sent: says which provider served a call and why the
 *  one before it did not. */
function noteFailover(fromId, error, toId) {
  const category = classifyAiError(error);
  const detail = error?.status ? `${category}/${error.status}` : category;
  if (toId) {
    console.info(`[schoolmind-ai] ${fromId} unavailable (${detail}) — trying ${toId}`);
  } else {
    console.info(`[schoolmind-ai] ${fromId} unavailable (${detail}) — no provider left`);
  }
}

/**
 * Runs `attempt(provider)` down the chain until one succeeds.
 *
 * @param {(provider: object) => Promise<any>} attempt
 * @param {object} [options]
 * @param {boolean} [options.geminiOnly]  capability only Gemini has
 */
async function withProviderFailover(attempt, { geminiOnly = false } = {}) {
  const chain = geminiOnly
    ? providerChain().filter((provider) => provider.id === 'gemini')
    : providerChain();

  if (chain.length === 0) throw new AiUnavailableError('missing_api_key');

  let lastError;
  for (let i = 0; i < chain.length; i += 1) {
    const provider = chain[i];
    const next = chain[i + 1];
    try {
      return await attempt(provider);
    } catch (error) {
      lastError = error;
      if (!next || !isRetriable(error)) {
        if (next) noteFailover(provider.id, error, null);
        throw error;
      }
      noteFailover(provider.id, error, next.id);
    }
  }

  throw lastError ?? new AiUnavailableError('no_provider');
}

/**
 * Plain text generation. Never searches: a question about what is
 * true right now goes to `liveSearch` instead.
 */
export async function generate({ system, messages }) {
  return withProviderFailover((provider) => provider.generate({ system, messages, web: false }));
}

/**
 * A question that can only be answered from the live web.
 *
 * Two real mechanisms, tried in order, and nothing else:
 *
 *   Gemini grounded Google Search — citations from the provider's own
 *   grounding metadata.
 *
 *   Groq browser_search — searches and page reads executed on Groq's
 *   servers, with the record of what ran returned alongside.
 *
 * What this function will NOT do is fall back to an ordinary
 * completion. If neither search runs, it returns null and the caller
 * says the information could not be verified. An ungrounded answer to
 * "what happened today" is a guess wearing a timestamp, and that is
 * the one thing AskMySchool has never been willing to show.
 *
 * @returns {Promise<null | {text, sources, usedWeb, searchQueries, via}>}
 */
export async function liveSearch({ system, messages }) {
  /* 1. Gemini grounding, when the plan actually has it. */
  if (hasGeminiKey && isGroundingAvailable()) {
    try {
      const result = await geminiProvider.generate({ system, messages, web: true });
      /* usedWeb is only true when grounding evidence came back. */
      if (result.usedWeb && result.sources.length > 0) {
        return { ...result, via: 'gemini' };
      }
      console.info('[schoolmind-ai] gemini grounding returned no evidence — trying groq search');
    } catch (error) {
      noteFailover('gemini search', error, canSearch() ? 'groq search' : null);
    }
  }

  /* 2. Groq's browser_search. */
  if (canSearch()) {
    try {
      const result = await groqSearchWeb({ system, messages });
      console.info(
        `[schoolmind-ai] groq browser_search ran (${result.searchQueries.length} queries, ${result.sources.length} sources)`,
      );
      return { ...result, via: 'groq' };
    } catch (error) {
      noteFailover('groq search', error, null);
    }
  }

  /* No real search ran. The caller withholds. */
  return null;
}

/**
 * JSON generation against a schema. Nothing the model returns is
 * trusted by either provider path: the caller re-reads every field.
 *
 * @param {object} params
 * @param {boolean} [params.vision]  the parts carry an image
 */
export async function generateStructured({ system, parts, schema, vision = false }) {
  return withProviderFailover(
    (provider) => provider.generateStructured({ system, parts, schema, vision }),
    { geminiOnly: vision },
  );
}

/** One start-up line naming what is actually configured. Model names
 *  are server-side diagnostics and never travel to a browser. */
export async function describeProviders() {
  const parts = [];
  parts.push(hasGeminiKey ? 'Gemini ready' : 'Gemini not configured');

  if (!hasGroqKey) {
    parts.push('Groq not configured');
  } else {
    const usable = await listUsableModels();
    parts.push(usable.length > 0 ? `Groq ready (${usable[0]})` : 'Groq configured');
  }

  return parts.join(', ');
}
