import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/* ------------------------------------------------------------------
   Server-side configuration.

   Every secret this project uses is read here and nowhere else:

     GEMINI_API_KEY      primary AI provider
     GROQ_API_KEY        secondary AI provider (text only)
     TELEGRAM_BOT_TOKEN  Parent Connect delivery

   None of them is imported by anything under src/, none is sent to the
   browser, and none is ever logged. Their names must never gain a
   VITE_ prefix: that is the one change that would put them in the
   client bundle.
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

  groqApiKey: envValue('GROQ_API_KEY'),
  /* Groq's catalogue moves too. GPT-OSS 120B is the preferred free-tier
     model for structured schoolwork; the Llama below is the fallback if
     the account cannot serve it. GROQ_MODEL pins one. */
  groqModels: envValue('GROQ_MODEL')
    ? [envValue('GROQ_MODEL')]
    : ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'],

  telegramBotToken: envValue('TELEGRAM_BOT_TOKEN'),

  /** Lets an operator turn grounded search off without removing the key. */
  webSearchEnabled: (envValue('ASKMYSCHOOL_WEB_SEARCH') ?? 'on') !== 'off',
  /** Turns the Telegram update loop off without removing the token. */
  telegramPollingEnabled: (envValue('TELEGRAM_POLLING') ?? 'on') !== 'off',
};

export const hasGeminiKey = Boolean(config.geminiApiKey);
export const hasGroqKey = Boolean(config.groqApiKey);
export const hasTelegramToken = Boolean(config.telegramBotToken);

/** True when at least one AI provider is configured. Features check
 *  this instead of asking about one provider by name. */
export const hasAnyAiKey = hasGeminiKey || hasGroqKey;

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

/** The Gemini model to use for the next request. */
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
  console.info(`[schoolmind-ai] gemini: ${model} unavailable, trying ${next}`);
  return true;
}

/** The Groq model to use next, with the same parking rules. */
export function activeGroqModel() {
  return config.groqModels.find(isUsable) ?? config.groqModels[0];
}

export function markGroqModelExhausted(model, cooldownMs = QUOTA_COOLDOWN_MS) {
  exhaustedUntil.set(model, Date.now() + cooldownMs);
  const next = config.groqModels.find(isUsable);
  if (!next || next === model) return false;
  console.info(`[schoolmind-ai] groq: ${model} unavailable, trying ${next}`);
  return true;
}

/**
 * What the client is allowed to know about the configuration: which
 * capabilities exist, and nothing else. No key, no model name — a
 * model identifier is internal infrastructure and has no business on
 * a student's screen.
 */
export function describeConfig() {
  return {
    /** At least one text provider is configured. */
    aiConfigured: hasAnyAiKey,
    /** Reading an image needs Gemini; Groq cannot do it. */
    visionConfigured: hasGeminiKey,
    /** Grounded search needs Gemini and a plan that includes it. */
    webSearchEnabled: config.webSearchEnabled && hasGeminiKey,
    /** Parent Connect delivery. */
    telegramConfigured: hasTelegramToken,
  };
}

/** The same picture for the server log, where naming the model is
 *  useful and safe. Never sent to a browser. */
export function describeConfigForLog() {
  return {
    ...describeConfig(),
    geminiModel: hasGeminiKey ? activeModel() : null,
    groqModel: hasGroqKey ? activeGroqModel() : null,
  };
}
