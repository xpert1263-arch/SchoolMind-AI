import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardList, Plus } from 'lucide-react';
import type { Assignment, AssignmentKind, ID, Subject } from '@/data/types';
import { classById, subjectById } from '@/data/queries';
import { subjectIdsTaughtBy } from '@/data/school';
import { useI18n } from '@/i18n/useI18n';
import { formatDate, isoFromToday, todayISO } from '@/lib/dates';
import { dueLabel } from '@/lib/labels';
import { useCurrentTeacher, useTeacherAssignments } from '@/state/selectors';
import { useApp } from '@/state/store';
import { useToast } from '@/state/toast';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Select, TextArea, TextInput, useFieldId } from '@/components/ui/Field';
import { Overlay } from '@/components/ui/Overlay';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel, Rows } from '@/components/ui/Surface';
import { Segmented } from '@/components/ui/Segmented';
import { Chip, SubjectChip } from '@/components/ui/Status';

export function Assignments() {
  const { t } = useI18n();
  const assignments = useTeacherAssignments();
  const { taughtClasses } = useCurrentTeacher();
  const [classFilter, setClassFilter] = useState<ID | 'all'>('all');
  const [composerOpen, setComposerOpen] = useState(false);

  const visible = useMemo(
    () => (classFilter === 'all' ? assignments : assignments.filter((a) => a.classId === classFilter)),
    [assignments, classFilter],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('teacher.assignments.title')}
        subtitle={t('teacher.assignments.subtitle')}
        actions={
          <Button
            variant="primary"
            onClick={() => setComposerOpen(true)}
            iconLeft={<Plus size={15} aria-hidden />}
          >
            {t('teacher.assignments.create')}
          </Button>
        }
      />

      <Segmented<ID | 'all'>
        ariaLabel={t('teacher.assignments.filterClass')}
        value={classFilter}
        onChange={setClassFilter}
        options={[
          { value: 'all', label: t('common.all'), count: assignments.length },
          ...taughtClasses.map((c) => ({
            value: c.id,
            label: c.name,
            count: assignments.filter((a) => a.classId === c.id).length,
          })),
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={17} aria-hidden />}
          title={t('teacher.assignments.empty')}
          body={t('teacher.assignments.emptyHint')}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => setComposerOpen(true)}
              iconLeft={<Plus size={14} aria-hidden />}
            >
              {t('teacher.assignments.create')}
            </Button>
          }
        />
      ) : (
        <Panel>
          <Rows>
            {visible.map((assignment) => (
              <AssignmentRow key={assignment.id} assignment={assignment} />
            ))}
          </Rows>
        </Panel>
      )}

      <AssignmentComposer open={composerOpen} onClose={() => setComposerOpen(false)} />
    </div>
  );
}

