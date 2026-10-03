import { describeConfig, hasGeminiKey } from './env.mjs';
import {
  AiUnavailableError,
  generate,
  isGroundingAvailable,
  isTemporarilyUnavailable,
  needsFreshInformation,
} from './gemini.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';
import { snapRoutes } from './snapHandler.mjs';

/* ------------------------------------------------------------------
   POST /api/ask        answer a question with Gemini, optionally
                        grounded in live Google Search
   GET  /api/ask/status what the client may offer (no secrets)

   School facts are resolved on the client from SchoolMind's own data
   and arrive here already summarised, so the model is given context
   to phrase — never asked to invent records.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 32 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_CONTEXT_CHARS = 4000;
const MAX_HISTORY_TURNS = 6;

const LANGUAGE = {
  uz: 'Uzbek (Latin script)',
  ru: 'Russian',
};

function buildSystemInstruction(locale, hasSchoolContext) {
  const language = LANGUAGE[locale] ?? LANGUAGE.uz;
  const lines = [
    'You are AskMySchool, the assistant built into SchoolMind, a school operating system used by a 9th-grade student.',
    `Always answer in ${language}.`,
    'Be brief and concrete: at most 4 short sentences, or a short list of up to 5 bullet lines starting with "- ".',
    'Write plain prose. Do not use markdown headings, bold markers or tables.',
    'Explain things at a level a 15-year-old understands.',
  ];
  if (hasSchoolContext) {
    lines.push(
      'A block labelled "SCHOOL DATA" may follow. It comes from the school\'s own records and is authoritative.',
      'Never contradict it, and never invent lessons, rooms, teachers, deadlines, tests or announcements that are not in it.',
      'If the school data does not contain what was asked, say plainly that it is not in the school records.',
    );
  }
  lines.push(
    'Never invent web sources, URLs or citations. If search results were provided, base factual claims on them.',
  );
  return lines.join('\n');
}

function sanitiseHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      text: turn.text.slice(0, 600),
    }));
}

async function handleAsk(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLarge;
    send(res, tooLarge ? 413 : 400, {
      ok: false,
      error: tooLarge ? 'payload_too_large' : 'bad_request',
    });
    return;
  }

  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question) {
    send(res, 400, { ok: false, error: 'empty_question' });
    return;
  }
  if (question.length > MAX_QUESTION_CHARS) {
    send(res, 400, { ok: false, error: 'question_too_long' });
    return;
  }

  if (!hasGeminiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const schoolContext =
    typeof payload.schoolContext === 'string' && payload.schoolContext.trim()
      ? payload.schoolContext.slice(0, MAX_CONTEXT_CHARS)
      : '';
  const history = sanitiseHistory(payload.history);

  let route = ['AI_KNOWLEDGE', 'WEB_SEARCH', 'HYBRID'].includes(payload.route)
    ? payload.route
    : 'AI_KNOWLEDGE';

  /* The deterministic router handles the obvious cases. Only when it is
     unsure do we spend a tiny model call deciding whether the question
     actually needs fresh information. */
  let routedByModel = false;
  if (route === 'AI_KNOWLEDGE' && payload.confidence === 'low') {
    try {
      if (await needsFreshInformation(question)) {
        route = 'WEB_SEARCH';
        routedByModel = true;
      }
    } catch {
      /* Classification is an optimisation; fall back to the router. */
    }
  }

  const wantsWeb = route === 'WEB_SEARCH' || route === 'HYBRID';

  const messages = [...history];
  if (schoolContext) {
    messages.push({
      role: 'user',
      text: `SCHOOL DATA (authoritative, from SchoolMind records):\n${schoolContext}`,
    });
  }
  messages.push({ role: 'user', text: question });

  const system = buildSystemInstruction(locale, Boolean(schoolContext));

  try {
    let result;
    let degraded = null;

    if (wantsWeb && !isGroundingAvailable()) {
      /* The account has already refused grounding recently; go straight
         to a plain answer and label it rather than burning a request. */
      result = await generate({ system, messages, web: false });
      degraded = 'web_unavailable';
    } else if (wantsWeb) {
      try {
        result = await generate({ system, messages, web: true });
        /* Search ran but the provider returned no grounding evidence —
           say so rather than claiming a grounded answer. */
        if (!result.usedWeb) degraded = 'no_results';
      } catch (searchError) {
        logFailure('grounded search', searchError);
        result = await generate({ system, messages, web: false });
        degraded = 'web_unavailable';
      }
    } else {
      result = await generate({ system, messages, web: false });
    }

    if (!result.text) {
      send(res, 502, { ok: false, error: 'empty_response' });
      return;
    }

    send(res, 200, {
      ok: true,
      text: result.text,
      sources: result.sources,
      usedWeb: result.usedWeb,
      searchQueries: result.searchQueries,
      route,
      routedByModel,
      degraded,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      send(res, 503, { ok: false, error: error.reason });
      return;
    }
    if (isTemporarilyUnavailable(error)) {
      logFailure(`all models unavailable (status ${error?.status})`, error);
      send(res, 429, { ok: false, error: 'rate_limited' });
      return;
    }
    logFailure('generateContent', error);
    send(res, 502, { ok: false, error: 'upstream_error' });
  }
}

/** Connect-style middleware shared by the dev and preview servers. */
export function askMiddleware(req, res, next) {
  const url = (req.url ?? '').split('?')[0];

  if (url === '/api/ask/status' && req.method === 'GET') {
    send(res, 200, { ok: true, ...describeConfig() });
    return;
  }

  if (snapRoutes(req, res, url)) return;

  if (url === '/api/ask') {
    if (req.method !== 'POST') {
      send(res, 405, { ok: false, error: 'method_not_allowed' });
      return;
    }
    handleAsk(req, res).catch((error) => {
      logFailure('request', error);
      send(res, 500, { ok: false, error: 'server_error' });
    });
    return;
  }

  next();
}
