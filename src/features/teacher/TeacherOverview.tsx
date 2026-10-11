import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CircleSlash,
  ClipboardList,
  DoorClosed,
  PlusCircle,
  Users,
} from 'lucide-react';
import { classById } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { dayPart, formatLongDate, formatTime, todayISO } from '@/lib/dates';
import { dayLabel, dueLabel } from '@/lib/labels';
import {
  useActivityFeed,
  useClassSnapshots,
  useCreatedTodayCount,
  useCurrentTeacher,
  useTeacherAssignments,
  useTeacherToday,
} from '@/state/selectors';
import { EmptyState } from '@/components/ui/Feedback';
import { Metric, MetricStrip } from '@/components/ui/Metric';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { SubjectDot } from '@/components/ui/Status';

export function TeacherOverview() {
  const { t, text, locale } = useI18n();
  const { teacher } = useCurrentTeacher();
  const today = useTeacherToday();
  const assignments = useTeacherAssignments();
  const snapshots = useClassSnapshots();
  const activity = useActivityFeed();
  const createdToday = useCreatedTodayCount();

  const activeAssignments = assignments.filter((a) => a.dueDate >= todayISO());
  const studentTotal = snapshots.reduce((sum, s) => sum + s.studentCount, 0);

  return (
    <div className="flex flex-col gap-7">
      <header>
        <p className="flex items-center gap-1.5 text-[13px] text-ink-subtle">
          <CalendarDays size={14} aria-hidden />
          {formatLongDate(todayISO(), locale)}
        </p>
        <h1 className="mt-1.5 text-[24px] font-semibold leading-tight text-ink sm:text-[28px]">
          {t(`greeting.${dayPart()}`)}, {teacher.firstName}.
        </h1>
      </header>

      <MetricStrip>
        <Metric
          label={t('teacher.overview.todayClasses')}
          value={today.lessons.length}
          icon={<CalendarDays size={13} aria-hidden />}
        />
        <Metric
          label={t('teacher.overview.activeAssignments')}
          value={activeAssignments.length}
          emphasis="accent"
          icon={<ClipboardList size={13} aria-hidden />}
        />
        <Metric
          label={t('teacher.overview.studentsCount')}
          value={studentTotal}
          icon={<Users size={13} aria-hidden />}
        />
        <Metric
          label={t('teacher.overview.createdToday')}
          value={createdToday}
          icon={<PlusCircle size={13} aria-hidden />}
        />
      </MetricStrip>

      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-7">
          <Section title={t('teacher.overview.todayClasses')}>
            {today.lessons.length === 0 ? (
              <EmptyState
                icon={<CircleSlash size={17} aria-hidden />}
                title={t('teacher.overview.noClassesToday')}
                body={
                  today.nextTeachingDay
                    ? t('teacher.overview.noClassesTodayHint', {
                        day: dayLabel(today.nextTeachingDay, t, locale),
                      })
                    : undefined
                }
              />
            ) : (
              <Panel>
                <Rows>
                  {today.lessons.map((entry) => {
                    const state =
                      entry.lesson.id === today.currentLessonId
                        ? 'current'
                        : today.nextLesson && entry.slot.index < today.nextLesson.slot.index
                          ? 'past'
                          : 'upcoming';
                    return (
                      <li
                        key={entry.lesson.id}
                        className={cn(
                          'relative flex items-center gap-3.5 px-4 py-3 sm:px-5',
                          state === 'past' && 'opacity-55',
                          state === 'current' && 'bg-accent-soft/60',
                        )}
                      >
                        {state === 'current' ? (
                          <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden />
                        ) : null}
                        <div className="flex w-[52px] shrink-0 flex-col">
                          <span data-numeric className="text-[13px] font-semibold tabular-nums text-ink">
                            {entry.slot.start}
                          </span>
                          <span data-numeric className="text-[11px] tabular-nums text-ink-subtle">
                            {entry.slot.end}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-md border border-line bg-surface-muted px-2 py-0.5 text-[12.5px] font-semibold text-ink">
                          {classById(entry.lesson.classId).name}
                        </span>
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <SubjectDot subject={entry.subject} size={8} />
                          <span className="truncate text-[14px] text-ink">
                            {text(entry.subject.name)}
                          </span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-subtle">
                          <DoorClosed size={12} aria-hidden />
                          {t('common.roomShort', { room: entry.lesson.room })}
                        </span>
                      </li>
                    );
                  })}
                </Rows>
              </Panel>
            )}
          </Section>

          <Section
            title={t('teacher.overview.myAssignments')}
            hint={t('teacher.overview.assignmentsHint')}
            action={
              <Link
                to="/teacher/assignments"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent-text transition-colors hover:bg-accent-soft"
              >
                {t('nav.assignments')}
                <ArrowRight size={14} aria-hidden />
              </Link>
            }
          >
            {activeAssignments.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={17} aria-hidden />}
                title={t('teacher.overview.noAssignments')}
                body={t('teacher.assignments.emptyHint')}
              />
            ) : (
              <Panel>
                <Rows>
                  {activeAssignments.slice(0, 5).map((assignment) => (
                    <li
                      key={assignment.id}
                      className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                    >
                      <span className="shrink-0 rounded border border-line bg-surface-muted px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-muted">
                        {classById(assignment.classId).name}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                        {text(assignment.title)}
                      </p>
                      <span className="shrink-0 whitespace-nowrap text-[12px] text-ink-muted">
                        {dueLabel(assignment.dueDate, t, locale)}
                      </span>
                    </li>
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-7">
          <Section title={t('teacher.overview.classSnapshot')}>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line">
              {snapshots.map((snapshot) => (
                <Link
                  key={snapshot.schoolClass.id}
                  to="/teacher/classes"
                  className="flex items-center gap-3 bg-surface px-4 py-3 transition-colors hover:bg-surface-muted"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-semibold text-accent-text">
                    {snapshot.schoolClass.name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">
                      {snapshot.studentCount} {t('teacher.classes.students')}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-subtle">
                      {snapshot.activeAssignments} {t('teacher.classes.activeAssignments')}
                    </p>
                  </div>
                  {snapshot.nextDueDate ? (
                    <span className="shrink-0 whitespace-nowrap text-[11.5px] text-ink-subtle">
                      {dueLabel(snapshot.nextDueDate, t, locale)}
                    </span>
                  ) : null}
                </Link>
              ))}
            </div>
          </Section>

          <Section title={t('teacher.overview.recentActivity')}>
            {activity.length === 0 ? (
              <EmptyState
                dense
                icon={<Activity size={16} aria-hidden />}
                title={t('teacher.overview.noActivity')}
                body={t('teacher.overview.noActivityHint')}
              />
            ) : (
              <Panel>
                <Rows>
                  {activity.slice(0, 6).map(({ event, assignment }) => (
                    <li key={event.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span
                        className={cn(
                          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          event.kind === 'assignment_created' && 'bg-accent',
                          event.kind === 'homework_completed' && 'bg-success',
                          event.kind === 'homework_reopened' && 'bg-warn',
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] leading-snug text-ink">
                          {event.kind === 'assignment_created'
                            ? t('activity.assignmentCreated', {
                                title: text(assignment!.title),
                                class: classById(assignment!.classId).name,
                              })
                            : event.kind === 'homework_completed'
                              ? t('activity.homeworkCompleted', { title: text(assignment!.title) })
                              : t('activity.homeworkReopened', { title: text(assignment!.title) })}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-ink-subtle">
                          {formatTime(event.at)}
                        </p>
                      </div>
                    </li>
                  ))}
                </Rows>
              </Panel>
            )}
          </Section>
        </div>
      </div>

    </div>
  );
}
