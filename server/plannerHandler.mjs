import { hasGeminiKey } from './env.mjs';
import { AiUnavailableError, generateStructured, isTemporarilyUnavailable } from './gemini.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';

/* ------------------------------------------------------------------
   POST /api/plan         build a study plan from SchoolMind workload
   POST /api/plan/adjust  rework an existing plan from a request

   The contract that makes this trustworthy:

     The caller sends the authoritative task catalogue — real records
     from the school dataset, each with an id. The model is told it may
     only reference those ids, and every item that comes back is checked
     against the catalogue here. A school item with an unknown id is
     dropped, and its title and subject are overwritten from the
     catalogue, so Gemini cannot rename, invent or re-date school work.

     What the model genuinely decides: order, start times, durations,
     breaks, priority emphasis and the reasoning.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_TASKS = 12;
const MAX_ITEMS = 24;
const MAX_REQUEST_CHARS = 300;

const LANGUAGE = { uz: 'Uzbek (Latin script)', ru: 'Russian' };

/** Warnings the server states itself. Never model prose. */
const WARN = {
  omitted: {
    uz: (titles) => `Rejadan chiqarildi, lekin muddati yaqin: ${titles}.`,
    ru: (titles) => `Исключено из плана, но срок близок: ${titles}.`,
  },
  invented: {
    uz: () => 'AI maktab yozuvlarida yoʻq ishni taklif qildi — u rejadan olib tashlandi.',
    ru: () => 'AI предложил работу, которой нет в школьных записях — она удалена из плана.',
  },
};

const PLAN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    summary: { type: 'STRING' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING', enum: ['homework', 'test', 'review', 'break'] },
          taskId: { type: 'STRING' },
          title: { type: 'STRING' },
          startTime: { type: 'STRING' },
          durationMinutes: { type: 'INTEGER' },
          priority: { type: 'STRING', enum: ['high', 'medium', 'low'] },
          reason: { type: 'STRING' },
        },
        required: ['type', 'taskId', 'title', 'startTime', 'durationMinutes', 'priority', 'reason'],
      },
    },
    note: { type: 'STRING' },
    availableMinutes: { type: 'INTEGER' },
  },
  required: ['title', 'summary', 'items', 'note', 'availableMinutes'],
  propertyOrdering: ['title', 'summary', 'items', 'note', 'availableMinutes'],
};

function taskLines(tasks) {
  return tasks.map((task) => {
    const due =
      task.daysLeft < 0
        ? `OVERDUE by ${Math.abs(task.daysLeft)} day(s)`
        : task.daysLeft === 0
          ? 'due TODAY'
          : `due in ${task.daysLeft} day(s)`;
    return `- id=${task.id} | ${task.kind} | ${task.subjectName} | "${task.title}" | ${due} (${task.dueDate}) | urgency=${task.urgency}`;
  });
}

const INTENSITY_RULE = {
  light: 'LIGHT: short blocks of about 20 minutes and generous breaks. Do not overload the student.',
  balanced: 'BALANCED: blocks of about 30 minutes with a 10 minute break between them.',
  intense: 'INTENSE: blocks of 40 minutes or more with short 5 minute breaks. Cover as much as fits.',
};

function buildSystemPrompt(locale) {
  return [
    'You are AI Planner inside SchoolMind, a school operating system. You turn a student\'s real workload into a practical study plan for this evening.',
    `Write every "title", "summary", "reason" and "note" in ${LANGUAGE[locale] ?? LANGUAGE.uz}.`,
    '',
    'ABSOLUTE RULE — THE SCHOOL DATA IS THE ONLY SOURCE OF WORK.',
    'The TASKS block lists every school obligation that exists. You may not invent homework, tests, deadlines, subjects or school events.',
    'Each item of type "homework" or "test" MUST set "taskId" to one of the listed ids, exactly as written. Never make up an id.',
    'Never schedule the same task id twice.',
    '',
    'You may add items of type "break" (taskId must be the empty string).',
    'You may add at most one item of type "review" (taskId empty) ONLY when there is spare time left over; it is an optional suggestion, not school-assigned work.',
    '',
    'PLANNING RULES:',
    '- Start at the given start time and lay items out back to back without gaps or overlaps.',
    '- The sum of all durations must not exceed the available minutes.',
    '- AVAILABLE MINUTES is the time budget. If the request changes how much time the student has ("fit it into two hours", "I only have 30 minutes"), that new amount replaces it. Report the budget you planned against in "availableMinutes", otherwise repeat the value you were given.',
    '- Order by real urgency: overdue first, then due today, then an imminent test, then the rest.',
    '- Tomorrow\'s timetable is a legitimate reason to pull a subject earlier.',
    '- "reason" is one short sentence saying why this step sits here. Be concrete, mention the deadline or the test when that is the reason.',
    '- "priority" reflects the deadline pressure of that task.',
    '- "summary" is at most 2 sentences about how the evening is arranged.',
    '- "note" is one short sentence describing what you changed; on a first plan leave it an empty string.',
    'Plain text only: no markdown, no bold, no headings.',
  ].join('\n');
}

