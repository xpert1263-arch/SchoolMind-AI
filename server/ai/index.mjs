import { hasAnyAiKey, hasGroqKey, hasGeminiKey } from '../env.mjs';
import { AiUnavailableError, isRetriable, classifyAiError } from './errors.mjs';
import { geminiProvider, isGroundingAvailable, needsFreshInformation } from './gemini.mjs';
import { groqProvider, listUsableModels } from './groq.mjs';

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
 * Plain or grounded text generation.
 *
 * A grounded request never leaves Gemini: Groq cannot cite anything,
 * and an uncited answer to "what happened today" is exactly what
 * AskMySchool refuses to produce.
 */
export async function generate({ system, messages, web = false }) {
  return withProviderFailover(
    (provider) => provider.generate({ system, messages, web }),
    { geminiOnly: web },
  );
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
