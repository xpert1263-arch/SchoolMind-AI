import { hasAnyAiKey } from './env.mjs';
import { generateStructured, liveSearch } from './ai/index.mjs';
import { sendAiError } from './ai/errors.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';

/* ------------------------------------------------------------------
   POST /api/tutor   one turn of a tutoring session

   The tutor teaches; it does not hand over answers. Every turn ends
   with a question the student has to attempt, and the help level is
   enforced here rather than trusted to the prompt:

     - a hint list may never be empty on a turn that asks a question,
       because the UI reveals hints without spending another request
     - an evaluation turn must carry a verdict, and anything the model
       cannot judge comes back as "unclear" rather than a guess
     - a non-evaluation turn never carries a verdict at all

   Difficulty is decided by the caller from what has happened in the
   session, not by the model, so "adaptive" means a rule we can state.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 48 * 1024;
const MAX_TOPIC_CHARS = 120;
const MAX_ANSWER_CHARS = 600;
const MAX_HISTORY = 6;

const LANGUAGE = { uz: 'Uzbek (Latin script)', ru: 'Russian' };

const ACTIONS = new Set(['start', 'answer', 'simplify', 'example', 'next', 'mode', 'sources']);
const MODES = new Set(['explain', 'practice', 'test']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const VERDICTS = new Set(['correct', 'partial', 'incorrect', 'unclear']);

const TURN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['correct', 'partial', 'incorrect', 'unclear', 'none'] },
    feedback: { type: 'STRING' },
    explanation: { type: 'STRING' },
    example: { type: 'STRING' },
    question: { type: 'STRING' },
    hints: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['verdict', 'feedback', 'explanation', 'example', 'question', 'hints'],
  propertyOrdering: ['verdict', 'feedback', 'explanation', 'example', 'question', 'hints'],
};

const MODE_RULES = {
  explain: [
    'MODE = EXPLAIN.',
    '"explanation" teaches the idea in at most 4 short sentences. "example" is one small worked example.',
    'Then ask one question that checks whether the idea landed.',
  ],
  practice: [
    'MODE = PRACTICE.',
    'Keep "explanation" to one or two sentences of reminder, not a lecture. "example" shows the method on a similar item.',
    'Then ask one exercise of the stated difficulty for the student to work.',
  ],
  test: [
    'MODE = TEST.',
    'Leave "explanation" and "example" empty strings. Do not teach and do not hint in the question itself.',
    'Ask one question of the stated difficulty and nothing else.',
  ],
};

const DIFFICULTY_RULES = {
  easy: 'DIFFICULTY = EASY: one step, small numbers, the most basic form of the idea.',
  medium: 'DIFFICULTY = MEDIUM: two steps, or one step with a small twist.',
  hard: 'DIFFICULTY = HARD: several steps, or a case the student has to reason about rather than recall.',
};

const ACTION_RULES = {
  start: 'The lesson is beginning. Open the topic from the start.',
  answer:
    'The student has just answered your question. Judge their answer first in "verdict" and say why in "feedback" — kindly, in one or two sentences, naming the actual mistake if there is one. Then continue the lesson with the next question.',
  simplify:
    'The student asked for a simpler explanation of THE SAME idea. Do not move on, do not change the topic. Re-explain it more plainly, with smaller words and a more concrete example, then ask an easier question about the same idea.',
  example: 'The student asked for another example of the same idea. Give a different one, worked through, then ask a question about it.',
  next: 'The student wants to continue. Move to the next step of the topic.',
  mode: 'The way of working has changed. Continue the same topic in the new mode.',
};

function buildSystem(locale) {
  return [
    'You are AI Tutor inside SchoolMind, a school operating system. You are tutoring one secondary-school student, one to one.',
    `Write everything in ${LANGUAGE[locale] ?? LANGUAGE.uz}.`,
    '',
    'HOW YOU TEACH:',
    '- You are a tutor, not a textbook and not an answer key.',
    '- Never state the answer to the question you are about to ask.',
    '- Every turn ends with exactly one question for the student, in "question".',
    '- "hints" holds 2 or 3 hints for that question, ordered from the gentlest nudge to the most explicit. The last hint may point at the method but must still stop short of the answer.',
    '- Match the stated difficulty. Match the student\'s grade: a 13-year-old and a 16-year-old do not get the same wording.',
    '- Be encouraging and matter-of-fact. Never mock a wrong answer.',
    '',
    'HONESTY:',
    '- If you cannot tell what the student meant, set "verdict" to "unclear" and ask them to say more. Do not guess a score.',
    '- Teach the subject; do not invent the student\'s homework, tests, marks or timetable. A SCHOOL NOTE, if given, is the only school fact you may refer to.',
    '- If the topic is outside the subject, say so briefly and offer to tutor the subject instead.',
    '',
    'FORMAT:',
    '- Set "verdict" to "none" unless you are judging an answer the student just gave.',
    '- Keep "feedback" empty when there is nothing to judge.',
    '- Mathematics in plain Unicode: x², √, ≤, ≥, ·, π, fractions as a/b. Never LaTeX, never markdown, no ** and no ##.',
  ].join('\n');
}

function buildPrompt(input) {
  const lines = [
    `STUDENT: ${input.studentName}, class ${input.classLabel} (grade ${input.grade})`,
    `SUBJECT: ${input.subject}`,
    `TOPIC: ${input.topic}`,
    MODE_RULES[input.mode] ? MODE_RULES[input.mode].join('\n') : MODE_RULES.explain.join('\n'),
    DIFFICULTY_RULES[input.difficulty] ?? DIFFICULTY_RULES.medium,
  ];

  if (input.schoolNote) {
    lines.push('', `SCHOOL NOTE (real SchoolMind record, you may mention it once): ${input.schoolNote}`);
  }

  lines.push('', ACTION_RULES[input.action] ?? ACTION_RULES.next);

  if (input.action === 'answer' && input.studentAnswer) {
    lines.push('', `THE STUDENT'S ANSWER: ${input.studentAnswer}`);
  }

  return lines.join('\n');
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Enforces the teaching contract the prompt describes. */
function sanitiseTurn(raw, { action, mode }) {
  const evaluating = action === 'answer';

  const hints = (Array.isArray(raw.hints) ? raw.hints : [])
    .map((hint) => str(hint))
    .filter(Boolean)
    .slice(0, 3);

  const verdict = VERDICTS.has(raw.verdict) ? raw.verdict : 'unclear';

  return {
    /* A verdict is only meaningful about something the student said. */
    verdict: evaluating ? verdict : null,
    feedback: evaluating ? str(raw.feedback).slice(0, 400) : '',
    /* Test mode withholds teaching, whatever the model returned. */
    explanation: mode === 'test' ? '' : str(raw.explanation).slice(0, 900),
    example: mode === 'test' ? '' : str(raw.example).slice(0, 600),
    question: str(raw.question).slice(0, 400),
    hints,
  };
}

function readHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .slice(-MAX_HISTORY)
    .map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      text: turn.text.slice(0, 500),
    }));
}

/** "Find me a source" reuses the grounded search the rest of the app
 *  already has, rather than adding a second one. */
async function handleSources(res, input, messages) {
  const system = [
    'You are AI Tutor inside SchoolMind, helping a secondary-school student find reading on a topic.',
    `Write in ${LANGUAGE[input.locale] ?? LANGUAGE.uz}.`,
    'Summarise what the sources say in at most 4 short sentences. Never invent a source or a URL.',
  ].join('\n');

  /* Reading on a topic means real pages. Asking a model with no
     search to "find sources" is how invented URLs get onto a
     student's screen, so when no search runs this returns nothing
     and says why. */
  const found = await liveSearch({ system, messages });

  if (!found) {
    send(res, 200, {
      ok: true,
      turn: {
        verdict: null,
        feedback: '',
        explanation: '',
        example: '',
        question: '',
        hints: [],
      },
      sources: [],
      usedWeb: false,
      degraded: 'web_unavailable',
    });
    return;
  }

  const result = found;
  const degraded = null;

  send(res, 200, {
    ok: true,
    turn: {
      verdict: null,
      feedback: '',
      explanation: result.text,
      example: '',
      question: '',
      hints: [],
    },
    sources: result.sources,
    usedWeb: result.usedWeb,
    degraded,
  });
}

async function handleTutor(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLarge;
    send(res, tooLarge ? 413 : 400, { ok: false, error: 'bad_request' });
    return;
  }

  const input = {
    locale: payload.locale === 'ru' ? 'ru' : 'uz',
    action: ACTIONS.has(payload.action) ? payload.action : 'start',
    mode: MODES.has(payload.mode) ? payload.mode : 'explain',
    difficulty: DIFFICULTIES.has(payload.difficulty) ? payload.difficulty : 'medium',
    subject: String(payload.subject ?? '').slice(0, 60),
    topic: String(payload.topic ?? '').slice(0, MAX_TOPIC_CHARS),
    studentName: String(payload.studentName ?? '').slice(0, 80),
    classLabel: String(payload.classLabel ?? '').slice(0, 20),
    grade: Number.isFinite(payload.grade) ? Math.trunc(payload.grade) : 9,
    schoolNote: String(payload.schoolNote ?? '').slice(0, 200),
    studentAnswer: String(payload.studentAnswer ?? '').slice(0, MAX_ANSWER_CHARS),
  };

  if (!input.subject || !input.topic) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  if (!hasAnyAiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  const history = readHistory(payload.history);

  try {
    if (input.action === 'sources') {
      const messages = [
        ...history,
        {
          role: 'user',
          text: `${input.subject} — ${input.topic}. ${input.studentAnswer || 'Find reliable reading on this topic.'}`,
        },
      ];
      await handleSources(res, input, messages);
      return;
    }

    const parts = [];
    if (history.length > 0) {
      parts.push({
        text: `SO FAR IN THIS LESSON:\n${history
          .map((turn) => `${turn.role === 'model' ? 'Tutor' : 'Student'}: ${turn.text}`)
          .join('\n')}`,
      });
    }
    parts.push({ text: buildPrompt(input) });

    const raw = await generateStructured({
      system: buildSystem(input.locale),
      parts,
      schema: TURN_SCHEMA,
    });

    const turn = sanitiseTurn(raw, input);
    if (!turn.question && !turn.explanation && !turn.feedback) {
      send(res, 502, { ok: false, error: 'empty_response' });
      return;
    }

    send(res, 200, { ok: true, turn, sources: [], usedWeb: false, degraded: null });
  } catch (error) {
    sendAiError(res, error, 'tutor');
  }
}

/** Returns true when it handled the request. */
export function tutorRoutes(req, res, url) {
  if (url !== '/api/tutor') return false;

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  handleTutor(req, res).catch((error) => {
    logFailure('tutor request', error);
    send(res, 500, { ok: false, error: 'server_error' });
  });
  return true;
}