function buildUserPrompt(context, previousPlan, request) {
  const lines = [
    `DATE: ${context.dateISO} (${context.dateLabel})`,
    `STUDENT: ${context.studentName}, class ${context.className}, ${context.schoolName}`,
    `START TIME: ${context.startTime}`,
    `AVAILABLE MINUTES: ${context.availableMinutes}`,
    `INTENSITY: ${INTENSITY_RULE[context.intensity] ?? INTENSITY_RULE.balanced}`,
    '',
    'TASKS (the only work that exists):',
    ...(context.tasks.length > 0 ? taskLines(context.tasks) : ['- (none)']),
  ];

  if (context.lessonsToday?.length) {
    lines.push('', `LESSONS TODAY: ${context.lessonsToday.join('; ')}`);
  }
  if (context.lessonsTomorrow?.length) {
    lines.push(`LESSONS TOMORROW: ${context.lessonsTomorrow.join('; ')}`);
  }

  if (previousPlan) {
    lines.push(
      '',
      'CURRENT PLAN (adjust this one, keep everything the request does not touch):',
      ...previousPlan.items.map(
        (item) =>
          `- ${item.startTime} (${item.durationMinutes}m) ${item.type} taskId=${item.sourceAssignmentId ?? ''} "${item.title}"`,
      ),
      '',
      `STUDENT REQUEST: ${request}`,
      'Apply the request. Do not rebuild the plan from nothing, and do not drop work the student did not ask you to drop.',
    );
  } else {
    lines.push('', 'Build the plan now.');
  }

  return lines.join('\n');
}

/* ---- validation ---------------------------------------------------- */

