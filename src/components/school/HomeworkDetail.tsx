import { useRef } from 'react';
import { CalendarClock, RotateCcw, User } from 'lucide-react';
import type { HomeworkItem } from '@/data/types';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { formatLongDate } from '@/lib/dates';
import { dueLabel } from '@/lib/labels';
import { Button } from '@/components/ui/Button';
import { Overlay } from '@/components/ui/Overlay';
import { StatusPill, SubjectChip } from '@/components/ui/Status';

export function HomeworkDetail({
  item,
  onClose,
  onToggle,
}: {
  item: HomeworkItem | null;
  onClose: () => void;
  onToggle?: (id: string) => void;
}) {
  const { t, text, locale } = useI18n();

  /* Hold the last item so the drawer can animate out after it closes. */
  const lastItem = useRef(item);
  if (item) lastItem.current = item;
  const shown = item ?? lastItem.current;
  if (!shown) return null;

  const { assignment, subject, teacher, completed, status } = shown;
  const isTest = assignment.kind === 'test';

  return (
    <Overlay
      open={item !== null}
      onClose={onClose}
      variant="drawer"
      title={text(assignment.title)}
      description={`${t(`kind.${assignment.kind}`)} · ${text(subject.name)}`}
      footer={
        onToggle && !isTest ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button
              variant={completed ? 'secondary' : 'primary'}
              onClick={() => onToggle(assignment.id)}
              iconLeft={completed ? <RotateCcw size={14} aria-hidden /> : undefined}
            >
              {completed ? t('student.homework.reopen') : t('student.homework.markDone')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={status} />
          <SubjectChip subject={subject} />
        </div>

        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line">
          <DetailRow
            icon={<CalendarClock size={14} aria-hidden />}
            label={t('common.deadline')}
            value={`${formatLongDate(assignment.dueDate, locale)} · ${dueLabel(assignment.dueDate, t, locale)}`}
          />
          <DetailRow
            icon={<User size={14} aria-hidden />}
            label={t('common.teacher')}
            value={fullName(teacher)}
          />
        </dl>

        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-ink">{t('common.description')}</h3>
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-muted">
            {text(assignment.description)}
          </p>
        </div>
      </div>
    </Overlay>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 bg-surface px-3.5 py-3">
      <span className="mt-0.5 text-ink-subtle">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11.5px] uppercase tracking-wide text-ink-subtle">{label}</dt>
        <dd className="mt-0.5 text-[13.5px] text-ink">{value}</dd>
      </div>
    </div>
  );
}
