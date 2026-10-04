import { subjectIdsTaughtBy, teacherTeachesClass } from '../src/data/roster.mjs';
import { hasAnyAiKey } from './env.mjs';
import { generate, generateStructured, liveSearch } from './ai/index.mjs';
import { sendAiError } from './ai/errors.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';
import { generateQuestions } from './quizHandler.mjs';

/* ------------------------------------------------------------------
   POST /api/teacher-ai   one Teacher AI action

   Five actions, four of them structured:

     lesson      a lesson plan for one period
     assignment  a DRAFT of work to set
     explain     ways to teach one idea
     quiz        a DRAFT quiz, from the student quiz generator
     chat        free pedagogical conversation

   TWO RULES THIS FILE ENFORCES

   1. The class and subject are checked against the school's teaching
      table before a single token is spent. A teacher who asks for
      10-A when they do not teach 10-A is refused here, not reasoned
      with in a prompt — a prompt is not an access control, and a
      request body is not a permission.

   2. Nothing this endpoint returns is published. An assignment draft
      comes back as text for a teacher to read, edit and then save
      deliberately through the existing assignment flow. There is no
      code path from a model's output to a student's homework list.

   The model is also told, every time, that it does not know the
   school: no marks, no attendance, no deadlines, no timetable. Those
   come from SchoolMind's records or not at all.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 32 * 1024;
const MAX_TOPIC_CHARS = 140;
const MAX_MESSAGE_CHARS = 700;
const MAX_HISTORY = 6;

const LANGUAGE = { uz: 'Uzbek (Latin script)', ru: 'Russian' };

const ACTIONS = new Set(['lesson', 'assignment', 'explain', 'quiz', 'chat', 'pulse']);
const DIFFICULTIES = new Set(['easy', 'medium', 'hard']);

/* ---- schemas --------------------------------------------------------- */

const LESSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    objective: { type: 'STRING' },
    warmUp: { type: 'STRING' },
    explanation: { type: 'ARRAY', items: { type: 'STRING' } },
    examples: { type: 'ARRAY', items: { type: 'STRING' } },
    practice: { type: 'ARRAY', items: { type: 'STRING' } },
    activity: { type: 'STRING' },
    checks: { type: 'ARRAY', items: { type: 'STRING' } },
    conclusion: { type: 'STRING' },
    homework: { type: 'STRING' },
  },
  required: [
    'objective',
    'warmUp',
    'explanation',
    'examples',
    'practice',
    'activity',
    'checks',
    'conclusion',
    'homework',
  ],
};

const ASSIGNMENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    description: { type: 'STRING' },
    steps: { type: 'ARRAY', items: { type: 'STRING' } },
    minutes: { type: 'NUMBER' },
  },
  required: ['title', 'description', 'steps', 'minutes'],
};

const EXPLAIN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    simple: { type: 'STRING' },
    analogy: { type: 'STRING' },
    misconception: { type: 'STRING' },
    activity: { type: 'STRING' },
    checkQuestion: { type: 'STRING' },
  },
  required: ['simple', 'analogy', 'misconception', 'activity', 'checkQuestion'],
};

/* ---- prompts --------------------------------------------------------- */

function baseSystem(locale) {
  return [
    'You are Teacher AI inside SchoolMind, a school operating system. You assist ONE named teacher with their own classes.',
    `Write everything in ${LANGUAGE[locale] ?? LANGUAGE.uz}.`,
    '',
    'WHAT YOU ARE:',
    '- A practical colleague. Everything you produce must be usable in a real 45-minute lesson with a real class of teenagers.',
    '- Concrete over general. Name the example, the number, the question — never "give some examples".',
    '',
    'WHAT YOU DO NOT KNOW:',
    '- You have no access to marks, attendance, test results, deadlines, the timetable or any pupil’s record.',
    '- Never invent any of them, and never imply you have seen them. If asked, say plainly that the answer is in SchoolMind’s own records rather than with you.',
    '- Do not name individual pupils unless the teacher named them first.',
    '',
    'FORMAT:',
    '- Plain text. No markdown, no ** and no ##.',
    '- Mathematics in plain Unicode: x², √, ≤, ·, π, fractions as a/b. Never LaTeX.',
  ].join('\n');
}

