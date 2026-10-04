import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  MessageSquarePlus,
  Phone,
  Send,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import type { Student } from '@/data/types';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { formatDate, formatTime } from '@/lib/dates';
import type {
  DeliveryOutcome,
  DeliveryStatus,
  ParentRecord,
  ParentRelation,
} from '@/lib/parents/types';
import { useParentMessaging, useParents } from '@/lib/parents/useParents';
import { useMessageDraft } from '@/lib/teacherAi/useMessageDraft';
import { Button } from '@/components/ui/Button';
import { Field, TextArea, TextInput } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Overlay } from '@/components/ui/Overlay';
import { Chip } from '@/components/ui/Status';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------
   The teacher's view of a pupil's family, inside the student drawer.

   What a teacher may do here is narrow on purpose: read the contact
   details the pupil entered, and write a message. They cannot edit
   the family's details and they never see a Telegram chat id — the
   browser is not told one, so the Send button cannot aim anywhere
   except at a relation the server resolves itself.

   The delivery result is reported exactly as Telegram gave it. A
   parent who never pressed Start shows as not connected, a parent who
   blocked the bot shows as blocked, and an outage shows as an outage.
   Nothing here ever shows a tick for a message that did not go.
   ------------------------------------------------------------------ */

const RELATION_LABEL: Record<ParentRelation, TranslationKey> = {
  father: 'parents.father',
  mother: 'parents.mother',
};

const WRITE_LABEL: Record<ParentRelation, TranslationKey> = {
  father: 'parents.writeFather',
  mother: 'parents.writeMother',
};

const DELIVERY_LABEL: Record<DeliveryStatus, TranslationKey> = {
  sent: 'parents.deliverySent',
  not_connected: 'parents.deliveryNotConnected',
  not_configured: 'parents.deliveryNotConfigured',
  blocked: 'parents.deliveryBlocked',
  failed: 'parents.deliveryFailed',
};

