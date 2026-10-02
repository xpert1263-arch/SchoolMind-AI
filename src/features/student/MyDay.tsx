import { useState } from 'react';
import { CalendarCheck2, Check, CircleSlash, Sparkles, Timer } from 'lucide-react';
import type { HomeworkItem } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { formatLongDate, todayISO } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { dayLabel } from '@/lib/labels';
import {
  usePersonalTasks,
  useStudentHomework,
  useStudentTests,
  useStudentToday,
} from '@/state/selectors';
import { useApp } from '@/state/store';
import { EmptyState, FuturePanel } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { HomeworkDetail } from '@/components/school/HomeworkDetail';
import { HomeworkRow } from '@/components/school/HomeworkRow';
import { LessonRow } from '@/components/school/LessonRow';

/** A focused view of one day — lessons first, then everything after school. */
export function MyDay() {
  const { t, text, locale } = useI18n();
  const { toggleAssignmentDone, toggleTaskDone } = useApp();
  const today = useStudentToday();
  const homework = useStudentHomework();
  const tests = useStudentTests();
  const tasks = usePersonalTasks();
  const [detail, setDetail] = useState<HomeworkItem | null>(null);

  const dueToday = homework.filter((i) => !i.completed && i.daysLeft <= 1);
  const imminentTests = tests.filter((i) => i.daysLeft <= 2);
  const openTasks = tasks.filter((row) => !row.completed);
  const workMinutes = openTasks.reduce((sum, row) => sum + row.task.minutes, 0) + dueToday.length * 25;
  const nothingAfterSchool =
    dueToday.length === 0 && imminentTests.length === 0 && openTasks.length === 0;

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow={formatLongDate(todayISO(), locale)}
        title={t('student.myDay.title')}
        subtitle={t('student.myDay.subtitle')}
      />

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title={t('student.myDay.lessonsHeading')}>
          {today.lessons.length === 0 ? (
            <EmptyState
              icon={<CircleSlash size={17} aria-hidden />}
              title={t('student.home.noLessonsToday')}
              body={
                today.nextTeachingDay
                  ? t('student.home.lessonsDoneHint', {
                      day: dayLabel(today.nextTeachingDay, t, locale),
                    })
                  : t('student.home.noLessonsTodayHint')
              }
            />
          ) : (
            <Panel>
              <Rows>
                {today.lessons.map((entry) => (
                  <LessonRow
                    key={entry.lesson.id}
                    entry={entry}
                    state={
                      entry.lesson.id === today.currentLessonId
                        ? 'current'
                        : today.nextLesson && entry.slot.index < today.nextLesson.slot.index
                          ? 'past'
                          : 'upcoming'
                    }
                  />
                ))}
              </Rows>
            </Panel>
          )}
        </Section>

        <div className="flex flex-col gap-7">
          <Section
            title={t('student.myDay.afterSchool')}
            hint={
              nothingAfterSchool ? undefined : t('student.myDay.afterSchoolHint', { minutes: workMinutes })
            }
          >
            {nothingAfterSchool ? (
              <EmptyState
                icon={<CalendarCheck2 size={17} aria-hidden />}
                title={t('student.myDay.nothingAfterSchool')}
                body={t('student.myDay.nothingAfterSchoolHint')}
              />
            ) : (
              <Panel>
                <Rows>
                  {dueToday.map((item) => (
                    <HomeworkRow
                      key={item.assignment.id}
                      item={item}
                      onToggle={toggleAssignmentDone}
                      onOpen={setDetail}
                    />
                  ))}
                  {imminentTests.map((item) => (
                    <HomeworkRow key={item.assignment.id} item={item} onOpen={setDetail} />
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>

          <Section title={t('student.myDay.personalTasks')}>
            {tasks.length === 0 ? (
              <EmptyState dense title={t('student.myDay.noPersonalTasks')} />
            ) : (
              <Panel>
                <Rows>
                  {tasks.map(({ task, completed }) => (
                    <li key={task.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <button
                        type="button"
                        onClick={() => toggleTaskDone(task.id)}
                        aria-pressed={completed}
                        aria-label={t('a11y.toggleHomework', { title: text(task.title) })}
                        className={cn(
                          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors',
                          completed
                            ? 'border-success bg-success text-white'
                            : 'border-line-strong bg-surface hover:border-accent',
                        )}
                      >
                        {completed ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                      </button>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[13.5px]',
                          completed ? 'text-ink-subtle line-through' : 'text-ink',
                        )}
                      >
                        {text(task.title)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-subtle">
                        <Timer size={12} aria-hidden />
                        {task.minutes} {t('common.minutesShort')}
                      </span>
                    </li>
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>
        </div>
      </div>

      <FuturePanel
        title={t('student.myDay.plannerTitle')}
        body={t('student.myDay.plannerBody')}
        version="v1.3"
        icon={<Sparkles size={16} aria-hidden />}
      />

      <HomeworkDetail item={detail} onClose={() => setDetail(null)} onToggle={toggleAssignmentDone} />
    </div>
  );
}
