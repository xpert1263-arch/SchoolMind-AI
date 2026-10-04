import { hasAnyAiKey, hasGeminiKey } from './env.mjs';
import { generate, generateStructured, liveSearch } from './ai/index.mjs';
import { sendAiError } from './ai/errors.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';

/* ------------------------------------------------------------------
   POST /api/snap           analyse a homework photo and teach it
   POST /api/snap/followup  answer a question about that analysis

   The photo is processed inside the request and never written to disk
   or logged. SnapHomework teaches rather than dictates answers: the
   help level decides how much of the solution is revealed.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 14 * 1024 * 1024; // base64 inflates by ~4/3
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const HELP_LEVELS = new Set(['hint', 'explain', 'solve']);

const LANGUAGE = { uz: 'Uzbek (Latin script)', ru: 'Russian' };

/** Subject ids SnapHomework may report. Chemistry is included even
 *  though the demo timetable has none — a photo may still show it. */
const SUBJECT_IDS = [
  'math',
  'physics',
  'biology',
  'chemistry',
  'english',
  'history',
  'native',
  'it',
  'unknown',
];

/** Provider-validated shape, so the client never parses prose. */
const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    isSchoolTask: { type: 'BOOLEAN' },
    readable: { type: 'BOOLEAN' },
    detectedSubject: { type: 'STRING', enum: SUBJECT_IDS },
    subjectConfidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    detectedTasks: { type: 'ARRAY', items: { type: 'STRING' } },
    taskSummary: { type: 'STRING' },
    conceptExplanation: { type: 'STRING' },
    hints: { type: 'ARRAY', items: { type: 'STRING' } },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          detail: { type: 'STRING' },
        },
        required: ['title', 'detail'],
      },
    },
    finalAnswer: { type: 'STRING' },
    understandingQuestion: { type: 'STRING' },
    warnings: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: [
    'isSchoolTask',
    'readable',
    'detectedSubject',
    'subjectConfidence',
    'detectedTasks',
    'taskSummary',
    'conceptExplanation',
    'hints',
    'steps',
    'finalAnswer',
    'understandingQuestion',
    'warnings',
  ],
  propertyOrdering: [
    'isSchoolTask',
    'readable',
    'detectedSubject',
    'subjectConfidence',
    'detectedTasks',
    'taskSummary',
    'conceptExplanation',
    'hints',
    'steps',
    'finalAnswer',
    'understandingQuestion',
    'warnings',
  ],
};

const HELP_RULES = {
  hint: [
    'HELP LEVEL = HINT.',
    'Give 1 to 3 progressive hints that move the student forward without solving it.',
    'Leave "steps" empty and leave "finalAnswer" an empty string. Do not reveal the answer anywhere.',
  ],
  explain: [
    'HELP LEVEL = EXPLAIN.',
    'Explain the concept and the method, and give the solution steps.',
    'Leave "finalAnswer" an empty string so the student computes the result themselves.',
  ],
  solve: [
    'HELP LEVEL = SOLVE.',
    'Give the full worked solution step by step, then the final answer in "finalAnswer".',
  ],
};

function buildAnalysisPrompt(locale, mode) {
  return [
    'You are SnapHomework, the vision tutor inside SchoolMind, a school operating system.',
    `Always write in ${LANGUAGE[locale] ?? LANGUAGE.uz}.`,
    'A student has photographed their homework. Your job is to help them LEARN it, not to hand over answers to copy.',
    '',
    'Be honest about what you can actually see:',
    '- Set "readable" false when the photo is too blurry, dark, cropped or small to read the task. Then leave the teaching fields empty and put the reason in "warnings".',
    '- Set "isSchoolTask" false when the image is not a school exercise (a person, a place, an object, a screenshot of something else). Then leave the teaching fields empty.',
    '- Never invent a task, a number or a question you cannot see in the image.',
    '',
    'If several separate exercises are visible, list each briefly in "detectedTasks", teach only the first one, and add a warning that several were found.',
    'If only one exercise is visible, "detectedTasks" contains that one item.',
    `"detectedSubject" must be exactly one of: ${SUBJECT_IDS.join(', ')}.`,
    'Use "unknown" with low confidence rather than guessing a subject.',
    '',
    ...HELP_RULES[mode],
    '',
    'Always end with one short "understandingQuestion" that asks the student to try a similar task themselves.',
    'Write mathematics in plain Unicode: x², √, ≤, ≥, ·, π, and fractions as a/b. Never use LaTeX, never use markdown, never use ** or ##.',
    'Keep it tight: "taskSummary" at most 2 sentences, "conceptExplanation" at most 4 sentences, each step "detail" at most 2 sentences.',
  ].join('\n');
}

function buildFollowUpPrompt(locale) {
  return [
    'You are SnapHomework, the vision tutor inside SchoolMind, helping a student with the homework task described below.',
    `Always write in ${LANGUAGE[locale] ?? LANGUAGE.uz}, unless the student explicitly asks for another language.`,
    'Answer only about this task and the concept behind it. Keep it to at most 4 short sentences or 5 bullet lines starting with "- ".',
    'Explain, do not just assert. If the student says they did not understand a step, re-explain that step more simply with a small concrete example.',
    'Write mathematics in plain Unicode (x², √, ≤, ·, fractions as a/b). Never use LaTeX or markdown.',
    'If search results were provided, base factual claims on them and never invent a source.',
  ].join('\n');
}

