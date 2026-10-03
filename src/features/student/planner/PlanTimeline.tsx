import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Check,
  ChevronsUp,
  Coffee,
  Equal,
  Minus,
  Sparkles,
} from 'lucide-react';
import { subjectById } from '@/data/queries';
import type { ID } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { minutesOf } from '@/lib/dates';
import type { PlanItem, PlanItemType, Priority, StudyPlan } from '@/lib/planner/types';
import { SubjectDot } from '@/components/ui/Status';
import { useAllAssignments } from '@/state/selectors';

/* ------------------------------------------------------------------
   The plan as a timeline.

   Deliberately one continuous rail rather than a stack of cards: the
   evening reads as a sequence, and a break looks like a gap in the
   work rather than another box of equal weight.

   Priority is never colour alone — each level carries an icon and a
   word.
   ------------------------------------------------------------------ */

const PRIORITY_ICON: Record<Priority, typeof ChevronsUp> = {
  high: ChevronsUp,
  medium: Equal,
  low: Minus,
};

const PRIORITY_TONE: Record<Priority, string> = {
  high: 'text-danger-text',
  medium: 'text-ink-muted',
  low: 'text-ink-subtle',
};

const PRIORITY_KEY: Record<Priority, TranslationKey> = {
  high: 'planner.priorityHigh',
  medium: 'planner.priorityMedium',
  low: 'planner.priorityLow',
};

const TYPE_KEY: Record<PlanItemType, TranslationKey> = {
  homework: 'planner.typeHomework',
  test: 'planner.typeTest',
  review: 'planner.typeReview',
  break: 'planner.typeBreak',
};

function endTime(item: PlanItem): string {
  const total = (minutesOf(item.startTime) + item.durationMinutes) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

export function PlanTimeline({
  plan,
  completedIds,
  onToggle,
}: {
  plan: StudyPlan;
  completedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <ol className="flex flex-col">
      {plan.items.map((item, index) => (
        <motion.li
          key={item.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: Math.min(index * 0.035, 0.3), ease: [0.32, 0.72, 0, 1] }}
          className="min-w-0"
        >
          <TimelineRow
            item={item}
            last={index === plan.items.length - 1}
            done={completedIds.includes(item.id)}
            onToggle={onToggle}
          />
        </motion.li>
      ))}
    </ol>
  );
}

function TimelineRow({
  item,
  last,
  done,
  onToggle,
}: {
  item: PlanItem;
  last: boolean;
  done: boolean;
  onToggle: (id: string) => void;
}) {
  const { t, text } = useI18n();
  const assignments = useAllAssignments();
  const isBreak = item.type === 'break';
  const subject = item.subjectId ? safeSubject(item.subjectId) : null;
  const linked = item.sourceAssignmentId
    ? assignments.some((a) => a.id === item.sourceAssignmentId)
    : false;
  const PriorityIcon = PRIORITY_ICON[item.priority];

  return (
    <div className="flex min-w-0 gap-3 sm:gap-4">
      {/* ---- time rail ---- */}
      <div className="flex w-[52px] shrink-0 flex-col items-end pt-0.5 sm:w-[68px]">
        <span data-numeric className="text-[13px] font-semibold tabular-nums text-ink">
          {item.startTime}
        </span>
        <span data-numeric className="text-[11.5px] tabular-nums text-ink-subtle">
          {endTime(item)}
        </span>
      </div>

      {/* ---- spine ---- */}
      <div className="flex w-3 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2',
            isBreak
              ? 'border-line-strong bg-canvas'
              : done
                ? 'border-success bg-success'
                : 'border-accent bg-canvas',
          )}
        />
        {!last ? <span aria-hidden className="w-px flex-1 bg-line" /> : null}
      </div>

      {/* ---- body ---- */}
      <div className={cn('min-w-0 flex-1', last ? 'pb-0' : 'pb-5')}>
        {isBreak ? (
          <p className="flex items-center gap-1.5 pt-0.5 text-[13px] text-ink-subtle">
            <Coffee size={13} aria-hidden />
            {item.title || t('planner.typeBreak')}
            <span data-numeric className="tabular-nums">
              · {t('planner.minutesShort', { n: item.durationMinutes })}
            </span>
          </p>
        ) : (
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {subject ? <SubjectDot subject={subject} /> : null}
              <span className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
                {subject ? text(subject.name) : t(TYPE_KEY[item.type])}
              </span>
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11.5px] font-medium',
                  PRIORITY_TONE[item.priority],
                )}
                title={t('planner.priorityLabel')}
              >
                <PriorityIcon size={12} aria-hidden />
                {t(PRIORITY_KEY[item.priority])}
              </span>
              {item.sourceAssignmentId === null ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent-text">
                  <Sparkles size={10} aria-hidden />
                  {t('planner.optional')}
                </span>
              ) : null}
            </div>

            <p
              className={cn(
                'mt-1 text-[14.5px] font-medium leading-snug text-ink',
                done && 'text-ink-subtle line-through',
              )}
            >
              {item.title}
            </p>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-subtle">
              <span data-numeric className="tabular-nums">
                {t('planner.minutesShort', { n: item.durationMinutes })}
              </span>
              <span aria-hidden>·</span>
              <span>{t(TYPE_KEY[item.type])}</span>
            </p>

            {item.reason ? (
              <p className="mt-1.5 border-l-2 border-line pl-2.5 text-[13px] leading-relaxed text-ink-muted">
                {item.reason}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                aria-pressed={done}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                  done
                    ? 'border-success-line bg-success-soft text-success-text'
                    : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                <Check size={12} aria-hidden />
                {done ? t('planner.markUndone') : t('planner.markDone')}
              </button>

              {linked ? (
                <Link
                  to="/student/homework"
                  className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[12px] font-medium text-ink-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-ink"
                >
                  {t('planner.openHomework')}
                  <ArrowUpRight size={12} aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A plan may name a subject that is no longer in the dataset. */
function safeSubject(id: ID) {
  try {
    return subjectById(id);
  } catch {
    return null;
  }
}
