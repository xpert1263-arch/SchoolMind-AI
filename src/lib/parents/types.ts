import type { ID } from '@/data/types';

/* ------------------------------------------------------------------
   Parent Connect.

   A student has exactly two parent records, father and mother, and
   they are independent in every respect: own name, own phone, own
   connection, own token. Merging them into one "parent" would make
   the common case — one parent on Telegram, one not — impossible to
   express.

   Notice what is NOT in `ParentRecord`: the Telegram chat id. The
   browser is told whether a chat is linked, never which one. The id
   lives on the server and is resolved there, which is what keeps a
   teacher's message from being redirectable.
   ------------------------------------------------------------------ */

export type ParentRelation = 'father' | 'mother';
export const PARENT_RELATIONS: ParentRelation[] = ['father', 'mother'];

export type TelegramStatus = 'unlinked' | 'pending' | 'connected';

export interface ParentRecord {
  studentId: ID;
  relation: ParentRelation;
  fullName: string;
  phone: string;
  telegramStatus: TelegramStatus;
  telegramLinked: boolean;
  connectedAt: string | null;
  /** When the outstanding connection link stops working. */
  pendingUntil: string | null;
}

/** What delivery can do right now. No token, no chat ids. */
export interface TelegramHealth {
  configured: boolean;
  running: boolean;
  botUsername: string | null;
  errorCode: 'invalid_token' | 'conflict' | 'timeout' | 'unreachable' | null;
}

export type DeliveryStatus =
  | 'sent'
  | 'not_connected'
  | 'not_configured'
  | 'blocked'
  | 'failed';

export interface DeliveryOutcome {
  relation: ParentRelation;
  status: DeliveryStatus;
}

export interface ParentMessage {
  id: string;
  /** The real instant it was sent. */
  createdAt: string;
  /** The calendar day to show, from the demo clock. */
  dateISO: string;
  teacherName: string;
  recipients: Array<{ relation: ParentRelation; name: string }>;
  text: string;
  delivery: DeliveryOutcome[];
}

export type ParentErrorCode =
  | 'forbidden'
  | 'telegram_not_configured'
  | 'telegram_unreachable'
  | 'network'
  | 'timeout'
  | 'bad_request'
  | 'server_error';

export interface ConnectionLink {
  url: string;
  expiresAt: string;
}
