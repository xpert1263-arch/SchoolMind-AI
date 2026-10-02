import { DoorClosed } from 'lucide-react';
import type { ScheduledLesson } from '@/data/types';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { SubjectDot } from '@/components/ui/Status';

export type LessonState = 'past' | 'current' | 'upcoming';

/** Timeline row: time rail on the left, lesson detail on the right. */
export function LessonRow({
  entry,
  state = 'upcoming',
  showTeacher = true,
  trailing,
}: {
  entry: ScheduledLesson;
  state?: LessonState;
  showTeacher?: boolean;
  trailing?: React.ReactNode;
}) {
  const { t, text } = useI18n();
  const { slot, subject, teacher, lesson } = entry;

  return (
    <li
      className={cn(
        'relative flex items-center gap-3.5 px-4 py-2.5 sm:px-5',
        state === 'past' && 'opacity-55',
        state === 'current' && 'bg-accent-soft/60',
      )}
    >
      {state === 'current' ? (
        <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />
      ) : null}

      <div className="flex w-[52px] shrink-0 flex-col">
        <span data-numeric className="text-[13px] font-semibold tabular-nums text-ink">
          {slot.start}
        </span>
        <span data-numeric className="text-[11px] tabular-nums text-ink-subtle">
          {slot.end}
        </span>
      </div>

      <SubjectDot subject={subject} size={8} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-ink">{text(subject.name)}</p>
        <p className="mt-0.5 flex items-center gap-2 truncate text-[12px] text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <DoorClosed size={11} aria-hidden />
            {t('common.roomShort', { room: lesson.room })}
          </span>
          {showTeacher ? <span className="truncate">{fullName(teacher)}</span> : null}
        </p>
      </div>

      {state === 'current' ? (
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-2xs font-semibold text-accent-contrast">
          {t('student.myDay.now')}
        </span>
      ) : null}
      {trailing}
    </li>
  );
}
