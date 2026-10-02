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
  /** Grounded Google Search is supported on the Gemini 2.x+ flash family. */
  model: envValue('GEMINI_MODEL') ?? 'gemini-2.5-flash',
  /** Lets an operator turn grounded search off without removing the key. */
  webSearchEnabled: (envValue('ASKMYSCHOOL_WEB_SEARCH') ?? 'on') !== 'off',
};

export const hasGeminiKey = Boolean(config.geminiApiKey);

/** Safe for logs and for the /api/ask/status payload. */
export function describeConfig() {
  return {
    geminiConfigured: hasGeminiKey,
    webSearchEnabled: config.webSearchEnabled && hasGeminiKey,
    model: hasGeminiKey ? config.model : null,
  };
}
