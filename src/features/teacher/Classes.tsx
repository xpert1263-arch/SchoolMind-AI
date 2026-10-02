import { useMemo, useState } from 'react';
import { ChevronRight, DoorClosed, Search, Users } from 'lucide-react';
import type { ID } from '@/data/types';
import {
  classById,
  fullName,
  initialsOf,
  studentsOfClass,
  subjectById,
  teacherById,
} from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, todayISO } from '@/lib/dates';
import { dueLabel, weekdayLabel } from '@/lib/labels';
import {
  useAllAssignments,
  useClassSnapshots,
  useUpcomingClassLessons,
} from '@/state/selectors';
import { Avatar } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/Feedback';
import { Overlay } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { TextInput } from '@/components/ui/Field';
import { SubjectChip, SubjectDot } from '@/components/ui/Status';

export function Classes() {
  const { t } = useI18n();
  const snapshots = useClassSnapshots();
  const [query, setQuery] = useState('');
  const [openClassId, setOpenClassId] = useState<ID | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshots;
    return snapshots.filter((s) => s.schoolClass.name.toLowerCase().includes(needle));
  }, [snapshots, query]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('teacher.classes.title')} subtitle={t('teacher.classes.subtitle')} />

      <div className="relative max-w-sm">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('teacher.classes.searchPlaceholder')}
          aria-label={t('teacher.classes.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={17} aria-hidden />}
          title={t('teacher.classes.emptySearch')}
          body={t('teacher.classes.emptySearchHint')}
        />
      ) : (
        <Panel>
          <Rows>
            {filtered.map((snapshot) => (
              <li key={snapshot.schoolClass.id}>
                <button
                  type="button"
                  onClick={() => setOpenClassId(snapshot.schoolClass.id)}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-muted/70 sm:px-5"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13.5px] font-semibold text-accent-text">
                    {snapshot.schoolClass.name}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={13} aria-hidden className="text-ink-subtle" />
                        {snapshot.studentCount} {t('teacher.classes.students')}
                      </span>
                      <span className="text-ink-muted">
                        {snapshot.activeAssignments} {t('teacher.classes.activeAssignments')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-ink-subtle">
                        <DoorClosed size={13} aria-hidden />
                        {t('common.roomShort', { room: snapshot.schoolClass.room })}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {snapshot.subjectIds.slice(0, 4).map((id) => (
                        <SubjectChip key={id} subject={subjectById(id)} />
                      ))}
                    </div>
                    <p className="mt-2 text-[12px] text-ink-subtle">
                      {t('teacher.classes.homeroom')}:{' '}
                      {fullName(teacherById(snapshot.schoolClass.homeroomTeacherId))}
                    </p>
                  </div>

                  <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-subtle" />
                </button>
              </li>
            ))}
          </Rows>
        </Panel>
      )}

      <ClassDrawer classId={openClassId} onClose={() => setOpenClassId(null)} />
    </div>
  );
}

function ClassDrawer({ classId, onClose }: { classId: ID | null; onClose: () => void }) {
  const { t, text, locale } = useI18n();
  const all = useAllAssignments();
  const resolvedId = classId ?? '9a';
  const upcoming = useUpcomingClassLessons(resolvedId, 2);

  if (!classId) return null;

  const schoolClass = classById(classId);
  const roster = studentsOfClass(classId);
  const active = all
    .filter((a) => a.classId === classId && a.dueDate >= todayISO())
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return (
    <Overlay
      open
      onClose={onClose}
      variant="drawer"
      widthClass="sm:max-w-[30rem]"
      title={schoolClass.name}
      description={`${roster.length} ${t('teacher.classes.students')} · ${t('common.roomShort', { room: schoolClass.room })}`}
    >
      <div className="flex flex-col gap-6">
        <Section dense title={t('teacher.classes.detailAssignments')}>
          {active.length === 0 ? (
            <EmptyState dense title={t('teacher.classes.noAssignments')} />
          ) : (
            <Panel>
              <Rows>
                {active.map((assignment) => (
                  <li key={assignment.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <SubjectDot subject={subjectById(assignment.subjectId)} size={8} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {text(assignment.title)}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-ink-subtle">
                        {text(subjectById(assignment.subjectId).name)} · {t(`kind.${assignment.kind}`)}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[11.5px] text-ink-muted">
                      {dueLabel(assignment.dueDate, t, locale)}
                    </span>
                  </li>
                ))}
              </Rows>
            </Panel>
          )}
        </Section>

        <Section dense title={t('teacher.classes.detailSchedule')}>
          {upcoming.length === 0 ? (
            <EmptyState dense title={t('teacher.classes.noLessons')} />
          ) : (
            <div className="flex flex-col gap-3">
              {upcoming.map((day) => (
                <Panel key={day.date}>
                  <p className="border-b border-line px-3.5 py-2 text-[12px] font-medium text-ink-muted">
                    <span className="capitalize">{weekdayLabel(day.date, locale)}</span> ·{' '}
                    {formatDate(day.date, locale, { day: 'numeric', month: 'short' })}
                  </p>
                  <Rows>
                    {day.lessons.map((entry) => (
                      <li
                        key={entry.lesson.id}
                        className="flex items-center gap-2.5 px-3.5 py-2 text-[12.5px]"
                      >
                        <span data-numeric className="w-10 shrink-0 tabular-nums text-ink-subtle">
                          {entry.slot.start}
                        </span>
                        <SubjectDot subject={entry.subject} size={7} />
                        <span className="min-w-0 flex-1 truncate text-ink">
                          {text(entry.subject.name)}
                        </span>
                        <span className="shrink-0 text-ink-subtle">
                          {t('common.roomShort', { room: entry.lesson.room })}
                        </span>
                      </li>
                    ))}
                  </Rows>
                </Panel>
              ))}
            </div>
          )}
        </Section>

        <Section dense title={`${t('teacher.classes.detailStudents')} · ${roster.length}`}>
          <Panel>
            <Rows>
              {roster.map((student) => (
                <li key={student.id} className="flex items-center gap-2.5 px-3.5 py-2">
                  <Avatar name={fullName(student)} initials={initialsOf(student)} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {fullName(student)}
                  </span>
                </li>
              ))}
            </Rows>
          </Panel>
        </Section>
      </div>
    </Overlay>
  );
}
