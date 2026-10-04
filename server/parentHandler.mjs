import { createHash } from 'node:crypto';
import { classOfStudentId, teacherNameOf, teacherTeachesStudent } from '../src/data/roster.mjs';
import { hasTelegramToken } from './env.mjs';
import { logFailure, PayloadTooLarge, readBody, send } from './http.mjs';
import {
  appendMessage,
  chatIdFor,
  createToken,
  isRelation,
  messagesFor,
  nameFor,
  parentsOf,
  publicView,
  saveParent,
  unlinkParent,
  validStudentId,
} from './parentStore.mjs';
import { deepLinkFor, DeliveryResult, sendTelegramMessage, telegramHealth } from './telegram.mjs';

/* ------------------------------------------------------------------
   Parent Connect API.

     GET  /api/parents?studentId=…        father and mother records
     POST /api/parents/save               the student edits one of them
     POST /api/parents/link               mint a connection link
     POST /api/parents/unlink             drop a connection
     POST /api/parents/message            a teacher writes to a parent
     GET  /api/parents/history?studentId= what has been sent
     GET  /api/telegram/status            what delivery can do today

   THE AUTHORISATION RULE, ONCE

   Every route starts by deciding what the caller is allowed to touch,
   and the decision is made from the school's own roster — never from
   what the request asserts about itself beyond its identity:

     a student  may read and edit ONLY their own two parent records
     a teacher  may read, and message, ONLY the parents of pupils in a
                class they actually teach

   The request never names a Telegram chat. It names a pupil and a
   relation; the chat id is resolved here, from the store, after the
   check passes. That is what stops a changed id in a dev console from
   reaching another family — the id is not an input.

   HONEST LIMIT, STATED PLAINLY

   SchoolMind's login is a local hackathon demo gate: the credentials
   are in the client bundle, so this server cannot cryptographically
   prove that a caller claiming to be student1 is student1. What it
   can and does enforce is the relation between the claimed identity
   and the data asked for — which is the check that stops the UI, or a
   tampered request, from crossing between pupils. Replacing the gate
   with real authentication is a hosting change, not a change here.
   ------------------------------------------------------------------ */

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_CHARS = 900;
const SCHOOL_NAME = 'Math Academy Private School';

/** A repeated Send inside this window is the same send. */
const DUPLICATE_WINDOW_MS = 30 * 1000;
const recentSends = new Map();

function readActor(source) {
  const role = source?.actorRole === 'teacher' ? 'teacher' : 'student';
  const userId = String(source?.actorId ?? '').slice(0, 40);
  return { role, userId };
}

/**
 * The gate. `need` is 'own' for a student's own records or 'teach' for
 * a teacher authorised over that pupil.
 *
 * Returns null when allowed, or the refusal to send.
 */
function denyReason(actor, studentId, need) {
  if (!validStudentId(studentId)) return { status: 400, error: 'bad_request' };

  if (actor.role === 'student') {
    /* Messaging a family is a teacher's act. */
    if (need === 'teach') return { status: 403, error: 'forbidden' };
    /* And a pupil reaches exactly one family: their own. */
    return actor.userId === studentId ? null : { status: 403, error: 'forbidden' };
  }

  /* A teacher reaches a pupil only through a class they teach — and
     even then only to READ and to MESSAGE. The family's own details
     belong to the pupil who entered them, so 'own' excludes a teacher
     however many of that pupil's classes they teach. */
  if (need === 'own') return { status: 403, error: 'forbidden' };

  return teacherTeachesStudent(actor.userId, studentId)
    ? null
    : { status: 403, error: 'forbidden' };
}

function refuse(res, actor, studentId, reason, route) {
  /* Worth a log line: a refusal here is either a UI bug or somebody
     trying the door. Neither should be silent. */
  console.warn(
    `[schoolmind-parents] ${route} refused: ${actor.role} ${actor.userId || '(none)'} -> ${studentId || '(none)'} (${reason.error})`,
  );
  send(res, reason.status, { ok: false, error: reason.error });
}

async function body(req, res) {
  try {
    return JSON.parse((await readBody(req, MAX_BODY_BYTES)) || '{}');
  } catch (error) {
    send(res, error instanceof PayloadTooLarge ? 413 : 400, { ok: false, error: 'bad_request' });
    return null;
  }
}

