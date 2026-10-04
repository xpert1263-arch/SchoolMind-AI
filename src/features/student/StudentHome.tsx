import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock3,
  DoorClosed,
  ScrollText,
  Sunrise,
} from 'lucide-react';
import type { HomeworkItem } from '@/data/types';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { dayPart, formatLongDate, todayISO } from '@/lib/dates';
import { dayLabel, dueLabel } from '@/lib/labels';
import {
  useAnnouncements,
  useCurrentStudent,
  useStudentHomework,
  useStudentMetrics,
  useStudentTests,
  useStudentToday,
  useTodayPriorities,
} from '@/state/selectors';
import { useApp } from '@/state/store';
import { EmptyState } from '@/components/ui/Feedback';
import { Metric, MetricStrip } from '@/components/ui/Metric';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { SubjectDot } from '@/components/ui/Status';
import { AnnouncementRow } from '@/components/school/AnnouncementRow';
import { HomeworkDetail } from '@/components/school/HomeworkDetail';
import { HomeworkRow } from '@/components/school/HomeworkRow';
import { LessonRow } from '@/components/school/LessonRow';
import { PulseCard } from './pulse/PulseCard';

export function StudentHome() {
  const { t, text, locale } = useI18n();
  const { student } = useCurrentStudent();
  const { toggleAssignmentDone } = useApp();
  const metrics = useStudentMetrics();
  const today = useStudentToday();
  const priorities = useTodayPriorities();
  const homework = useStudentHomework();
  const tests = useStudentTests();
  const announcements = useAnnouncements(3);
  const [detail, setDetail] = useState<HomeworkItem | null>(null);

  const upcoming = [...homework.filter((i) => !i.completed && i.daysLeft > 0), ...tests]
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="flex items-center gap-1.5 text-[13px] text-ink-subtle">
          <CalendarDays size={14} aria-hidden />
          {formatLongDate(todayISO(), locale)}
        </p>
        <h1 className="mt-1.5 text-[24px] font-semibold leading-tight text-ink sm:text-[28px]">
          {t(`greeting.${dayPart()}`)}, {student.firstName}.
        </h1>
      </header>

      {/* A live ClassPulse belongs where the pupil already is, not
          behind another navigation item. Renders nothing when there
          is none. */}
      <PulseCard />

      <MetricStrip>
        <Metric
          label={t('student.home.lessonsToday')}
          value={metrics.lessonsToday}
          icon={<CalendarDays size={13} aria-hidden />}
        />
        <Metric
          label={t('student.home.homeworkDue')}
          value={metrics.dueCount}
          emphasis={metrics.dueCount > 0 ? 'warn' : 'none'}
          icon={<BookOpenCheck size={13} aria-hidden />}
        />
        <Metric
          label={t('student.home.upcomingTests')}
          value={metrics.testCount}
          icon={<ScrollText size={13} aria-hidden />}
        />
        <Metric
          label={t('student.home.completed')}
          value={t('common.of', { done: metrics.completedCount, total: metrics.totalCount })}
          emphasis="accent"
          icon={<CheckCircle2 size={13} aria-hidden />}
        />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-7">
          <NextLessonBlock />

          <Section
            title={t('student.home.priorities')}
            hint={t('student.home.prioritiesHint')}
            action={
              <Link
                to="/student/homework"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
              >
                {t('student.home.openHomework')}
                <ArrowRight size={14} aria-hidden />
              </Link>
            }
          >
            {priorities.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={17} aria-hidden />}
                title={t('student.home.prioritiesEmpty')}
                body={t('student.home.prioritiesEmptyHint')}
              />
            ) : (
              <Panel>
                <Rows>
                  {priorities.map((item) => (
                    <HomeworkRow
                      key={item.assignment.id}
                      item={item}
                      onToggle={toggleAssignmentDone}
                      onOpen={setDetail}
                    />
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>

          <Section title={t('student.home.todaySchedule')}>
            {today.lessons.length === 0 ? (
              <EmptyState
                icon={<CircleSlash size={17} aria-hidden />}
                title={t('student.home.noLessonsToday')}
                body={t('student.home.noLessonsTodayHint')}
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
        </div>

        <div className="flex flex-col gap-7">
          <Section title={t('student.home.upcoming')}>
            {upcoming.length === 0 ? (
              <EmptyState
                dense
                icon={<CalendarCheck2 size={16} aria-hidden />}
                title={t('student.home.upcomingEmpty')}
              />
            ) : (
              <Panel>
                <Rows>
                  {upcoming.map((item) => (
                    <li key={item.assignment.id} className="flex items-start gap-3 px-4 py-2.5">
                      <SubjectDot subject={item.subject} size={8} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-ink">
                          {text(item.assignment.title)}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-ink-subtle">
                          {text(item.subject.name)} ·{' '}
                          {item.assignment.kind === 'test' ? t('kind.test') : t('kind.homework')}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-[12px] font-medium text-ink-muted">
                        {dueLabel(item.assignment.dueDate, t, locale)}
                      </span>
                    </li>
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>

          <Section title={t('student.home.announcements')}>
            {announcements.length === 0 ? (
              <EmptyState dense title={t('student.home.announcementsEmpty')} />
            ) : (
              <Panel>
                <Rows>
                  {announcements.map((item) => (
                    <AnnouncementRow key={item.id} item={item} />
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>
        </div>
      </div>

      <HomeworkDetail item={detail} onClose={() => setDetail(null)} onToggle={toggleAssignmentDone} />
    </div>
  );
}

/** The single most useful thing on the screen: what happens next. */
function NextLessonBlock() {
  const { t, text, locale } = useI18n();
  const today = useStudentToday();
  const next = today.nextLesson;

  if (!next) {
    return (
      <Panel className="flex flex-col gap-1 px-5 py-4">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <Sunrise size={15} aria-hidden className="text-accent-text" />
          {t('student.home.lessonsDone')}
        </p>
        <p className="text-[13px] text-ink-subtle">
          {today.nextTeachingDay
            ? t('student.home.lessonsDoneHint', { day: dayLabel(today.nextTeachingDay, t, locale) })
            : t('student.home.noLessonsTodayHint')}
        </p>
      </Panel>
    );
  }

  const isNow = next.lesson.id === today.currentLessonId;

  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 bg-accent-soft/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">
            {isNow ? t('student.myDay.now') : t('student.home.nextLesson')}
          </p>
          <p className="mt-1.5 flex items-center gap-2 text-[20px] font-semibold leading-tight text-ink">
            <SubjectDot subject={next.subject} size={9} />
            {text(next.subject.name)}
          </p>
          <p className="mt-1.5 text-[13px] text-ink-muted">{fullName(next.teacher)}</p>
        </div>

        <div className="flex items-center gap-5 sm:flex-col sm:items-end sm:gap-1.5">
          <span
            data-numeric
            className="flex items-center gap-1.5 text-[20px] font-semibold tabular-nums text-ink"
          >
            <Clock3 size={15} aria-hidden className="text-ink-subtle" />
            {next.slot.start}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
            <DoorClosed size={13} aria-hidden />
            {t('common.roomShort', { room: next.lesson.room })}
          </span>
        </div>
      </div>
    </Panel>
  );
}