function AssignmentRow({ assignment }: { assignment: Assignment }) {
  const { t, text, locale } = useI18n();
  const overdue = assignment.dueDate < todayISO();

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-muted text-[12.5px] font-semibold text-ink">
        {classById(assignment.classId).name}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[14px] font-medium leading-snug text-ink">{text(assignment.title)}</p>
          {assignment.origin === 'teacher' ? (
            <Chip tone="accent">{t('teacher.assignments.createdByYou')}</Chip>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-subtle">
          <SubjectChip subject={subjectById(assignment.subjectId)} />
          <span>{t(`kind.${assignment.kind}`)}</span>
          <span>{t('teacher.assignments.createdOn', { date: formatDate(assignment.createdAt, locale) })}</span>
        </div>
      </div>

      <span
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium ${
          overdue ? 'text-ink-subtle' : 'text-ink-muted'
        }`}
      >
        <CalendarClock size={13} aria-hidden />
        {dueLabel(assignment.dueDate, t, locale)}
      </span>
    </li>
  );
}

interface FormErrors {
  title?: string;
  classId?: string;
  subjectId?: string;
  dueDate?: string;
}

function AssignmentComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { taughtClasses, teacher } = useCurrentTeacher();
  const { createAssignment } = useApp();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classId, setClassId] = useState<ID>(taughtClasses[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState<ID>('');
  const [kind, setKind] = useState<AssignmentKind>('homework');
  const [dueDate, setDueDate] = useState(() => isoFromToday(2));
  const [errors, setErrors] = useState<FormErrors>({});

  const titleId = useFieldId('title');
  const descId = useFieldId('description');
  const classFieldId = useFieldId('class');
  const subjectFieldId = useFieldId('subject');
  const kindId = useFieldId('kind');
  const dueId = useFieldId('due');

  /* A teacher may only set work in subjects they actually teach to the
     chosen class, so the options come from the shared teaching data and
     change with the class. */
  const subjectOptions = useMemo(
    () => (classId ? subjectIdsTaughtBy(teacher.id, classId).map(subjectById) : []),
    [teacher.id, classId],
  );

  /* Keep the selection valid when the class changes. */
  useEffect(() => {
    if (subjectOptions.length === 0) {
      if (subjectId !== '') setSubjectId('');
      return;
    }
    if (!subjectOptions.some((s) => s.id === subjectId)) {
      setSubjectId(subjectOptions[0].id);
    }
  }, [subjectOptions, subjectId]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setKind('homework');
    setDueDate(isoFromToday(2));
    setErrors({});
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    const trimmed = title.trim();
    if (!trimmed) next.title = t('teacher.assignments.errTitle');
    else if (trimmed.length < 3) next.title = t('teacher.assignments.errTitleShort');
    if (!classId) next.classId = t('teacher.assignments.errClass');
    if (!subjectId) next.subjectId = t('teacher.assignments.errSubject');
    if (!dueDate) next.dueDate = t('teacher.assignments.errDeadline');
    else if (dueDate < todayISO()) next.dueDate = t('teacher.assignments.errDeadlinePast');
    return next;
  };

  const submit = () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const created = createAssignment({ title, description, classId, subjectId, kind, dueDate });
    toast(
      t('teacher.assignments.createdToast', {
        title: typeof created.title === 'string' ? created.title : '',
        class: classById(classId).name,
      }),
    );
    reset();
    onClose();
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={t('teacher.assignments.createTitle')}
      description={t('teacher.assignments.createSubtitle')}
      widthClass="sm:max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={submit}>
            {t('teacher.assignments.submit')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label={t('teacher.assignments.fieldTitle')} htmlFor={titleId} error={errors.title}>
          <TextInput
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('teacher.assignments.placeholderTitle')}
            aria-invalid={Boolean(errors.title)}
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('teacher.assignments.fieldClass')} htmlFor={classFieldId} error={errors.classId}>
            <Select
              id={classFieldId}
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-invalid={Boolean(errors.classId)}
            >
              {taughtClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={t('teacher.assignments.fieldSubject')}
            htmlFor={subjectFieldId}
            error={errors.subjectId}
          >
            <SubjectSelect id={subjectFieldId} value={subjectId} onChange={setSubjectId} options={subjectOptions} />
          </Field>

          <Field label={t('teacher.assignments.fieldKind')} htmlFor={kindId}>
            <Select
              id={kindId}
              value={kind}
              onChange={(e) => setKind(e.target.value as AssignmentKind)}
            >
              <option value="homework">{t('kind.homework')}</option>
              <option value="project">{t('kind.project')}</option>
              <option value="test">{t('kind.test')}</option>
            </Select>
          </Field>

          <Field
            label={t('teacher.assignments.fieldDeadline')}
            htmlFor={dueId}
            error={errors.dueDate}
          >
            <TextInput
              id={dueId}
              type="date"
              value={dueDate}
              min={todayISO()}
              onChange={(e) => setDueDate(e.target.value)}
              aria-invalid={Boolean(errors.dueDate)}
            />
          </Field>
        </div>

        <Field
          label={t('teacher.assignments.fieldDescription')}
          htmlFor={descId}
          optional
        >
          <TextArea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('teacher.assignments.placeholderDescription')}
            rows={4}
          />
        </Field>

        {/* Submitting with Enter works; the visible button lives in the footer. */}
        <button type="submit" className="sr-only">
          {t('teacher.assignments.submit')}
        </button>
      </form>
    </Overlay>
  );
}

function SubjectSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: ID;
  onChange: (value: ID) => void;
  options: Subject[];
}) {
  const { text } = useI18n();
  return (
    <Select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={options.length <= 1}
    >
      {options.map((subject) => (
        <option key={subject.id} value={subject.id}>
          {text(subject.name)}
        </option>
      ))}
    </Select>
  );
}
