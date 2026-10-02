import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import type { Student } from '@/data/types';
import { classById, fullName, initialsOf } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { useAssignmentsForStudent, useStudentRows } from '@/state/selectors';
import { Avatar, Progress } from '@/components/ui/Display';
import { EmptyState } from '@/components/ui/Feedback';
import { Overlay } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, Rows, Section } from '@/components/ui/Surface';
import { TextInput } from '@/components/ui/Field';
import { Chip, StatusPill, SubjectChip } from '@/components/ui/Status';

export function Students() {
  const { t } = useI18n();
  const rows = useStudentRows();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        fullName(row.student).toLowerCase().includes(needle) ||
        row.schoolClass.name.toLowerCase().includes(needle),
    );
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('teacher.students.title')} subtitle={t('teacher.students.subtitle')} />

      <div className="relative max-w-sm">
        <Search
          size={15}
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('teacher.students.searchPlaceholder')}
          aria-label={t('teacher.students.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={17} aria-hidden />}
          title={t('teacher.students.emptySearch')}
          body={t('teacher.students.emptySearchHint')}
        />
      ) : (
        <Panel>
          <div className="hidden items-center gap-4 border-b border-line px-5 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle sm:flex">
            <span className="flex-1">{t('teacher.students.tableName')}</span>
            <span className="w-16">{t('teacher.students.tableClass')}</span>
            <span className="w-48">{t('teacher.students.tableProgress')}</span>
            <span className="w-4" aria-hidden />
          </div>
          <Rows>
            {filtered.map((row) => (
              <li key={row.student.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row.student)}
                  className="flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted/70 sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar
                      name={fullName(row.student)}
                      initials={initialsOf(row.student)}
                      size={30}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-ink">
                        {fullName(row.student)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 sm:hidden">
                        <span className="text-[12px] text-ink-subtle">{row.schoolClass.name}</span>
                        <span data-numeric className="text-[12px] text-ink-subtle">
                          {t('common.of', { done: row.done, total: row.total })}
                        </span>
                      </span>
                    </span>
                    {row.isCurrentUser ? <Chip tone="accent">demo</Chip> : null}
                  </span>

                  <span className="hidden w-16 text-[13px] text-ink-muted sm:block">
                    {row.schoolClass.name}
                  </span>

                  <span className="hidden w-48 items-center gap-2 sm:flex">
                    <Progress
                      value={row.done}
                      max={row.total || 1}
                      label={t('teacher.students.completion')}
                    />
                  </span>

                  <ChevronRight size={16} aria-hidden className="shrink-0 text-ink-subtle" />
                </button>
              </li>
            ))}
          </Rows>
        </Panel>
      )}

      <p className="text-[12px] text-ink-subtle">{t('teacher.students.note')}</p>

      <StudentDrawer student={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function StudentDrawer({ student, onClose }: { student: Student | null; onClose: () => void }) {
  const { t, text } = useI18n();
  const fallback = useStudentRows()[0]?.student;
  const target = student ?? fallback;
  const items = useAssignmentsForStudent(target);

  if (!student || !target) return null;

  const open = items.filter((i) => !i.completed);
  const done = items.filter((i) => i.completed);

  return (
    <Overlay
      open
      onClose={onClose}
      variant="drawer"
      title={fullName(student)}
      description={`${t('common.class')}: ${classById(student.classId).name}`}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-4 py-3.5">
          <Avatar name={fullName(student)} initials={initialsOf(student)} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink">{fullName(student)}</p>
            <p className="mt-1 text-[12px] text-ink-subtle">
              {t('teacher.students.completion')}: {t('common.of', { done: done.length, total: items.length })}
            </p>
          </div>
        </div>

        <Section dense title={t('teacher.students.currentWork')}>
          {open.length === 0 ? (
            <EmptyState dense title={t('teacher.students.noWork')} />
          ) : (
            <Panel>
              <Rows>
                {open.map((item) => (
                  <li key={item.assignment.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">
                        {text(item.assignment.title)}
                      </p>
                      <div className="mt-1.5">
                        <SubjectChip subject={item.subject} />
                      </div>
                    </div>
                    <StatusPill status={item.status} />
                  </li>
                ))}
              </Rows>
            </Panel>
          )}
        </Section>

        {done.length > 0 ? (
          <Section dense title={t('student.homework.filterCompleted')}>
            <Panel>
              <Rows>
                {done.map((item) => (
                  <li
                    key={item.assignment.id}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-ink-subtle"
                  >
                    <span className="min-w-0 flex-1 truncate line-through">
                      {text(item.assignment.title)}
                    </span>
                    <StatusPill status="completed" />
                  </li>
                ))}
              </Rows>
            </Panel>
          </Section>
        ) : null}

        <p className="text-[12px] text-ink-subtle">{t('teacher.students.note')}</p>
      </div>
    </Overlay>
  );
}
