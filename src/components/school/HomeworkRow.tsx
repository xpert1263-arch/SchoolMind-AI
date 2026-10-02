import { motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import type { HomeworkItem } from '@/data/types';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { dueLabel } from '@/lib/labels';
import { StatusPill, SubjectChip } from '@/components/ui/Status';

/** One row of work. Checkbox, title, subject, deadline, status —
 *  the same row shape on Home, My Day and Homework. */
export function HomeworkRow({
  item,
  onToggle,
  onOpen,
  showTeacher = false,
}: {
  item: HomeworkItem;
  onToggle?: (id: string) => void;
  onOpen?: (item: HomeworkItem) => void;
  showTeacher?: boolean;
}) {
  const { t, text, locale } = useI18n();
  const { assignment, subject, teacher, completed, status } = item;
  const title = text(assignment.title);
  const isTest = assignment.kind === 'test';

  return (
    <li className="group relative flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted/60 sm:px-5">
      {onToggle && !isTest ? (
        <button
          type="button"
          onClick={() => onToggle(assignment.id)}
          aria-pressed={completed}
          aria-label={t('a11y.toggleHomework', { title })}
          className={cn(
            'mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors',
            completed
              ? 'border-success bg-success text-white'
              : 'border-line-strong bg-surface hover:border-accent',
          )}
        >
          {completed ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 26 }}
              className="flex"
            >
              <Check size={12} strokeWidth={3} aria-hidden />
            </motion.span>
          ) : null}
        </button>
      ) : (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={cn(
              'min-w-0 text-[14px] font-medium leading-snug',
              completed ? 'text-ink-subtle line-through decoration-ink-subtle/50' : 'text-ink',
            )}
          >
            {title}
          </p>
          {assignment.origin === 'teacher' ? (
            <span className="rounded bg-accent-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent-text">
              {t('student.homework.newBadge')}
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-subtle">
          <SubjectChip subject={subject} />
          <span>{dueLabel(assignment.dueDate, t, locale)}</span>
          {showTeacher ? (
            <span className="truncate">{t('student.homework.assignedBy', { teacher: fullName(teacher) })}</span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <StatusPill status={status} label={isTest ? t('kind.test') : undefined} />
        {onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(item)}
            aria-label={`${title} — ${t('common.details')}`}
            className="rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  );
}