/* ---- read ------------------------------------------------------------ */

function handleList(req, res, query) {
  const studentId = String(query.get('studentId') ?? '');
  const actor = readActor({
    actorRole: query.get('actorRole'),
    actorId: query.get('actorId'),
  });

  const reason = denyReason(actor, studentId, 'any');
  if (reason) {
    refuse(res, actor, studentId, reason, 'GET /api/parents');
    return;
  }

  send(res, 200, {
    ok: true,
    parents: parentsOf(studentId),
    telegram: telegramHealth(),
  });
}

function handleHistory(req, res, query) {
  const studentId = String(query.get('studentId') ?? '');
  const actor = readActor({
    actorRole: query.get('actorRole'),
    actorId: query.get('actorId'),
  });

  const reason = denyReason(actor, studentId, 'any');
  if (reason) {
    refuse(res, actor, studentId, reason, 'GET /api/parents/history');
    return;
  }

  /* The log is written with the teacher's id; the reader sees a name. */
  const rows = messagesFor(studentId).map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    dateISO: row.dateISO ?? row.createdAt.slice(0, 10),
    teacherName: teacherNameOf(row.teacherId) || row.teacherName || '',
    recipients: row.recipients,
    text: row.text,
    delivery: row.delivery,
  }));

  send(res, 200, { ok: true, messages: rows });
}

/* ---- write ----------------------------------------------------------- */

async function handleSave(req, res) {
  const payload = await body(req, res);
  if (!payload) return;

  const studentId = String(payload.studentId ?? '');
  const actor = readActor(payload);
  const relation = payload.relation;

  if (!isRelation(relation)) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  /* Only the pupil keeps their own family details up to date. A
     teacher may read them; they may not rewrite them. */
  const reason = denyReason(actor, studentId, 'own');
  if (reason) {
    refuse(res, actor, studentId, reason, 'POST /api/parents/save');
    return;
  }

  send(res, 200, { ok: true, parent: saveParent({ studentId, relation, ...payload }) });
}

async function handleLink(req, res) {
  const payload = await body(req, res);
  if (!payload) return;

  const studentId = String(payload.studentId ?? '');
  const actor = readActor(payload);
  const relation = payload.relation;

  if (!isRelation(relation)) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  const reason = denyReason(actor, studentId, 'own');
  if (reason) {
    refuse(res, actor, studentId, reason, 'POST /api/parents/link');
    return;
  }

  /* No token, no link. Offering one would promise a connection that
     cannot complete. */
  if (!hasTelegramToken) {
    send(res, 503, { ok: false, error: 'telegram_not_configured' });
    return;
  }

  const { token, expiresAt } = createToken(studentId, relation);
  const link = deepLinkFor(token);

  if (!link) {
    /* The bot has not answered getMe yet, so we do not know its
       username and cannot build a real link. Say that rather than
       guess a URL. */
    send(res, 503, { ok: false, error: 'telegram_unreachable' });
    return;
  }

  send(res, 200, {
    ok: true,
    link,
    expiresAt,
    parent: publicView(studentId, relation),
  });
}

async function handleUnlink(req, res) {
  const payload = await body(req, res);
  if (!payload) return;

  const studentId = String(payload.studentId ?? '');
  const actor = readActor(payload);
  const relation = payload.relation;

  if (!isRelation(relation)) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }
  const reason = denyReason(actor, studentId, 'own');
  if (reason) {
    refuse(res, actor, studentId, reason, 'POST /api/parents/unlink');
    return;
  }

  send(res, 200, { ok: true, parent: unlinkParent(studentId, relation) });
}

/* ---- delivery -------------------------------------------------------- */

/** The message a parent receives, signed with facts the server knows. */
function compose({ teacherId, text }) {
  const teacher = teacherNameOf(teacherId);
  return [`${SCHOOL_NAME}`, teacher ? `${teacher}:` : '', '', text].filter(Boolean).join('\n');
}

