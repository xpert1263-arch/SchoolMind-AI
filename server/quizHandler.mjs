import { hasAnyAiKey } from './env.mjs';
import { generateStructured } from './ai/index.mjs';
import { sendAiError } from './ai/errors.mjs';
import { PayloadTooLarge, readBody, send } from './http.mjs';

/* ------------------------------------------------------------------
   POST /api/quiz        generate a quiz
   POST /api/quiz/check  judge one typed answer

   Two rules shape this file.

   Nothing the model returns is trusted. Every question is rebuilt
   field by field, and one that cannot be rebuilt — no prompt, a
   correct answer that is not among its own options, two identical
   options — is dropped rather than rendered. A quiz that comes back
   mangled becomes a shorter quiz, never a broken screen.

   The model is only asked what it is needed for. A multiple-choice
   answer is two ids compared, which the browser does itself; only a
   typed answer that does not match the expected wording reaches
   /check.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 32 * 1024;
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 10;
const MAX_ANSWER_CHARS = 400;

const LANGUAGE = { uz: 'Uzbek (Latin script)', ru: 'Russian' };

const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);
const TYPES = new Set(['multiple', 'boolean', 'short']);

const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['multiple', 'boolean', 'short'] },
          prompt: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctAnswer: { type: 'STRING' },
          explanation: { type: 'STRING' },
          hint: { type: 'STRING' },
        },
        required: ['type', 'prompt', 'options', 'correctAnswer', 'explanation', 'hint'],
      },
    },
  },
  required: ['questions'],
};

const CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdict: { type: 'STRING', enum: ['correct', 'partial', 'incorrect', 'unclear'] },
    feedback: { type: 'STRING' },
  },
  required: ['verdict', 'feedback'],
};

const DIFFICULTY_RULE = {
  easy: 'EASY: recall and one-step reasoning, the most basic form of the idea.',
  medium: 'MEDIUM: two steps, or one step with a twist.',
  hard: 'HARD: several steps, or a case the student must reason about rather than recall.',
};

function buildQuizPrompt({ locale, subject, topic, difficulty, count, grade, classLabel }) {
  return [
    'You write short practice quizzes for one secondary-school student inside SchoolMind.',
    `Write every prompt, option, explanation and hint in ${LANGUAGE[locale] ?? LANGUAGE.uz}.`,
    '',
    `SUBJECT: ${subject}`,
    `TOPIC: ${topic}`,
    `STUDENT: class ${classLabel} (grade ${grade}) — pitch the wording and the content at this age.`,
    DIFFICULTY_RULE[difficulty] ?? DIFFICULTY_RULE.medium,
    `WRITE EXACTLY ${count} QUESTIONS.`,
    '',
    'RULES:',
    '- Mix the types: mostly "multiple", with one or two "short", and at most one "boolean".',
    '- "multiple": exactly 4 options, all plausible, exactly one correct. "boolean": exactly 2 options, the true/false wording of this language. "short": an empty options array.',
    '- "correctAnswer" must be the full text of the correct option, copied exactly, for "multiple" and "boolean". For "short" it is the expected answer in one or two words.',
    '- A short answer must have one unambiguous expected answer. If a question cannot be marked that way, make it multiple choice instead.',
    '- "explanation" says in one or two sentences WHY the answer is right. It is read after answering, so it must teach, not just assert.',
    '- "hint" nudges towards the method without giving the answer away.',
    '- Never repeat a question, and never let two options mean the same thing.',
    '- Stay inside the subject and topic. Do not reference the student\'s homework, marks or timetable — you do not have them.',
    '- Mathematics in plain Unicode: x², √, ≤, ·, fractions as a/b. No LaTeX, no markdown.',
  ].join('\n');
}

const norm = (value) => (typeof value === 'string' ? value.trim() : '');

/** Rebuilds one question, or returns null if it cannot be trusted. */
function readQuestion(raw, index) {
  const type = TYPES.has(raw?.type) ? raw.type : null;
  if (!type) return null;

  const prompt = norm(raw.prompt).slice(0, 400);
  const correctAnswer = norm(raw.correctAnswer).slice(0, 200);
  if (!prompt || !correctAnswer) return null;

  const explanation = norm(raw.explanation).slice(0, 500);
  const hint = norm(raw.hint).slice(0, 300);

  if (type === 'short') {
    return {
      id: `ai-${index}`,
      type,
      prompt,
      options: [],
      correctOptionId: '',
      correctAnswer,
      explanation,
      hint,
    };
  }

  /* De-duplicate before checking the count: two identical options make
     a question unanswerable, not merely untidy. */
  const seen = new Set();
  const texts = [];
  for (const option of Array.isArray(raw.options) ? raw.options : []) {
    const text = norm(option).slice(0, 200);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    texts.push(text);
  }

  const wanted = type === 'boolean' ? 2 : 4;
  if (texts.length !== wanted) return null;

  /* The correct answer has to actually be one of the options. */
  const correctIndex = texts.findIndex(
    (text) => text.toLowerCase() === correctAnswer.toLowerCase(),
  );
  if (correctIndex === -1) return null;

  return {
    id: `ai-${index}`,
    type,
    prompt,
    options: texts.map((text, i) => ({ id: `o${i}`, text })),
    correctOptionId: `o${correctIndex}`,
    correctAnswer: texts[correctIndex],
    explanation,
    hint,
  };
}

