import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  Send,
  Unlink,
  UserRound,
  Users,
} from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { formatTime } from '@/lib/dates';
import { useParents, type ParentLinkState } from '@/lib/parents/useParents';
import type { ParentRecord, ParentRelation, TelegramHealth } from '@/lib/parents/types';
import { useCurrentStudent } from '@/state/selectors';
import { useToast } from '@/state/toast';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { Chip } from '@/components/ui/Status';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------
   "Ota-onam" — the student connects their own family.

   Two independent records, father and mother, each with its own name,
   phone and Telegram connection. They belong to the signed-in student
   and nobody else: the screen never names another pupil, and the
   server refuses a request that tries to.

   The one thing this screen will not do is claim a connection it does
   not have. "Ulandi" appears only after Telegram told our server that
   this parent opened the link and pressed Start — never because the
   link was generated, copied or opened.
   ------------------------------------------------------------------ */

const RELATION_LABEL: Record<ParentRelation, TranslationKey> = {
  father: 'parents.father',
  mother: 'parents.mother',
};

const STATUS_LABEL: Record<ParentRecord['telegramStatus'], TranslationKey> = {
  unlinked: 'parents.statusUnlinked',
  pending: 'parents.statusPending',
  connected: 'parents.statusConnected',
};

export function Parents() {
  const { t } = useI18n();
  const { student } = useCurrentStudent();
  const parents = useParents(student.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-accent-text">
          <Users size={13} aria-hidden />
          {t('parents.eyebrow')}
        </p>
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          {t('parents.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('parents.subtitle')}
        </p>
      </header>

      <TelegramBanner telegram={parents.telegram} />

      {parents.errorText ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-danger-text" />
          <p className="text-[13px] text-danger-text">{parents.errorText}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {parents.parents.map((record) => (
          <ParentCard
            key={record.relation}
            record={record}
            telegram={parents.telegram}
            busy={parents.busy}
            link={parents.link?.relation === record.relation ? parents.link : null}
            watching={parents.watching && record.telegramStatus === 'pending'}
            onSave={(fullName, phone) => parents.save(record.relation, fullName, phone)}
            onConnect={() => parents.connect(record.relation)}
            onDisconnect={() => parents.disconnect(record.relation)}
            onDismissLink={parents.dismissLink}
          />
        ))}
      </div>

      <p className="max-w-2xl text-[12px] leading-relaxed text-ink-subtle">
        {t('parents.privacyNote')}
      </p>
    </div>
  );
}

/* ---- delivery availability ------------------------------------------ */

function TelegramBanner({ telegram }: { telegram: TelegramHealth | null }) {
  const { t } = useI18n();
  if (!telegram) return null;

  /* Each of these is a different truth, and a parent waiting for a
     message deserves the right one. */
  const notice: { tone: 'warn' | 'info'; title: TranslationKey; body: TranslationKey } | null =
    !telegram.configured
      ? { tone: 'warn', title: 'parents.offTitle', body: 'parents.offBody' }
      : telegram.errorCode === 'invalid_token'
        ? { tone: 'warn', title: 'parents.badTokenTitle', body: 'parents.badTokenBody' }
        : telegram.errorCode === 'conflict'
          ? { tone: 'warn', title: 'parents.conflictTitle', body: 'parents.conflictBody' }
          : /* Reachability can drop without the bridge stopping. Say so
               here rather than letting the pupil discover it by
               pressing a button that cannot work. */
            telegram.errorCode === 'unreachable' || telegram.errorCode === 'timeout'
            ? { tone: 'warn', title: 'parents.offlineTitle', body: 'parents.offlineBody' }
            : !telegram.running
              ? { tone: 'info', title: 'parents.startingTitle', body: 'parents.startingBody' }
              : null;

  if (!notice) return null;

  const warn = notice.tone === 'warn';
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3',
        warn ? 'border-warn-line bg-warn-soft' : 'border-info-line bg-info-soft',
      )}
    >
      <Info
        size={15}
        aria-hidden
        className={cn('mt-0.5 shrink-0', warn ? 'text-warn-text' : 'text-info-text')}
      />
      <div className="min-w-0">
        <p className={cn('text-[13px] font-medium', warn ? 'text-warn-text' : 'text-info-text')}>
          {t(notice.title)}
        </p>
        <p
          className={cn(
            'mt-1 text-[12.5px] leading-relaxed',
            warn ? 'text-warn-text/90' : 'text-info-text/90',
          )}
        >
          {t(notice.body)}
        </p>
      </div>
    </div>
  );
}

/* ---- one parent ------------------------------------------------------ */

