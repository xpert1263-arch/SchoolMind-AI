import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { classOfStudentId } from '../src/data/roster.mjs';

/* ------------------------------------------------------------------
   Parent records, connection tokens and the message log.

   This is the one part of SchoolMind that does NOT live in the
   browser, and it is deliberate. Two of these fields decide who can
   be contacted:

     telegramChatId   a real person's chat. It is written only by the
                      Telegram bridge, after Telegram itself confirmed
                      that somebody opened the link and pressed Start.
                      It is never accepted from a request and never
                      sent to one — a client that could name a chat id
                      could message any family in the school.

     token            proves a connection attempt came from the student
                      whose parent it is. Random, expiring, single-use.

   Everything a browser is allowed to see goes through `publicView`,
   which has no chat id in it at all.

   The file sits outside the repository tree's tracked content and
   holds no secrets — only names, optional phone numbers and chat ids,
   which is personal data and the reason it is git-ignored.
   ------------------------------------------------------------------ */

const STORE_PATH = resolve(process.cwd(), '.schoolmind', 'parents.json');
const STORE_VERSION = 1;

/* The same demo day the browser uses (src/lib/dates.ts). A message
   carries two timestamps for the same reason every other record does:
   `createdAt` is the real instant it was sent, and `dateISO` is the
   calendar day the app shows. Before the presentation those differ,
   so a message sent during a rehearsal reads as part of the demo day
   instead of as a week-old note on a screen that says 8 October. On
   and after the day itself they are the same date. */
const DEMO_REFERENCE_DATE = '2026-10-08';

function demoDateISO() {
  const now = new Date();
  const real = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return real < DEMO_REFERENCE_DATE ? DEMO_REFERENCE_DATE : real;
}

export const RELATIONS = ['father', 'mother'];

/** A connection link is only useful for a few minutes. */
const TOKEN_TTL_MS = 20 * 60 * 1000;
const MESSAGE_LIMIT = 200;

const empty = () => ({
  version: STORE_VERSION,
  parents: {},
  tokens: {},
  messages: [],
  /** Telegram update offset, so a restart does not replay old updates. */
  updateOffset: 0,
});

let cache = null;

function load() {
  if (cache) return cache;
  try {
    const raw = readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cache = {
      ...empty(),
      ...parsed,
      parents: parsed?.parents ?? {},
      tokens: parsed?.tokens ?? {},
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
    };
  } catch {
    /* No file yet, or an unreadable one: start from nothing rather
       than refuse to run. */
    cache = empty();
  }
  return cache;
}