async function handleMessage(req, res) {
  const payload = await body(req, res);
  if (!payload) return;

  const studentId = String(payload.studentId ?? '');
  const actor = readActor(payload);
  const text = String(payload.text ?? '').trim().slice(0, MAX_MESSAGE_CHARS);

  const relations = (Array.isArray(payload.recipients) ? payload.recipients : [])
    .filter((value) => isRelation(value))
    /* Pressing "both" twice must not send twice. */
    .filter((value, index, all) => all.indexOf(value) === index);

  if (!text || relations.length === 0) {
    send(res, 400, { ok: false, error: 'bad_request' });
    return;
  }

  /* Messaging a family is a teacher's act, and only for their own
     pupils. */
  const reason = denyReason(actor, studentId, 'teach');
  if (reason) {
    refuse(res, actor, studentId, reason, 'POST /api/parents/message');
    return;
  }

  /* A second click on Send, or a retried request, returns the first
     result instead of delivering the message twice. */
  const fingerprint = createHash('sha256')
    .update(`${actor.userId}|${studentId}|${relations.join(',')}|${text}`)
    .digest('hex');
  const earlier = recentSends.get(fingerprint);
  if (earlier && Date.now() - earlier.at < DUPLICATE_WINDOW_MS) {
    send(res, 200, { ok: true, duplicate: true, delivery: earlier.delivery });
    return;
  }

  const composed = compose({ teacherId: actor.userId, text });
  const delivery = [];

  for (const relation of relations) {
    /* The recipient is resolved here, from the store. The browser
       never had the chance to name it. */
    const chatId = chatIdFor(studentId, relation);
    if (!chatId) {
      delivery.push({ relation, status: DeliveryResult.NOT_CONNECTED });
      continue;
    }
    const result = await sendTelegramMessage(chatId, composed);
    delivery.push({ relation, status: result.status });
  }

  recentSends.set(fingerprint, { at: Date.now(), delivery });
  for (const [key, value] of recentSends) {
    if (Date.now() - value.at > DUPLICATE_WINDOW_MS * 4) recentSends.delete(key);
  }

  /* Logged whatever happened, including the failures: a teacher must
     be able to see that a message did not arrive. */
  const row = appendMessage({
    studentId,
    classId: classOfStudentId(studentId),
    teacherId: actor.userId,
    recipients: relations.map((relation) => ({
      relation,
      name: nameFor(studentId, relation),
    })),
    text,
    delivery,
  });

  const anySent = delivery.some((entry) => entry.status === DeliveryResult.SENT);
  send(res, 200, {
    ok: true,
    /* Never "sent" unless Telegram accepted at least one of them. */
    anySent,
    delivery,
    message: {
      id: row.id,
      createdAt: row.createdAt,
      dateISO: row.dateISO,
      teacherName: teacherNameOf(actor.userId),
      recipients: row.recipients,
      text: row.text,
      delivery,
    },
  });
}

/* ---- routing --------------------------------------------------------- */

/** Returns true when it handled the request. */
export function parentRoutes(req, res, url, query) {
  if (!url.startsWith('/api/parents') && url !== '/api/telegram/status') return false;

  if (url === '/api/telegram/status') {
    if (req.method !== 'GET') {
      send(res, 405, { ok: false, error: 'method_not_allowed' });
      return true;
    }
    send(res, 200, { ok: true, telegram: telegramHealth() });
    return true;
  }

  const routes = {
    '/api/parents': { method: 'GET', run: () => handleList(req, res, query) },
    '/api/parents/history': { method: 'GET', run: () => handleHistory(req, res, query) },
    '/api/parents/save': { method: 'POST', run: () => handleSave(req, res) },
    '/api/parents/link': { method: 'POST', run: () => handleLink(req, res) },
    '/api/parents/unlink': { method: 'POST', run: () => handleUnlink(req, res) },
    '/api/parents/message': { method: 'POST', run: () => handleMessage(req, res) },
  };

  const route = routes[url];
  if (!route) return false;

  if (req.method !== route.method) {
    send(res, 405, { ok: false, error: 'method_not_allowed' });
    return true;
  }

  Promise.resolve(route.run()).catch((error) => {
    logFailure(`parents ${url}`, error);
    send(res, 500, { ok: false, error: 'server_error' });
  });
  return true;
}