/**
 * Generates a validated set of questions, or throws.
 *
 * Exported because Teacher AI's quiz draft is the same job with a
 * different reader: one generator, one validator, one schema. The
 * teacher's draft gets exactly the questions a student's quiz would,
 * which is also why a draft can be trusted enough to review.
 *
 * Throws `malformed_response` when too little survived validation to
 * be a quiz at all, so both callers can fall back to their own
 * deterministic questions.
 */
export async function generateQuestions({
  locale,
  subject,
  topic,
  difficulty,
  count,
  grade,
  classLabel,
}) {
  const raw = await generateStructured({
    system: buildQuizPrompt({ locale, subject, topic, difficulty, count, grade, classLabel }),
    parts: [{ text: 'Write the quiz now, using the required JSON schema.' }],
    schema: QUIZ_SCHEMA,
  });

  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .slice(0, MAX_QUESTIONS)
    .map(readQuestion)
    .filter(Boolean)
    .slice(0, count);

  if (questions.length < MIN_QUESTIONS) throw new Error('malformed_response');
  return questions;
}

async function handleGenerate(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    send(res, error instanceof PayloadTooLarge ? 413 : 400, { ok: false, error: 'bad_request' });
    return;
  }

  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const subject = String(payload.subject ?? '').slice(0, 60);
  const topic = String(payload.topic ?? '').slice(0, 120);
  const difficulty = DIFFICULTIES.has(payload.difficulty) ? payload.difficulty : 'medium';
  const requested = Number(payload.count);
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), MIN_QUESTIONS), MAX_QUESTIONS)
    : 5;

  if (!subject || !topic) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  if (!hasAnyAiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  try {
    const questions = await generateQuestions({
      locale,
      subject,
      topic,
      difficulty,
      count,
      grade: Number.isFinite(payload.grade) ? Math.trunc(payload.grade) : 9,
      classLabel: String(payload.classLabel ?? '').slice(0, 20),
    });
    send(res, 200, { ok: true, questions });
  } catch (error) {
    /* Too little survived validation to be a quiz, or the provider
       chain could not answer. Either way the client falls back to
       SchoolMind's own questions. */
    sendAiError(res, error, 'quiz generate');
  }
}

async function handleCheck(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }

  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const prompt = String(payload.prompt ?? '').slice(0, 400);
  const expected = String(payload.expected ?? '').slice(0, 200);
  const given = String(payload.given ?? '').slice(0, MAX_ANSWER_CHARS);

  if (!prompt || !expected || !given) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  if (!hasAnyAiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  try {
    const raw = await generateStructured({
      system: [
        'You mark one short answer from a secondary-school student, and nothing else.',
        `Write "feedback" in ${LANGUAGE[locale] ?? LANGUAGE.uz}, in one or two short sentences.`,
        'Judge the meaning, not the spelling: a correct answer written differently, abbreviated, or with a small typo is still "correct".',
        'Use "partial" when the answer has the right idea but is incomplete, and "incorrect" when it is wrong.',
        'Use "unclear" when you genuinely cannot tell what the student meant — do not guess a mark.',
        'Be kind and factual. Never mock a wrong answer.',
      ].join('\n'),
      parts: [
        {
          text: [
            `QUESTION: ${prompt}`,
            `EXPECTED ANSWER: ${expected}`,
            `STUDENT ANSWER: ${given}`,
          ].join('\n'),
        },
      ],
      schema: CHECK_SCHEMA,
    });

    const verdict = ['correct', 'partial', 'incorrect', 'unclear'].includes(raw.verdict)
      ? raw.verdict
      : 'unclear';

    send(res, 200, { ok: true, verdict, feedback: norm(raw.feedback).slice(0, 400) });
  } catch (error) {
    sendAiError(res, error, 'quiz check');
  }
}

/** Returns true when it handled the request. */
export function quizRoutes(req, res, url) {
  const check = url === '/api/quiz/check';
  if (url !== '/api/quiz' && !check) return false;

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  const run = check ? handleCheck : handleGenerate;
  run(req, res).catch((error) => {
    sendAiError(res, error, 'quiz request');
  });
  return true;
}
