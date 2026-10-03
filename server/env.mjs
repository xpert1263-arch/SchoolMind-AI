import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ------------------------------------------------------------------
   Server-side configuration.

   The Gemini key is read here and nowhere else. It is never imported
   by anything under src/, never sent to the browser, and never logged.
   ------------------------------------------------------------------ */

/** Minimal .env reader — avoids a dependency for ~20 lines. */
function readEnvFile(file) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), file), 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv = { ...readEnvFile('.env.local'), ...readEnvFile('.env') };

/** process.env wins, so CI and shell exports override the file. */
function envValue(name) {
  const value = process.env[name] ?? fileEnv[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export const config = {
  geminiApiKey: envValue('GEMINI_API_KEY'),
  /* Models to try in order. Pinned names age out (gemini-2.5-flash now
     404s for new keys) and free-tier daily quota is per model, so a
     second name keeps a demo alive when the first is exhausted.
     GEMINI_MODEL pins one explicitly and disables failover. */
  models: envValue('GEMINI_MODEL')
    ? [envValue('GEMINI_MODEL')]
    : ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'],
  /** Lets an operator turn grounded search off without removing the key. */
  webSearchEnabled: (envValue('ASKMYSCHOOL_WEB_SEARCH') ?? 'on') !== 'off',
};

export const hasGeminiKey = Boolean(config.geminiApiKey);

/* Free-tier quota is counted per model and resets daily, so a refusal
   is a temporary fact about one model rather than a permanent
   downgrade. Each exhausted model is parked for a while and the first
   healthy candidate is used; when every one is parked we try the
   preferred model again rather than refusing outright. */
const QUOTA_COOLDOWN_MS = 30 * 60 * 1000;
const exhaustedUntil = new Map();

function isUsable(model) {
  return (exhaustedUntil.get(model) ?? 0) <= Date.now();
}

/** The model to use for the next request. */
export function activeModel() {
  return config.models.find(isUsable) ?? config.models[0];
}

/** Park `model` after a refusal. Quota refusals park for 30 minutes;
 *  a momentary busy signal parks for far less.
 *  Returns true when a different candidate is available to retry with. */
export function markModelExhausted(model, cooldownMs = QUOTA_COOLDOWN_MS) {
  exhaustedUntil.set(model, Date.now() + cooldownMs);
  const next = config.models.find(isUsable);
  if (!next || next === model) return false;
  console.info(`[schoolmind-ai] ${model} quota exhausted, falling back to ${next}`);
  return true;
}

/** Safe for logs and for the /api/ask/status payload. */
export function describeConfig() {
  return {
    geminiConfigured: hasGeminiKey,
    webSearchEnabled: config.webSearchEnabled && hasGeminiKey,
    model: hasGeminiKey ? activeModel() : null,
  };
}