/** Guards every teaching field when the model said it cannot see a task. */
function sanitiseAnalysis(raw, mode) {
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const usable = raw.isSchoolTask === true && raw.readable === true;

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter((s) => s && typeof s.title === 'string' && typeof s.detail === 'string')
        .map((s) => ({ title: s.title.trim(), detail: s.detail.trim() }))
    : [];

  return {
    isSchoolTask: raw.isSchoolTask === true,
    readable: raw.readable === true,
    detectedSubject: SUBJECT_IDS.includes(raw.detectedSubject) ? raw.detectedSubject : 'unknown',
    subjectConfidence: ['high', 'medium', 'low'].includes(raw.subjectConfidence)
      ? raw.subjectConfidence
      : 'low',
    detectedTasks: usable ? arr(raw.detectedTasks) : [],
    taskSummary: usable ? str(raw.taskSummary) : '',
    conceptExplanation: usable ? str(raw.conceptExplanation) : '',
    hints: usable ? arr(raw.hints) : [],
    /* Enforce the help level server-side: a model that over-shares
       cannot turn "hint" into a full solution. */
    steps: usable && mode !== 'hint' ? steps : [],
    finalAnswer: usable && mode === 'solve' ? str(raw.finalAnswer) : '',
    understandingQuestion: usable ? str(raw.understandingQuestion) : '',
    warnings: arr(raw.warnings),
  };
}

async function handleAnalyse(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLarge;
    send(res, tooLarge ? 413 : 400, {
      ok: false,
      error: tooLarge ? 'image_too_large' : 'bad_request',
    });
    return;
  }

  const image = typeof payload.image === 'string' ? payload.image : '';
  const mimeType = typeof payload.mimeType === 'string' ? payload.mimeType : '';
  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const mode = HELP_LEVELS.has(payload.mode) ? payload.mode : 'explain';

  if (!image) {
    send(res, 400, { ok: false, error: 'no_image' });
    return;
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    send(res, 415, { ok: false, error: 'unsupported_type' });
    return;
  }
  /* base64 is 4 characters per 3 bytes. */
  if (image.length * 0.75 > MAX_IMAGE_BYTES) {
    send(res, 413, { ok: false, error: 'image_too_large' });
    return;
  }
  /* Reading an image is a Gemini capability. There is no second
     provider to fall back to here, and guessing at a photo nobody
     looked at would be worse than saying so. */
  if (!hasGeminiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  try {
    const raw = await generateStructured({
      system: buildAnalysisPrompt(locale, mode),
      parts: [
        { inlineData: { mimeType, data: image } },
        { text: 'Analyse this homework photo and respond using the required JSON schema.' },
      ],
      schema: ANALYSIS_SCHEMA,
      vision: true,
    });
    send(res, 200, { ok: true, mode, result: sanitiseAnalysis(raw, mode) });
  } catch (error) {
    sendAiError(res, error, 'vision analysis');
  }
}

async function handleFollowUp(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, 64 * 1024)) || '{}');
  } catch {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }

  const question = typeof payload.question === 'string' ? payload.question.trim() : '';
  if (!question) {
    send(res, 400, { ok: false, error: 'empty_question' });
    return;
  }
  if (question.length > 600) {
    send(res, 400, { ok: false, error: 'question_too_long' });
    return;
  }
  if (!hasAnyAiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const wantsWeb = payload.web === true;
  const task = typeof payload.task === 'string' ? payload.task.slice(0, 3000) : '';
  const history = Array.isArray(payload.history)
    ? payload.history
        .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
        .slice(-4)
        .map((turn) => ({
          role: turn.role === 'model' ? 'model' : 'user',
          text: turn.text.slice(0, 600),
        }))
    : [];

  const messages = [...history];
  if (task) messages.push({ role: 'user', text: `TASK CONTEXT:\n${task}` });
  messages.push({ role: 'user', text: question });

  try {
    let result;
    let degraded = null;

    if (wantsWeb) {
      /* A follow-up that needs the live web takes the same route as
         AskMySchool: a real search, or an honest refusal. */
      const found = await liveSearch({ system: buildFollowUpPrompt(locale), messages });
      if (!found) {
        send(res, 200, {
          ok: true,
          text: '',
          sources: [],
          usedWeb: false,
          degraded: 'web_unavailable',
          withheld: true,
        });
        return;
      }
      result = found;
    } else {
      result = await generate({ system: buildFollowUpPrompt(locale), messages });
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
      degraded,
    });
  } catch (error) {
    sendAiError(res, error, 'snap follow-up');
  }
}

/** Returns true when it handled the request. */
export function snapRoutes(req, res, url) {
  if (url === '/api/snap' && req.method === 'POST') {
    handleAnalyse(req, res).catch((error) => {
      logFailure('snap request', error);
      send(res, 500, { ok: false, error: 'server_error' });
    });
    return true;
  }
  if (url === '/api/snap/followup' && req.method === 'POST') {
    handleFollowUp(req, res).catch((error) => {
      logFailure('snap follow-up request', error);
      send(res, 500, { ok: false, error: 'server_error' });
    });
    return true;
  }
  if (url === '/api/snap' || url === '/api/snap/followup') {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }
  return false;
}