const TYPES = new Set(['homework', 'test', 'review', 'break']);
const PRIORITIES = new Set(['high', 'medium', 'low']);

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clockOk(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Turns the model's answer into a plan that can only contain real
 * school work. Returns the plan plus the warnings the server is
 * willing to stand behind.
 */
function sanitisePlan(raw, context, locale) {
  const byId = new Map(context.tasks.map((task) => [task.id, task]));
  const used = new Set();
  const warnings = [];
  let invented = false;

  const items = [];
  for (const candidate of Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : []) {
    const type = TYPES.has(candidate?.type) ? candidate.type : null;
    if (!type) continue;

    const duration = Number(candidate.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 240) continue;

    const startTime = str(candidate.startTime);
    if (!clockOk(startTime)) continue;

    const taskId = str(candidate.taskId);

    if (type === 'homework' || type === 'test') {
      const task = byId.get(taskId);
      /* The core guarantee: school work the records do not contain
         does not survive this. */
      if (!task || used.has(taskId)) {
        if (!task) invented = true;
        continue;
      }
      used.add(taskId);
      items.push({
        id: `ai-${taskId}`,
        type: task.kind === 'test' ? 'test' : 'homework',
        subjectId: task.subjectId,
        /* Title and subject come from the record, not the model. */
        title: task.title,
        startTime,
        durationMinutes: Math.round(duration),
        priority: PRIORITIES.has(candidate.priority) ? candidate.priority : task.urgency,
        reason: str(candidate.reason).slice(0, 220),
        sourceAssignmentId: taskId,
      });
      continue;
    }

    /* Breaks and optional review carry no school record by design. */
    items.push({
      id: `ai-${type}-${items.length}`,
      type,
      subjectId: null,
      title: str(candidate.title).slice(0, 90),
      startTime,
      durationMinutes: Math.round(duration),
      priority: PRIORITIES.has(candidate.priority) ? candidate.priority : 'low',
      reason: str(candidate.reason).slice(0, 220),
      sourceAssignmentId: null,
    });
  }

  items.sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (invented) warnings.push(WARN.invented[locale]?.() ?? WARN.invented.uz());

  /* Urgent work that silently vanished is named, never quietly lost. */
  const urgentMissing = context.tasks
    .filter((task) => (task.overdue || task.daysLeft <= 1) && !used.has(task.id))
    .map((task) => task.title);
  if (urgentMissing.length > 0) {
    const titles = urgentMissing.slice(0, 3).join(', ');
    warnings.push((WARN.omitted[locale] ?? WARN.omitted.uz)(titles));
  }

  const totalStudyMinutes = items
    .filter((item) => item.type !== 'break')
    .reduce((sum, item) => sum + item.durationMinutes, 0);

  /* The budget the plan was actually built against, so the next
     adjustment continues from it instead of silently reverting to the
     control's value. */
  const budget = Number(raw.availableMinutes);

  return {
    title: str(raw.title).slice(0, 120),
    summary: str(raw.summary).slice(0, 400),
    totalStudyMinutes,
    items,
    warnings,
    note: str(raw.note).slice(0, 220),
    availableMinutes: Number.isFinite(budget)
      ? Math.min(Math.max(Math.round(budget), 15), 360)
      : context.availableMinutes,
  };
}

function readContext(payload) {
  const source = payload?.context;
  if (!source || typeof source !== 'object') return null;

  const tasks = Array.isArray(source.tasks)
    ? source.tasks
        .filter((task) => task && typeof task.id === 'string' && typeof task.title === 'string')
        .slice(0, MAX_TASKS)
        .map((task) => ({
          id: task.id,
          kind: task.kind === 'test' ? 'test' : task.kind === 'project' ? 'project' : 'homework',
          title: String(task.title).slice(0, 160),
          subjectId: typeof task.subjectId === 'string' ? task.subjectId : '',
          subjectName: String(task.subjectName ?? '').slice(0, 60),
          dueDate: String(task.dueDate ?? '').slice(0, 10),
          daysLeft: Number.isFinite(task.daysLeft) ? Math.trunc(task.daysLeft) : 0,
          urgency: PRIORITIES.has(task.urgency) ? task.urgency : 'low',
          overdue: task.overdue === true,
        }))
    : [];

  const available = Number(source.availableMinutes);

  return {
    dateISO: String(source.dateISO ?? '').slice(0, 10),
    dateLabel: String(source.dateLabel ?? '').slice(0, 80),
    startTime: clockOk(str(source.startTime)) ? str(source.startTime) : '16:00',
    studentName: String(source.studentName ?? '').slice(0, 80),
    className: String(source.className ?? '').slice(0, 20),
    schoolName: String(source.schoolName ?? '').slice(0, 80),
    availableMinutes: Number.isFinite(available) ? Math.min(Math.max(available, 15), 360) : 60,
    intensity: ['light', 'balanced', 'intense'].includes(source.intensity)
      ? source.intensity
      : 'balanced',
    tasks,
    lessonsToday: Array.isArray(source.lessonsToday)
      ? source.lessonsToday.slice(0, 8).map((l) => String(l).slice(0, 60))
      : [],
    lessonsTomorrow: Array.isArray(source.lessonsTomorrow)
      ? source.lessonsTomorrow.slice(0, 8).map((l) => String(l).slice(0, 60))
      : [],
  };
}

function readPreviousPlan(payload) {
  const plan = payload?.plan;
  if (!plan || !Array.isArray(plan.items)) return null;
  return {
    items: plan.items.slice(0, MAX_ITEMS).map((item) => ({
      type: TYPES.has(item?.type) ? item.type : 'homework',
      title: String(item?.title ?? '').slice(0, 120),
      startTime: clockOk(str(item?.startTime)) ? str(item.startTime) : '00:00',
      durationMinutes: Number.isFinite(item?.durationMinutes)
        ? Math.trunc(item.durationMinutes)
        : 30,
      sourceAssignmentId:
        typeof item?.sourceAssignmentId === 'string' ? item.sourceAssignmentId : null,
    })),
  };
}

async function handlePlan(req, res, { adjust }) {
  let payload;
  try {
    payload = JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLarge;
    send(res, tooLarge ? 413 : 400, { ok: false, error: 'bad_request' });
    return;
  }

  const context = readContext(payload);
  if (!context) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }

  const locale = payload.locale === 'ru' ? 'ru' : 'uz';
  const request = adjust ? str(payload.request).slice(0, MAX_REQUEST_CHARS) : '';
  const previousPlan = adjust ? readPreviousPlan(payload) : null;

  if (adjust && (!request || !previousPlan)) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  if (!hasGeminiKey) {
    send(res, 503, { ok: false, error: 'missing_api_key' });
    return;
  }

  try {
    const raw = await generateStructured({
      system: buildSystemPrompt(locale),
      parts: [{ text: buildUserPrompt(context, previousPlan, request) }],
      schema: PLAN_SCHEMA,
    });
    const plan = sanitisePlan(raw, context, locale);

    if (plan.items.length === 0) {
      /* Nothing survived validation — say so instead of shipping an
         empty plan that looks like a finished answer. */
      send(res, 502, { ok: false, error: 'empty_response' });
      return;
    }

    send(res, 200, { ok: true, plan });
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
    const message = error instanceof Error ? error.message : '';
    if (message === 'malformed_response' || message === 'empty_response') {
      logFailure('planner', error);
      send(res, 502, { ok: false, error: message });
      return;
    }
    logFailure('planner', error);
    send(res, 502, { ok: false, error: 'upstream_error' });
  }
}

/** Returns true when it handled the request. */
export function plannerRoutes(req, res, url) {
  const adjust = url === '/api/plan/adjust';
  if (url !== '/api/plan' && !adjust) return false;

  if (req.method !== 'POST') {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  handlePlan(req, res, { adjust }).catch((error) => {
    logFailure('planner request', error);
    send(res, 500, { ok: false, error: 'server_error' });
  });
  return true;
}