function context(input) {
  return [
    `TEACHER: ${input.teacherName}`,
    `CLASS: ${input.classLabel} (grade ${input.grade}) — ${input.studentCount} pupils`,
    `SUBJECT: ${input.subject}`,
    `TOPIC: ${input.topic}`,
  ].join('\n');
}

function lessonPrompt(input) {
  return [
    context(input),
    `LESSON LENGTH: ${input.minutes} minutes.`,
    '',
    'Write a lesson plan for exactly this one lesson:',
    '- "objective": what a pupil can do by the end, in one sentence. Observable, not "understand".',
    '- "warmUp": 3–5 minutes that brings the previous idea back.',
    '- "explanation": 2–4 steps, in teaching order. Each one a sentence or two the teacher could say.',
    '- "examples": 2 or 3 worked examples, from the simplest upward, each complete enough to put on the board.',
    '- "practice": 3 or 4 exercises for pupils to attempt, in rising difficulty.',
    '- "activity": one thing the class does together — pair work, a board race, a card sort. One short paragraph.',
    '- "checks": 2 or 3 questions that reveal whether the objective was met, including one a pupil who only half-followed would get wrong.',
    '- "conclusion": how to close the lesson in 3 minutes.',
    '- "homework": one suggestion, sized for this class. A suggestion only.',
    '',
    'Fit the time budget honestly. A 45-minute plan is not a 90-minute plan.',
  ].join('\n');
}

function assignmentPrompt(input) {
  return [
    context(input),
    input.note ? `THE TEACHER ADDS: ${input.note}` : '',
    '',
    'Draft work this teacher could set. It is a DRAFT: the teacher will read and edit it before anything reaches a pupil.',
    '- "title": short, specific, no more than 60 characters. Name the topic, not the task type.',
    '- "description": what the pupil must do, in 2–4 sentences, addressed to the pupil. Say what to hand in.',
    '- "steps": 2–5 concrete steps, each one line.',
    '- "minutes": honest expected time for one pupil of this class.',
    '',
    'Do not invent a page number, a textbook, a chapter or a date. Leave those to the teacher — a wrong page number is worse than none.',
  ]
    .filter(Boolean)
    .join('\n');
}

function explainPrompt(input) {
  return [
    context(input),
    '',
    'Give this teacher four ways into this idea:',
    '- "simple": the plainest correct explanation, as said to a pupil who is behind. 3 sentences at most.',
    '- "analogy": one analogy or everyday comparison that holds up — and say where it stops holding.',
    '- "misconception": the mistake pupils of this age actually make here, and the sentence that corrects it.',
    '- "activity": one short classroom activity that makes the idea concrete.',
    '- "checkQuestion": one question that separates a pupil who understands from one who memorised.',
  ].join('\n');
}

function chatSystem(locale, schoolContext) {
  const lines = [baseSystem(locale)];
  lines.push(
    '',
    'This is a conversation. Answer in at most 5 short sentences, or up to 5 lines each starting with "- ".',
  );
  if (schoolContext) {
    lines.push(
      'A block labelled "SCHOOL DATA" may follow. It is from SchoolMind’s own records and is authoritative: never contradict it and never extend it with anything that is not in it.',
      'If what was asked is not in that block, say it is not in the records.',
    );
  }
  return lines.join('\n');
}

/* ---- validation ------------------------------------------------------ */

const str = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

function list(value, limit, count) {
  return (Array.isArray(value) ? value : [])
    .map((entry) => str(entry, limit))
    .filter(Boolean)
    .slice(0, count);
}

function readLesson(raw) {
  const plan = {
    objective: str(raw.objective, 300),
    warmUp: str(raw.warmUp, 500),
    explanation: list(raw.explanation, 500, 5),
    examples: list(raw.examples, 600, 4),
    practice: list(raw.practice, 400, 6),
    activity: str(raw.activity, 700),
    checks: list(raw.checks, 300, 4),
    conclusion: str(raw.conclusion, 400),
    homework: str(raw.homework, 400),
  };
  /* A plan without an objective and a body is not a plan. */
  if (!plan.objective || plan.explanation.length === 0) return null;
  return plan;
}

function readAssignment(raw) {
  const draft = {
    title: str(raw.title, 90),
    description: str(raw.description, 900),
    steps: list(raw.steps, 300, 6),
    minutes: Number.isFinite(raw.minutes) ? Math.min(Math.max(Math.trunc(raw.minutes), 5), 180) : 30,
  };
  if (!draft.title || !draft.description) return null;
  return draft;
}