function persist() {
  const data = load();
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    /* Write beside the target and rename, so a crash mid-write cannot
       leave a half-written file behind. */
    const temp = `${STORE_PATH}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
    renameSync(temp, STORE_PATH);
  } catch (error) {
    console.error(
      `[schoolmind-parents] could not persist records: ${error?.code ?? 'write failed'}`,
    );
  }
}

const keyOf = (studentId, relation) => `${studentId}:${relation}`;

export function isRelation(value) {
  return RELATIONS.includes(value);
}

/** A student id that names somebody in this school, or null. */
export function validStudentId(studentId) {
  return classOfStudentId(studentId) ? studentId : null;
}

function record(studentId, relation) {
  const data = load();
  return data.parents[keyOf(studentId, relation)] ?? null;
}

function activeToken(studentId, relation) {
  const data = load();
  const now = Date.now();
  return (
    Object.entries(data.tokens).find(
      ([, entry]) =>
        entry.studentId === studentId &&
        entry.relation === relation &&
        !entry.usedAt &&
        entry.expiresAt > now,
    ) ?? null
  );
}

/**
 * What a browser may see. No chat id, ever — only whether a chat is
 * bound, which is all any screen needs to decide what to show.
 */
export function publicView(studentId, relation) {
  const stored = record(studentId, relation);
  const pending = activeToken(studentId, relation);

  const status = stored?.telegramChatId ? 'connected' : pending ? 'pending' : 'unlinked';

  return {
    studentId,
    relation,
    fullName: stored?.fullName ?? '',
    phone: stored?.phone ?? '',
    telegramStatus: status,
    telegramLinked: Boolean(stored?.telegramChatId),
    connectedAt: stored?.connectedAt ?? null,
    /* So the UI can count down rather than leave a link looking live
       for ever. The token itself is not repeated here. */
    pendingUntil: pending ? new Date(pending[1].expiresAt).toISOString() : null,
  };
}

export function parentsOf(studentId) {
  return RELATIONS.map((relation) => publicView(studentId, relation));
}

/** Student-entered details. Never touches the chat id. */
export function saveParent({ studentId, relation, fullName, phone }) {
  const data = load();
  const key = keyOf(studentId, relation);
  const existing = data.parents[key];

  data.parents[key] = {
    studentId,
    relation,
    fullName: String(fullName ?? '').trim().slice(0, 80),
    phone: String(phone ?? '').trim().slice(0, 32),
    /* Preserved deliberately: editing a name must not quietly break a
       connection that a parent already completed. */
    telegramChatId: existing?.telegramChatId ?? null,
    connectedAt: existing?.connectedAt ?? null,
    updatedAt: new Date().toISOString(),
  };
  persist();
  return publicView(studentId, relation);
}

/**
 * A fresh single-use connection token for one parent of one student.
 *
 * 16 random bytes, base64url — 128 bits, so it cannot be guessed, and
 * it carries no information about the child. Any earlier unused token
 * for the same parent is retired, so a link that was shared and then
 * regenerated stops working.
 */
export function createToken(studentId, relation) {
  const data = load();

  for (const [token, entry] of Object.entries(data.tokens)) {
    if (entry.studentId === studentId && entry.relation === relation && !entry.usedAt) {
      delete data.tokens[token];
    }
  }

  const token = randomBytes(16).toString('base64url');
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  data.tokens[token] = {
    studentId,
    relation,
    createdAt: Date.now(),
    expiresAt,
    usedAt: null,
  };

  /* Keep the table from growing for ever across a long demo day. */
  for (const [old, entry] of Object.entries(data.tokens)) {
    const spent = entry.usedAt && Date.now() - entry.usedAt > 24 * 3600 * 1000;
    const stale = !entry.usedAt && entry.expiresAt < Date.now() - 24 * 3600 * 1000;
    if (spent || stale) delete data.tokens[old];
  }

  persist();
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

export const TokenResult = {
  OK: 'ok',
  UNKNOWN: 'unknown_token',
  EXPIRED: 'expired_token',
  USED: 'used_token',
};

/**
 * Validates a Start payload and binds the chat if it is good.
 *
 * Called only by the Telegram bridge, with a chat id Telegram itself
 * reported. Every failure mode is distinct, because "expired" and
 * "already used" are different things to tell a parent.
 */
export function redeemToken(token, chatId) {
  const data = load();
  const entry = typeof token === 'string' ? data.tokens[token] : undefined;

  if (!entry) return { result: TokenResult.UNKNOWN };
  if (entry.usedAt) return { result: TokenResult.USED };
  if (entry.expiresAt <= Date.now()) return { result: TokenResult.EXPIRED };

  const key = keyOf(entry.studentId, entry.relation);
  const existing = data.parents[key] ?? {
    studentId: entry.studentId,
    relation: entry.relation,
    fullName: '',
    phone: '',
  };

  const connectedAt = new Date().toISOString();
  data.parents[key] = {
    ...existing,
    telegramChatId: String(chatId),
    connectedAt,
  };
  entry.usedAt = Date.now();
  persist();

  return {
    result: TokenResult.OK,
    studentId: entry.studentId,
    relation: entry.relation,
    fullName: data.parents[key].fullName,
  };
}

/** Drops a binding so the same parent can be linked again. */
export function unlinkParent(studentId, relation) {
  const data = load();
  const key = keyOf(studentId, relation);
  const existing = data.parents[key];
  if (existing) {
    existing.telegramChatId = null;
    existing.connectedAt = null;
  }
  for (const [token, entry] of Object.entries(data.tokens)) {
    if (entry.studentId === studentId && entry.relation === relation) delete data.tokens[token];
  }
  persist();
  return publicView(studentId, relation);
}

/**
 * The chat id for one parent — server-side only.
 *
 * This is the function that makes teacher messaging safe: the caller
 * passes a student and a relation it has already been authorised for,
 * and the recipient is resolved here. No request body can name a chat.
 */
export function chatIdFor(studentId, relation) {
  return record(studentId, relation)?.telegramChatId ?? null;
}

export function nameFor(studentId, relation) {
  return record(studentId, relation)?.fullName ?? '';
}

/* ---- message log ----------------------------------------------------
   Light on purpose: who sent what to whom, and whether Telegram took
   it. No read receipts, no threads, no incoming messages. */

export function appendMessage(entry) {
  const data = load();
  const row = {
    id: randomBytes(8).toString('hex'),
    createdAt: new Date().toISOString(),
    dateISO: demoDateISO(),
    ...entry,
  };
  data.messages = [row, ...data.messages].slice(0, MESSAGE_LIMIT);
  persist();
  return row;
}

export function messagesFor(studentId, limit = 20) {
  return load()
    .messages.filter((row) => row.studentId === studentId)
    .slice(0, limit);
}

/* ---- Telegram update offset ----------------------------------------- */

export function readUpdateOffset() {
  return load().updateOffset ?? 0;
}

export function writeUpdateOffset(offset) {
  const data = load();
  if (offset <= (data.updateOffset ?? 0)) return;
  data.updateOffset = offset;
  persist();
}

/** Test seam: forget the in-memory copy and re-read from disk. */
export function reloadStore() {
  cache = null;
  return load();
}
