import { postJson } from '@/lib/ai/request';
import type { AppMode, ID } from '@/data/types';
import type {
  ConnectionLink,
  DeliveryOutcome,
  ParentErrorCode,
  ParentMessage,
  ParentRecord,
  ParentRelation,
  TelegramHealth,
} from './types';

/* The browser's only channel to Parent Connect.

   Every call carries who is asking — role and user id — because the
   server, not this file, decides what that person may see. The client
   never sends a Telegram chat id, and no response contains one. */

export interface Actor {
  role: AppMode;
  userId: ID;
}

const ERRORS: ParentErrorCode[] = [
  'forbidden',
  'telegram_not_configured',
  'telegram_unreachable',
  'network',
  'timeout',
  'bad_request',
  'server_error',
];

function toErrorCode(value: unknown): ParentErrorCode {
  return ERRORS.includes(value as ParentErrorCode) ? (value as ParentErrorCode) : 'server_error';
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: ParentErrorCode };

async function get<T>(path: string, actor: Actor, params: Record<string, string>): Promise<
  Result<T>
> {
  const query = new URLSearchParams({
    ...params,
    actorRole: actor.role,
    actorId: actor.userId,
  });
  try {
    const response = await fetch(`${path}?${query.toString()}`);
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || body.ok !== true) {
      return { ok: false, error: toErrorCode(body.error) };
    }
    return body as Result<T>;
  } catch {
    return { ok: false, error: 'network' };
  }
}

async function post<T>(
  path: string,
  actor: Actor,
  payload: Record<string, unknown>,
): Promise<Result<T>> {
  const result = await postJson<Record<string, unknown>>(path, {
    ...payload,
    actorRole: actor.role,
    actorId: actor.userId,
  });
  if (!result.ok) return { ok: false, error: result.error === 'timeout' ? 'timeout' : 'network' };
  const body = result.body;
  if (result.status >= 400 || body.ok !== true) {
    return { ok: false, error: toErrorCode(body.error) };
  }
  return body as Result<T>;
}

export function fetchParents(studentId: ID, actor: Actor) {
  return get<{ parents: ParentRecord[]; telegram: TelegramHealth }>('/api/parents', actor, {
    studentId,
  });
}

export function fetchParentHistory(studentId: ID, actor: Actor) {
  return get<{ messages: ParentMessage[] }>('/api/parents/history', actor, { studentId });
}

export function fetchTelegramStatus() {
  return fetch('/api/telegram/status')
    .then((response) => response.json())
    .then((body) => (body?.telegram ?? null) as TelegramHealth | null)
    .catch(() => null);
}

export function saveParentRecord(
  actor: Actor,
  input: { studentId: ID; relation: ParentRelation; fullName: string; phone: string },
) {
  return post<{ parent: ParentRecord }>('/api/parents/save', actor, input);
}

/** Asks the server for a one-time connection link. */
export function requestParentLink(
  actor: Actor,
  input: { studentId: ID; relation: ParentRelation },
) {
  return post<{ link: string; expiresAt: string; parent: ParentRecord }>(
    '/api/parents/link',
    actor,
    input,
  );
}

export function unlinkParentRecord(
  actor: Actor,
  input: { studentId: ID; relation: ParentRelation },
) {
  return post<{ parent: ParentRecord }>('/api/parents/unlink', actor, input);
}

/**
 * Sends a teacher's message. The recipients are relations — "father",
 * "mother" — and never chat ids: the server resolves those after it
 * has checked that this teacher teaches this pupil.
 */
export function sendParentMessage(
  actor: Actor,
  input: { studentId: ID; recipients: ParentRelation[]; text: string },
) {
  return post<{
    anySent: boolean;
    duplicate?: boolean;
    delivery: DeliveryOutcome[];
    message?: ParentMessage;
  }>('/api/parents/message', actor, input);
}

export type { ConnectionLink };