function ParentCard({
  record,
  telegram,
  busy,
  link,
  watching,
  onSave,
  onConnect,
  onDisconnect,
  onDismissLink,
}: {
  record: ParentRecord;
  telegram: TelegramHealth | null;
  busy: boolean;
  link: ParentLinkState | null;
  watching: boolean;
  onSave: (fullName: string, phone: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onDismissLink: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(record.fullName);
  const [phone, setPhone] = useState(record.phone);

  /* The server is the source of truth; follow it when it answers. */
  useEffect(() => {
    setName(record.fullName);
    setPhone(record.phone);
  }, [record.fullName, record.phone]);

  const dirty = name.trim() !== record.fullName || phone.trim() !== record.phone;
  const canConnect = Boolean(telegram?.configured) && name.trim().length > 0;

  const statusTone =
    record.telegramStatus === 'connected'
      ? 'bg-success-soft text-success-text border-success-line'
      : record.telegramStatus === 'pending'
        ? 'bg-info-soft text-info-text border-info-line'
        : 'bg-surface-muted text-ink-muted border-line';

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <UserRound size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">
              {t(RELATION_LABEL[record.relation])}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
              {record.fullName || t('parents.noName')}
            </p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium',
            statusTone,
          )}
        >
          {t(STATUS_LABEL[record.telegramStatus])}
        </span>
      </header>

      <div className="flex flex-col gap-3">
        <Field label={t('parents.fullName')}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('parents.fullNamePlaceholder')}
            maxLength={80}
          />
        </Field>
        <Field label={t('parents.phone')} optional hint={t('parents.phoneHint')}>
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998 90 123 45 67"
            inputMode="tel"
            maxLength={32}
          />
        </Field>
        <div>
          <Button
            variant={dirty ? 'primary' : 'secondary'}
            size="sm"
            disabled={!dirty || busy}
            onClick={() => onSave(name.trim(), phone.trim())}
            iconLeft={<Check size={14} aria-hidden />}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

      <hr className="border-line" />

      {record.telegramStatus === 'connected' ? (
        <div className="flex flex-col gap-2.5">
          <p className="flex items-start gap-2 text-[13px] text-success-text">
            <Check size={15} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              {t('parents.connectedBody')}
              {record.connectedAt ? ` · ${formatTime(record.connectedAt)}` : ''}
            </span>
          </p>
          <div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onDisconnect}
              iconLeft={<Unlink size={14} aria-hidden />}
            >
              {t('parents.disconnect')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {t('parents.connectHint', { relation: t(RELATION_LABEL[record.relation]) })}
          </p>

          {link ? (
            <LinkPanel link={link} watching={watching} onDismiss={onDismissLink} />
          ) : (
            <div>
              <Button
                variant="primary"
                size="sm"
                disabled={!canConnect || busy}
                onClick={onConnect}
                iconLeft={
                  busy ? (
                    <Loader2 size={14} aria-hidden className="animate-spin" />
                  ) : (
                    <Link2 size={14} aria-hidden />
                  )
                }
              >
                {t('parents.connectAction', { relation: t(RELATION_LABEL[record.relation]) })}
              </Button>
              {!telegram?.configured ? (
                <p className="mt-2 text-[12px] text-ink-subtle">{t('parents.offShort')}</p>
              ) : !name.trim() ? (
                <p className="mt-2 text-[12px] text-ink-subtle">{t('parents.needName')}</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---- the one-time link ---------------------------------------------- */

function LinkPanel({
  link,
  watching,
  onDismiss,
}: {
  link: ParentLinkState;
  watching: boolean;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const expiresLabel = useMemo(() => formatTime(link.expiresAt), [link.expiresAt]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      toast(t('parents.copied'));
    } catch {
      /* Clipboard access can be refused; the link is on screen and
         selectable either way. */
      toast(t('parents.copyFailed'));
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-accent-line bg-accent-soft/50 p-3.5">
      <div className="flex items-start gap-2">
        <Send size={15} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-ink">{t('parents.linkTitle')}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            {t('parents.linkBody', { time: expiresLabel })}
          </p>
        </div>
      </div>

      <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-2 text-[12px] text-ink-muted">
        {link.url}
      </code>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={copy} iconLeft={<Copy size={14} aria-hidden />}>
          {t('parents.copy')}
        </Button>
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] font-medium text-ink shadow-subtle transition-colors hover:bg-surface-muted"
        >
          <ExternalLink size={14} aria-hidden />
          {t('parents.openTelegram')}
        </a>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('common.close')}
        </Button>
      </div>

      {watching ? (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
          <Loader2 size={13} aria-hidden className="animate-spin" />
          {t('parents.waitingStart')}
        </p>
      ) : (
        <Chip tone="outline">{t('parents.waitingStopped')}</Chip>
      )}
    </div>
  );
}
