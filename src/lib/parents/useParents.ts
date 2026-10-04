import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ID } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { useSession } from '@/auth/AuthProvider';
import {
  fetchParentHistory,
  fetchParents,
  requestParentLink,
  saveParentRecord,
  sendParentMessage,
  unlinkParentRecord,
  type Actor,
} from './client';
import {
  PARENT_RELATIONS,
  type DeliveryOutcome,
  type ParentErrorCode,
  type ParentMessage,
  type ParentRecord,
  type ParentRelation,
  type TelegramHealth,
} from './types';

/* ------------------------------------------------------------------
   Parent records, read and written through the server.

   They are not in the application store on purpose. A Telegram
   connection is a fact about the outside world — a real parent opened
   a real link — so it cannot live in the browser's localStorage,
   where it could be edited into existence. The browser holds a copy
   to render and nothing more.

   The same hook serves both sides. A student gets their own two
   records; a teacher gets a pupil's, read-only, if they teach them.
   Which of those applies is decided by the server from the session
   identity this hook sends, not by the screen that called it.
   ------------------------------------------------------------------ */

const ERROR_TEXT: Record<ParentErrorCode, TranslationKey> = {
  forbidden: 'parents.error.forbidden',
  telegram_not_configured: 'parents.error.notConfigured',
  telegram_unreachable: 'parents.error.unreachable',
  network: 'parents.error.network',
  timeout: 'parents.error.timeout',
  bad_request: 'parents.error.badRequest',
  server_error: 'parents.error.server',
};

const empty = (studentId: ID, relation: ParentRelation): ParentRecord => ({
  studentId,
  relation,
  fullName: '',
  phone: '',
  telegramStatus: 'unlinked',
  telegramLinked: false,
  connectedAt: null,
  pendingUntil: null,
});

/* While a parent is expected to press Start, the record is re-read
   every few seconds — but not for ever. A link lasts 20 minutes; this
   watches for four, which covers a parent opening it straight away
   and stops well before it could be mistaken for a live feed. */
const POLL_INTERVAL_MS = 3500;
const POLL_LIMIT = 68;

export interface ParentLinkState {
  relation: ParentRelation;
  url: string;
  expiresAt: string;
}

export interface UseParents {
  parents: ParentRecord[];
  telegram: TelegramHealth | null;
  loading: boolean;
  /** True while a save, link or unlink is in flight. */
  busy: boolean;
  errorText: string | null;
  /** The link just minted, for the student to pass to their parent. */
  link: ParentLinkState | null;
  /** True when the browser is watching for the parent to press Start. */
  watching: boolean;
  save: (relation: ParentRelation, fullName: string, phone: string) => void;
  connect: (relation: ParentRelation) => void;
  disconnect: (relation: ParentRelation) => void;
  dismissLink: () => void;
  refresh: () => void;
}

