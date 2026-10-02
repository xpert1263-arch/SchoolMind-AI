import { useMemo, useState } from 'react';
import { CircleSlash } from 'lucide-react';
import { lessonSlots } from '@/data/school';
import { lessonsOfClass } from '@/data/queries';
import type { ScheduledLesson } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { currentTeachingWeek, formatDate, todayISO, weekdayOfISO } from '@/lib/dates';
import { weekdayLabel } from '@/lib/labels';
import { useCurrentStudent } from '@/state/selectors';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, Rows } from '@/components/ui/Surface';
import { LessonRow } from '@/components/school/LessonRow';

/**
 * Desktop gets the week at a glance; narrow screens get one day at a
 * time, because a six-column grid on a phone is unreadable.
 */
export function Schedule() {
  const { t, locale } = useI18n();
  const { schoolClass } = useCurrentStudent();
  const week = useMemo(currentTeachingWeek, []);
  const today = todayISO();

  const [selectedDate, setSelectedDate] = useState(() => (week.includes(today) ? today : week[0]));

  const grid = useMemo(
    () =>
      week.map((date) => ({
        date,
        lessons: lessonsOfClass(schoolClass.id, weekdayOfISO(date)),
      })),
    [week, schoolClass.id],
  );

  const selectedDay = grid.find((d) => d.date === selectedDate) ?? grid[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('student.schedule.title')}
        subtitle={t('student.schedule.subtitle', { class: schoolClass.name })}
        eyebrow={t('student.schedule.weekOf', {
          from: formatDate(week[0], locale, { day: 'numeric', month: 'short' }),
          to: formatDate(week[week.length - 1], locale, { day: 'numeric', month: 'short' }),
        })}
      />

      {/* Weekly grid — large screens */}
      <Panel className="hidden overflow-hidden lg:block">
        <div className="grid grid-cols-[68px_repeat(6,minmax(0,1fr))] border-b border-line bg-surface-muted/60">
          <div aria-hidden />
          {grid.map((day) => {
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={cn(
                  'border-l border-line px-3 py-2.5 text-center',
                  isToday && 'bg-accent-soft/70',
                )}
              >
                <p
                  className={cn(
                    'text-[12.5px] font-semibold capitalize',
                    isToday ? 'text-accent-text' : 'text-ink',
                  )}
                >
                  {weekdayLabel(day.date, locale, true)}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-subtle">
                  {formatDate(day.date, locale, { day: 'numeric', month: 'short' })}
                </p>
              </div>
            );
          })}
        </div>

        <div>
          {lessonSlots.map((slot) => (
            <div
              key={slot.index}
              className="grid grid-cols-[68px_repeat(6,minmax(0,1fr))] border-b border-line last:border-b-0"
            >
              <div className="flex flex-col justify-center px-3 py-2">
                <span data-numeric className="text-[12px] font-semibold tabular-nums text-ink">
                  {slot.start}
                </span>
                <span data-numeric className="text-[11px] tabular-nums text-ink-subtle">
                  {slot.end}
                </span>
              </div>
              {grid.map((day) => (
                <ScheduleCell
                  key={`${day.date}-${slot.index}`}
                  entry={day.lessons.find((l) => l.slot.index === slot.index)}
                  isToday={day.date === today}
                />
              ))}
            </div>
          ))}
        </div>
      </Panel>

      {/* Day view — small screens */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div
          role="tablist"
          aria-label={t('student.schedule.pickDay')}
          className="sm-scroll-hidden -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
        >
          {grid.map((day) => {
            const active = day.date === selectedDate;
            const isToday = day.date === today;
            return (
              <button
                key={day.date}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedDate(day.date)}
                className={cn(
                  'flex min-w-[58px] flex-1 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 transition-colors',
                  active
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong',
                )}
              >
                <span className="text-[11.5px] font-semibold capitalize">
                  {weekdayLabel(day.date, locale, true)}
                </span>
                <span data-numeric className="text-[15px] font-semibold tabular-nums">
                  {formatDate(day.date, locale, { day: 'numeric' })}
                </span>
                <span
                  className={cn(
                    'h-1 w-1 rounded-full',
                    isToday ? 'bg-accent' : 'bg-transparent',
                  )}
                  aria-hidden
                />
              </button>
            );
          })}
        </div>

        {selectedDay.lessons.length === 0 ? (
          <EmptyState
            icon={<CircleSlash size={17} aria-hidden />}
            title={t('student.schedule.noLessons')}
            body={t('student.home.noLessonsTodayHint')}
          />
        ) : (
          <Panel>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-[13px] font-medium capitalize text-ink">
                {weekdayLabel(selectedDay.date, locale)}
              </p>
              <p className="text-[12px] text-ink-subtle">
                {t('student.schedule.lessonsCount', { n: selectedDay.lessons.length })}
              </p>
            </div>
            <Rows>
              {selectedDay.lessons.map((entry) => (
                <LessonRow key={entry.lesson.id} entry={entry} />
              ))}
            </Rows>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ScheduleCell({ entry, isToday }: { entry?: ScheduledLesson; isToday: boolean }) {
  const { t, text } = useI18n();

  if (!entry) {
    return (
      <div
        className={cn(
          'flex items-center justify-center border-l border-line px-2 py-2',
          isToday && 'bg-accent-soft/35',
        )}
      >
        <span className="text-[12px] text-ink-subtle/60" aria-label={t('student.schedule.free')}>
          —
        </span>
      </div>
    );
  }

  return (
    <div className={cn('border-l border-line p-1.5', isToday && 'bg-accent-soft/35')}>
      <div
        data-hue
        style={
          {
            '--hue': entry.subject.hue,
            background: 'var(--subject-bg)',
            borderColor: 'var(--subject-line)',
          } as React.CSSProperties
        }
        className="h-full rounded-md border px-2.5 py-2"
      >
        <p
          className="truncate text-[12.5px] font-semibold"
          style={{ color: 'var(--subject-fg)' }}
          title={text(entry.subject.name)}
        >
          {text(entry.subject.name)}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-ink-subtle">
          {t('common.roomShort', { room: entry.lesson.room })} · {entry.teacher.lastName}
        </p>
      </div>
    </div>
  );
}