function readExplain(raw) {
  const out = {
    simple: str(raw.simple, 600),
    analogy: str(raw.analogy, 600),
    misconception: str(raw.misconception, 600),
    activity: str(raw.activity, 600),
    checkQuestion: str(raw.checkQuestion, 400),
  };
  if (!out.simple) return null;
  return out;
}

function readHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((turn) => turn && typeof turn.text === 'string' && turn.text.trim())
    .slice(-MAX_HISTORY)
    .map((turn) => ({
      role: turn.role === 'model' ? 'model' : 'user',
      text: turn.text.slice(0, 600),
    }));
}

/* ---- the handler ----------------------------------------------------- */

async function handleTeacherAi(req, res) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    send(res, error instanceof PayloadTooLarge ? 413 : 400, { ok: false, error: 'bad_request' });
    return;
  }

  const action = ACTIONS.has(payload.action) ? payload.action : 'chat';
  const teacherId = String(payload.teacherId ?? '').slice(0, 40);
  const classId = String(payload.classId ?? '').slice(0, 20);
  const subjectId = String(payload.subjectId ?? '').slice(0, 30);

  const input = {
    locale: payload.locale === 'ru' ? 'ru' : 'uz',
    teacherName: String(payload.teacherName ?? '').slice(0, 80),
    classLabel: String(payload.classLabel ?? '').slice(0, 20),
    subject: String(payload.subject ?? '').slice(0, 60),
    topic: String(payload.topic ?? '').slice(0, MAX_TOPIC_CHARS),
    grade: Number.isFinite(payload.grade) ? Math.trunc(payload.grade) : 9,
    studentCount: Number.isFinite(payload.studentCount) ? Math.trunc(payload.studentCount) : 6,
    minutes: Number.isFinite(payload.minutes) ? Math.trunc(payload.minutes) : 45,
    difficulty: DIFFICULTIES.has(payload.difficulty) ? payload.difficulty : 'medium',
    count: Number.isFinite(payload.count) ? Math.min(Math.max(Math.trunc(payload.count), 3), 10) : 5,
    note: String(payload.note ?? '').slice(0, 300),
    message: String(payload.message ?? '').slice(0, MAX_MESSAGE_CHARS),
    schoolContext: String(payload.schoolContext ?? '').slice(0, 3000),
    evidence: String(payload.evidence ?? '').slice(0, 4000),
  };

  /* ---- authorisation, before anything is spent ---- */
  if (!teacherId) {
    send(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  /* Chat needs no class; every other action is about one class and
     one subject, and both must be this teacher's. */
  if (action !== 'chat') {
    const allowed = classId && teacherTeachesClass(teacherId, classId);
    const subjectAllowed = allowed && subjectIdsTaughtBy(teacherId, classId).includes(subjectId);
    if (!allowed || !subjectAllowed) {
      console.warn(
        `[schoolmind-teacher-ai] refused: ${teacherId} -> ${classId || '(none)'}/${subjectId || '(none)'} not in teaching table`,
      );
      send(res, 403, { ok: false, error: 'forbidden' });
      return;
    }
    if (!input.topic) {
      send(res, 400, { ok: false, error: 'bad_request' });
      return;
    }
  } else if (!input.message) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }

  if (!hasAnyAiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  try {
    if (action === 'quiz') {
      /* The student quiz generator, unchanged, with the teacher as the
         reader. Same validation, same refusal to ship a broken item. */
      const questions = await generateQuestions({
        locale: input.locale,
        subject: input.subject,
        topic: input.topic,
        difficulty: input.difficulty,
        count: input.count,
        grade: input.grade,
        classLabel: input.classLabel,
      });
      send(res, 200, { ok: true, action, quiz: { questions } });
      return;
    }

    if (action === 'pulse') {
      /* Reading a ClassPulse result.

         The counts were produced by counting, on the teacher's own
         screen, and they are passed in here as the ONLY thing the
         model may talk about. It is told, in as many words, that it
         cannot see the class and must not explain why anybody
         answered as they did — because a sentence like "the pupils
         who struggled are probably weak at fractions" is a
         diagnosis, and nothing in this evidence supports one. */
      if (!input.evidence) {
        send(res, 400, { ok: false, error: 'bad_request' });
        return;
      }

      const system = [
        'You help a teacher read the result of one short in-class check inside SchoolMind.',
        `Write in ${LANGUAGE[input.locale] ?? LANGUAGE.uz}.`,
        '',
        'YOU ARE GIVEN COUNTS AND, SOMETIMES, WHAT PUPILS WROTE. THAT IS ALL YOU HAVE.',
        '- Describe only what is in the evidence. Never state a number that is not there.',
        '- You did not see the lesson and you do not know these pupils. Do not explain WHY anyone answered as they did, and do not guess at anybody’s ability.',
        '- Never name or identify a pupil, and never say or imply that any pupil is weak, strong, lazy or struggling.',
        '- For written answers, group them into the themes that are actually there and say how many fall in each.',
        '- Finish with at most two concrete suggestions for the NEXT lesson, phrased as options for the teacher.',
        '',
        'At most 6 short sentences, or up to 5 lines each starting with "- ". Plain text, no markdown.',
      ].join('\n');

      const result = await generate({
        system,
        messages: [
          {
            role: 'user',
            text: `TOPIC: ${input.topic}
CLASS: ${input.classLabel}

${input.evidence}`,
          },
        ],
        web: false,
      });

      if (!result.text) {
        send(res, 502, { ok: false, error: 'empty_response' });
        return;
      }
      send(res, 200, {
        ok: true,
        action,
        chat: { text: result.text, sources: [], usedWeb: false },
        withheld: false,
        degraded: null,
      });
      return;
    }

    if (action === 'chat') {
      const history = readHistory(payload.history);
      const messages = [...history];
      if (input.schoolContext) {
        messages.push({
          role: 'user',
          text: `SCHOOL DATA (authoritative, from SchoolMind records):\n${input.schoolContext}`,
        });
      }
      messages.push({ role: 'user', text: input.message });

      /* A question about what is true right now is answerable only
         from grounded search. The rule AskMySchool established holds
         here too: when search cannot run, SchoolMind says so instead
         of dressing stale model knowledge up as today's news. No
         request is sent at all. */
      const wantsWeb = payload.web === true;
      if (wantsWeb) {
        const found = await liveSearch({ system, messages });
        if (!found) {
          send(res, 200, {
            ok: true,
            action,
            chat: { text: '', sources: [], usedWeb: false },
            withheld: true,
            degraded: 'web_unavailable',
          });
          return;
        }
        send(res, 200, {
          ok: true,
          action,
          chat: { text: found.text, sources: found.sources, usedWeb: true },
          withheld: false,
          degraded: null,
        });
        return;
      }

      const result = await generate({ system, messages, web: false });
      if (!result.text) {
        send(res, 502, { ok: false, error: 'empty_response' });
        return;
      }
      send(res, 200, {
        ok: true,
        action,
        chat: { text: result.text, sources: [], usedWeb: false },
        withheld: false,
        degraded: null,
      });
      return;
    }

    const plan = {
      lesson: { schema: LESSON_SCHEMA, prompt: lessonPrompt, read: readLesson, key: 'lesson' },
      assignment: {
        schema: ASSIGNMENT_SCHEMA,
        prompt: assignmentPrompt,
        read: readAssignment,
        key: 'assignment',
      },
      explain: { schema: EXPLAIN_SCHEMA, prompt: explainPrompt, read: readExplain, key: 'explain' },
    }[action];

    const raw = await generateStructured({
      system: baseSystem(input.locale),
      parts: [{ text: plan.prompt(input) }],
      schema: plan.schema,
    });

    const value = plan.read(raw);
    if (!value) {
      /* Half a lesson plan is not worth a teacher's time. */
      send(res, 502, { ok: false, error: 'malformed_response' });
      return;
    }

    send(res, 200, { ok: true, action, [plan.key]: value });
  } catch (error) {
    sendAiError(res, error, `teacher-ai ${action}`);
  }
}

/** Returns true when it handled the request. */
export function teacherAiRoutes(req, res, url) {
  if (url !== '/api/teacher-ai') return false;

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  handleTeacherAi(req, res).catch((error) => {
    logFailure('teacher-ai request', error);
    send(res, 500, { ok: false, error: 'server_error' });
  });
  return true;
}