export function useParents(studentId: ID): UseParents {
  const { t } = useI18n();
  const session = useSession();

  const [parents, setParents] = useState<ParentRecord[]>(() =>
    PARENT_RELATIONS.map((relation) => empty(studentId, relation)),
  );
  const [telegram, setTelegram] = useState<TelegramHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ParentErrorCode | null>(null);
  const [link, setLink] = useState<ParentLinkState | null>(null);

  const actor = useMemo<Actor | null>(
    () => (session ? { role: session.role, userId: session.userId } : null),
    [session],
  );

  /* Guards a late reply from landing after the screen moved on. */
  const generation = useRef(0);

  const load = useCallback(
    async (showLoading: boolean) => {
      if (!actor) return;
      const mine = ++generation.current;
      if (showLoading) setLoading(true);

      const result = await fetchParents(studentId, actor);
      if (mine !== generation.current) return;

      if (result.ok) {
        const byRelation = new Map(result.parents.map((entry) => [entry.relation, entry]));
        setParents(
          PARENT_RELATIONS.map(
            (relation) => byRelation.get(relation) ?? empty(studentId, relation),
          ),
        );
        setTelegram(result.telegram);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    },
    [actor, studentId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  /* ---- waiting for Start ----
     Only while something is actually pending, and only for a bounded
     number of attempts: a screen that polls for ever is a screen that
     is still polling an hour after the demo ended. */
  const pending = parents.some((entry) => entry.telegramStatus === 'pending');
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    if (!pending) {
      setWatching(false);
      return;
    }
    setWatching(true);
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > POLL_LIMIT) {
        window.clearInterval(timer);
        setWatching(false);
        return;
      }
      void load(false);
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [load, pending]);

  const save = useCallback(
    (relation: ParentRelation, fullName: string, phone: string) => {
      if (!actor || busy) return;
      setBusy(true);
      setError(null);
      void (async () => {
        const result = await saveParentRecord(actor, { studentId, relation, fullName, phone });
        if (result.ok) {
          setParents((current) =>
            current.map((entry) => (entry.relation === relation ? result.parent : entry)),
          );
        } else {
          setError(result.error);
        }
        setBusy(false);
      })();
    },
    [actor, busy, studentId],
  );

  const connect = useCallback(
    (relation: ParentRelation) => {
      if (!actor || busy) return;
      setBusy(true);
      setError(null);
      void (async () => {
        const result = await requestParentLink(actor, { studentId, relation });
        if (result.ok) {
          setLink({ relation, url: result.link, expiresAt: result.expiresAt });
          setParents((current) =>
            current.map((entry) => (entry.relation === relation ? result.parent : entry)),
          );
        } else {
          setError(result.error);
        }
        setBusy(false);
      })();
    },
    [actor, busy, studentId],
  );

  const disconnect = useCallback(
    (relation: ParentRelation) => {
      if (!actor || busy) return;
      setBusy(true);
      setError(null);
      void (async () => {
        const result = await unlinkParentRecord(actor, { studentId, relation });
        if (result.ok) {
          setParents((current) =>
            current.map((entry) => (entry.relation === relation ? result.parent : entry)),
          );
          setLink((current) => (current?.relation === relation ? null : current));
        } else {
          setError(result.error);
        }
        setBusy(false);
      })();
    },
    [actor, busy, studentId],
  );

  return {
    parents,
    telegram,
    loading,
    busy,
    errorText: error ? t(ERROR_TEXT[error]) : null,
    link,
    watching,
    save,
    connect,
    disconnect,
    dismissLink: () => setLink(null),
    refresh: () => void load(false),
  };
}

/* ---- teacher -> parent messaging ------------------------------------ */

export interface UseParentMessaging {
  history: ParentMessage[];
  sending: boolean;
  errorText: string | null;
  /** The outcome of the last send, per recipient. */
  delivery: DeliveryOutcome[] | null;
  /** True when the last send was a repeat the server already had. */
  duplicate: boolean;
  send: (recipients: ParentRelation[], text: string) => void;
  reset: () => void;
}

export function useParentMessaging(studentId: ID): UseParentMessaging {
  const { t } = useI18n();
  const session = useSession();
  const [history, setHistory] = useState<ParentMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ParentErrorCode | null>(null);
  const [delivery, setDelivery] = useState<DeliveryOutcome[] | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  const actor = useMemo<Actor | null>(
    () => (session ? { role: session.role, userId: session.userId } : null),
    [session],
  );

  const load = useCallback(async () => {
    if (!actor) return;
    const result = await fetchParentHistory(studentId, actor);
    if (result.ok) setHistory(result.messages);
  }, [actor, studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    (recipients: ParentRelation[], text: string) => {
      /* The guard that makes a double-click harmless on this side; the
         server has its own, for a retried request. */
      if (!actor || sending || recipients.length === 0 || !text.trim()) return;
      setSending(true);
      setError(null);
      setDelivery(null);
      setDuplicate(false);

      void (async () => {
        const result = await sendParentMessage(actor, { studentId, recipients, text: text.trim() });
        if (result.ok) {
          setDelivery(result.delivery);
          setDuplicate(result.duplicate === true);
          await load();
        } else {
          setError(result.error);
        }
        setSending(false);
      })();
    },
    [actor, load, sending, studentId],
  );

  return {
    history,
    sending,
    errorText: error ? t(ERROR_TEXT[error]) : null,
    delivery,
    duplicate,
    send,
    reset: () => {
      setDelivery(null);
      setError(null);
      setDuplicate(false);
    },
  };
}