export function ParentContact({ student }: { student: Student }) {
  const { t, locale } = useI18n();
  const { parents, telegram, loading } = useParents(student.id);
  const messaging = useParentMessaging(student.id);
  const [composing, setComposing] = useState<ParentRelation[] | null>(null);

  const named = parents.filter((entry) => entry.fullName.trim().length > 0);
  const connected = parents.filter((entry) => entry.telegramLinked);

  return (
    <Section dense title={t('parents.teacherTitle')}>
      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="flex items-center gap-2 px-1 text-[12.5px] text-ink-subtle">
            <Loader2 size={13} aria-hidden className="animate-spin" />
            {t('common.loading')}
          </p>
        ) : named.length === 0 ? (
          <EmptyState
            dense
            icon={<Users size={16} aria-hidden />}
            title={t('parents.teacherEmptyTitle')}
            body={t('parents.teacherEmptyBody')}
          />
        ) : (
          <Panel>
            <Rows>
              {named.map((record) => (
                <li key={record.relation} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
                    <UserRound size={14} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink">{record.fullName}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-subtle">
                      <span>{t(RELATION_LABEL[record.relation])}</span>
                      {record.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone size={11} aria-hidden />
                          {record.phone}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <StatusChip record={record} />
                </li>
              ))}
            </Rows>
          </Panel>
        )}

        {named.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {named.map((record) => (
              <Button
                key={record.relation}
                size="sm"
                disabled={!record.telegramLinked}
                onClick={() => setComposing([record.relation])}
                iconLeft={<Send size={13} aria-hidden />}
              >
                {t(WRITE_LABEL[record.relation])}
              </Button>
            ))}
            {connected.length === 2 ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => setComposing(['father', 'mother'])}
                iconLeft={<Send size={13} aria-hidden />}
              >
                {t('parents.writeBoth')}
              </Button>
            ) : null}
          </div>
        ) : null}

        {named.length > 0 && connected.length === 0 ? (
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-subtle">
            <AlertTriangle size={12} aria-hidden className="mt-0.5 shrink-0" />
            {telegram?.configured
              ? t('parents.noneConnected')
              : t('parents.offShort')}
          </p>
        ) : null}

        {messaging.history.length > 0 ? (
          <div className="mt-1 flex flex-col gap-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('parents.historyTitle')}
            </p>
            <ul className="flex flex-col gap-2">
              {messaging.history.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-line bg-surface-muted/50 px-3 py-2.5"
                >
                  <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-ink">
                    {row.text}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-ink-subtle">
                    <span>
                      {formatDate(row.dateISO ?? row.createdAt.slice(0, 10), locale)} · {formatTime(row.createdAt)}
                    </span>
                    {row.delivery.map((outcome) => (
                      <DeliveryChip key={outcome.relation} outcome={outcome} />
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {composing ? (
        <Composer
          student={student}
          recipients={composing}
          messaging={messaging}
          onClose={() => {
            messaging.reset();
            setComposing(null);
          }}
        />
      ) : null}
    </Section>
  );
}

function StatusChip({ record }: { record: ParentRecord }) {
  const { t } = useI18n();
  if (record.telegramLinked) {
    return (
      <span className="shrink-0 rounded-full border border-success-line bg-success-soft px-2 py-0.5 text-2xs font-medium text-success-text">
        {t('parents.statusConnected')}
      </span>
    );
  }
  if (record.telegramStatus === 'pending') {
    return <Chip tone="outline">{t('parents.statusPending')}</Chip>;
  }
  return <Chip>{t('parents.statusUnlinked')}</Chip>;
}

function DeliveryChip({ outcome }: { outcome: DeliveryOutcome }) {
  const { t } = useI18n();
  const sent = outcome.status === 'sent';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium',
        sent ? 'bg-success-soft text-success-text' : 'bg-warn-soft text-warn-text',
      )}
    >
      {sent ? <Check size={10} aria-hidden /> : <AlertTriangle size={10} aria-hidden />}
      {t(RELATION_LABEL[outcome.relation])}: {t(DELIVERY_LABEL[outcome.status])}
    </span>
  );
}

/* ---- the composer ---------------------------------------------------- */

function Composer({
  student,
  recipients,
  messaging,
  onClose,
}: {
  student: Student;
  recipients: ParentRelation[];
  messaging: ReturnType<typeof useParentMessaging>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [intent, setIntent] = useState('');
  const drafting = useMessageDraft();

  const recipientLabel = useMemo(
    () => recipients.map((relation) => t(RELATION_LABEL[relation])).join(' + '),
    [recipients, t],
  );

  const done = messaging.delivery !== null;

  return (
    <Overlay
      open
      onClose={onClose}
      title={t('parents.composerTitle', { name: fullName(student) })}
      description={recipientLabel}
    >
      <div className="flex flex-col gap-4">
        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-ink-muted">
              {messaging.duplicate ? t('parents.alreadySent') : t('parents.sendResult')}
            </p>
            <ul className="flex flex-col gap-2">
              {messaging.delivery?.map((outcome) => (
                <li
                  key={outcome.relation}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px]',
                    outcome.status === 'sent'
                      ? 'border-success-line bg-success-soft text-success-text'
                      : 'border-warn-line bg-warn-soft text-warn-text',
                  )}
                >
                  {outcome.status === 'sent' ? (
                    <Check size={14} aria-hidden className="shrink-0" />
                  ) : (
                    <AlertTriangle size={14} aria-hidden className="shrink-0" />
                  )}
                  <span className="font-medium">{t(RELATION_LABEL[outcome.relation])}</span>
                  <span>·</span>
                  <span>{t(DELIVERY_LABEL[outcome.status])}</span>
                </li>
              ))}
            </ul>
            <div>
              <Button onClick={onClose}>{t('common.close')}</Button>
            </div>
          </div>
        ) : (
          <>
            <Field label={t('parents.intent')} optional hint={t('parents.intentHint')}>
              <TextInput
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder={t('parents.intentPlaceholder')}
                maxLength={160}
              />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                disabled={drafting.busy}
                onClick={async () => {
                  const drafted = await drafting.draft({
                    studentName: fullName(student),
                    recipientLabel,
                    intent,
                  });
                  if (drafted) setText(drafted);
                }}
                iconLeft={
                  drafting.busy ? (
                    <Loader2 size={13} aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles size={13} aria-hidden />
                  )
                }
              >
                {t('parents.draftWithAi')}
              </Button>
              <span className="text-[12px] text-ink-subtle">{t('parents.draftNote')}</span>
            </div>

            {drafting.errorText ? (
              <p className="text-[12.5px] text-warn-text">{drafting.errorText}</p>
            ) : null}

            <Field label={t('parents.messageLabel')} hint={t('parents.messageHint')}>
              <TextArea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('parents.messagePlaceholder')}
                maxLength={900}
              />
            </Field>

            {messaging.errorText ? (
              <p className="text-[12.5px] text-danger-text">{messaging.errorText}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                disabled={messaging.sending || !text.trim()}
                onClick={() => messaging.send(recipients, text)}
                iconLeft={
                  messaging.sending ? (
                    <Loader2 size={14} aria-hidden className="animate-spin" />
                  ) : (
                    <Send size={14} aria-hidden />
                  )
                }
              >
                {messaging.sending ? t('parents.sending') : t('parents.send')}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </div>

            <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-subtle">
              <MessageSquarePlus size={12} aria-hidden className="mt-0.5 shrink-0" />
              {t('parents.sendNote')}
            </p>
          </>
        )}
      </div>
    </Overlay>
  );
}
