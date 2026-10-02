import { useMemo, useState } from 'react';
import { BookOpenCheck, CheckCircle2, CalendarCheck2, Inbox } from 'lucide-react';
import type { HomeworkItem } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { useStudentHomework } from '@/state/selectors';
import { useApp } from '@/state/store';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Progress } from '@/components/ui/Display';
import { Panel, Rows } from '@/components/ui/Surface';
import { Segmented } from '@/components/ui/Segmented';
import { HomeworkDetail } from '@/components/school/HomeworkDetail';
import { HomeworkRow } from '@/components/school/HomeworkRow';

/* The buckets are mutually exclusive and mirror the status shown on each
   row: an overdue item is overdue, not "today". */
type Filter = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

export function Homework() {
  const { t } = useI18n();
  const { toggleAssignmentDone } = useApp();
  const items = useStudentHomework();
  const [filter, setFilter] = useState<Filter>('all');
  const [detail, setDetail] = useState<HomeworkItem | null>(null);

  const buckets = useMemo(
    () => ({
      all: items,
      overdue: items.filter((i) => !i.completed && i.daysLeft < 0),
      today: items.filter((i) => !i.completed && i.daysLeft === 0),
      upcoming: items.filter((i) => !i.completed && i.daysLeft > 0),
      completed: items.filter((i) => i.completed),
    }),
    [items],
  );

  const visible = buckets[filter];
  const doneCount = buckets.completed.length;

  const emptyCopy: Record<Filter, { title: string; body: string; icon: React.ReactNode }> = {
    all: {
      title: t('student.homework.emptyAll'),
      body: t('student.homework.emptyAllHint'),
      icon: <Inbox size={17} aria-hidden />,
    },
    overdue: {
      title: t('student.homework.emptyOverdue'),
      body: t('student.homework.emptyOverdueHint'),
      icon: <CheckCircle2 size={17} aria-hidden />,
    },
    today: {
      title: t('student.homework.emptyToday'),
      body: t('student.homework.emptyTodayHint'),
      icon: <CalendarCheck2 size={17} aria-hidden />,
    },
    upcoming: {
      title: t('student.homework.emptyUpcoming'),
      body: t('student.homework.emptyUpcomingHint'),
      icon: <BookOpenCheck size={17} aria-hidden />,
    },
    completed: {
      title: t('student.homework.emptyCompleted'),
      body: t('student.homework.emptyCompletedHint'),
      icon: <CheckCircle2 size={17} aria-hidden />,
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('student.homework.title')} subtitle={t('student.homework.subtitle')} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<Filter>
          ariaLabel={t('student.homework.title')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: t('student.homework.filterAll'), count: buckets.all.length },
            {
              value: 'overdue',
              label: t('student.homework.filterOverdue'),
              count: buckets.overdue.length,
            },
            { value: 'today', label: t('student.homework.filterToday'), count: buckets.today.length },
            {
              value: 'upcoming',
              label: t('student.homework.filterUpcoming'),
              count: buckets.upcoming.length,
            },
            {
              value: 'completed',
              label: t('student.homework.filterCompleted'),
              count: buckets.completed.length,
            },
          ]}
        />

        <div className="flex min-w-[180px] items-center gap-3 sm:max-w-[240px]">
          <span className="whitespace-nowrap text-[12.5px] text-ink-subtle">
            {t('student.homework.progress', { done: doneCount, total: items.length })}
          </span>
          <Progress
            value={doneCount}
            max={items.length || 1}
            label={t('student.homework.progress', { done: doneCount, total: items.length })}
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={emptyCopy[filter].icon}
          title={emptyCopy[filter].title}
          body={emptyCopy[filter].body}
        />
      ) : (
        <Panel>
          <Rows>
            {visible.map((item) => (
              <HomeworkRow
                key={item.assignment.id}
                item={item}
                onToggle={toggleAssignmentDone}
                onOpen={setDetail}
                showTeacher
              />
            ))}
          </Rows>
        </Panel>
      )}

      <HomeworkDetail item={detail} onClose={() => setDetail(null)} onToggle={toggleAssignmentDone} />
    </div>
  );
}
