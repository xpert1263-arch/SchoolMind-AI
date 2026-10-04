import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  Lock,
  MessageSquareText,
  Play,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import type { ID } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { classById } from '@/data/queries';
import { formatDate, formatTime } from '@/lib/dates';
import { useTeacherPulse, type PulseDraft } from '@/lib/pulse/usePulse';
import type { ClassPulse as Pulse, PulseType } from '@/lib/pulse/types';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Chip } from '@/components/ui/Status';
import { Panel } from '@/components/ui/Surface';
import { useToast } from '@/state/toast';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------
   ClassPulse — the teacher's side.

   One question at the end of a lesson, and an honest count of what
   came back. Every number here is counted from real answers: if nine
   of twelve pupils replied, it says nine of twelve and 75%, and if
   nobody replied it says so rather than drawing an empty chart that
   looks like data.

   There is no ranking and no per-pupil score anywhere on this screen.
   An exit ticket shows what pupils wrote, because a teacher needs to
   read it; nothing turns that into a judgement about the writer.
   ------------------------------------------------------------------ */

const TYPE_LABEL: Record<PulseType, TranslationKey> = {
  understanding: 'pulse.typeUnderstanding',
  mcq: 'pulse.typeMcq',
  exit: 'pulse.typeExit',
};

const TYPE_HINT: Record<PulseType, TranslationKey> = {
  understanding: 'pulse.typeUnderstandingHint',
  mcq: 'pulse.typeMcqHint',
  exit: 'pulse.typeExitHint',
};

const STATUS_LABEL = {
  draft: 'pulse.statusDraft',
  active: 'pulse.statusActive',
  closed: 'pulse.statusClosed',
} as const;

const TYPES: PulseType[] = ['understanding', 'mcq', 'exit'];

export function ClassPulse() {
  const { t } = useI18n();
  const pulse = useTeacherPulse();
  const [selectedId, setSelectedId] = useState<ID | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = useMemo(
    () => pulse.pulses.find((entry) => entry.id === selectedId) ?? pulse.pulses[0] ?? null,
    [pulse.pulses, selectedId],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('pulse.title')}
        subtitle={t('pulse.subtitle')}
        actions={
          <Button
            variant={creating ? 'secondary' : 'primary'}
            onClick={() => setCreating((open) => !open)}
            iconLeft={<Plus size={15} aria-hidden />}
          >
            {t('pulse.create')}
          </Button>
        }
      />

      {creating ? (
        <CreateForm
          pulse={pulse}
          onCreated={(created) => {
            setSelectedId(created.id);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : null}

      {pulse.pulses.length === 0 ? (
        <EmptyState
          icon={<Activity size={17} aria-hidden />}
          title={t('pulse.emptyTitle')}
          body={t('pulse.emptyBody')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-8">
          <div className="flex flex-col gap-2">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('pulse.yourPulses')}
            </h2>
            <ul className="flex flex-col gap-2">
              {pulse.pulses.map((entry) => {
                const results = pulse.resultsFor(entry);
                const active = selected?.id === entry.id;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className={cn(
                        'w-full rounded-lg border px-3.5 py-3 text-left transition-colors',
                        active
                          ? 'border-accent bg-accent-soft/50'
                          : 'border-line bg-surface hover:border-line-strong',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                          {entry.topic}
                        </span>
                        <StatusChip status={entry.status} />
                      </div>
                      <p className="mt-1 truncate text-[12px] text-ink-subtle">
                        {classById(entry.classId).name} · {t(TYPE_LABEL[entry.type])} ·{' '}
                        {t('pulse.answeredOf', {
                          n: results.responded,
                          total: results.eligible,
                        })}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected ? <ResultsView pulse={pulse} entry={selected} /> : null}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: Pulse['status'] }) {
  const { t } = useI18n();
  const tone =
    status === 'active'
      ? 'bg-success-soft text-success-text border-success-line'
      : status === 'closed'
        ? 'bg-surface-muted text-ink-muted border-line'
        : 'bg-info-soft text-info-text border-info-line';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border px-2 py-0.5 text-2xs font-medium',
        tone,
      )}
    >
      {t(STATUS_LABEL[status])}
    </span>
  );
}

/* ---- create ---------------------------------------------------------- */

function CreateForm({
  pulse,
  onCreated,
  onCancel,
}: {
  pulse: ReturnType<typeof useTeacherPulse>;
  onCreated: (created: Pulse) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [classId, setClassId] = useState<ID>(pulse.classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState<ID>('');
  const [topic, setTopic] = useState('');
  const [type, setType] = useState<PulseType>('understanding');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subjects = useMemo(() => (classId ? pulse.subjectsFor(classId) : []), [classId, pulse]);

  useEffect(() => {
    if (subjects.length === 0) return;
    if (!subjects.some((entry) => entry.id === subjectId)) setSubjectId(subjects[0].id);
  }, [subjectId, subjects]);

  const submit = () => {
    const draft: PulseDraft = {
      classId,
      subjectId,
      topic,
      type,
      question,
      options,
      correctIndex,
    };
    const created = pulse.create(draft);
    if (!created) {
      setError(t('pulse.createError'));
      return;
    }
    toast(t('pulse.createdToast'));
    onCreated(created);
  };

  return (
    <Panel className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">{t('pulse.createTitle')}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('pulse.class')} hint={t('pulse.classHint')}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {pulse.classes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} · {t('pulse.pupils', { n: entry.students })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('pulse.subject')}>
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={t('pulse.topic')}>
        <TextInput
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t('pulse.topicPlaceholder')}
          maxLength={120}
        />
      </Field>

      <fieldset className="min-w-0">
        <legend className="mb-2 text-[13px] font-medium text-ink">{t('pulse.type')}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              aria-pressed={type === value}
              className={cn(
                'rounded-lg border px-3 py-2.5 text-left transition-colors',
                type === value
                  ? 'border-accent bg-accent-soft/60'
                  : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <span className="block text-[13px] font-medium text-ink">
                {t(TYPE_LABEL[value])}
              </span>
              <span className="mt-0.5 block text-[12px] leading-snug text-ink-subtle">
                {t(TYPE_HINT[value])}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {type === 'understanding' ? (
        <div className="rounded-lg border border-line bg-surface-muted/60 px-3.5 py-3">
          <p className="text-[12.5px] text-ink-muted">{t('pulse.understandingPreview')}</p>
          <p className="mt-1.5 text-[13.5px] font-medium text-ink">
            {t('pulse.understandingQuestion')}
          </p>
        </div>
      ) : (
        <Field label={t('pulse.question')}>
          <TextArea
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              type === 'exit' ? t('pulse.exitPlaceholder') : t('pulse.mcqPlaceholder')
            }
            maxLength={300}
          />
        </Field>
      )}

      {type === 'mcq' ? (
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-[13px] font-medium text-ink">{t('pulse.options')}</legend>
          {options.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('pulse.markCorrect')}
                aria-pressed={correctIndex === index}
                onClick={() => setCorrectIndex(correctIndex === index ? null : index)}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
                  correctIndex === index
                    ? 'border-success-line bg-success-soft text-success-text'
                    : 'border-line text-ink-subtle hover:border-line-strong',
                )}
              >
                <Check size={14} aria-hidden />
              </button>
              <TextInput
                value={value}
                onChange={(e) =>
                  setOptions((current) =>
                    current.map((entry, i) => (i === index ? e.target.value : entry)),
                  )
                }
                placeholder={t('pulse.optionPlaceholder', { n: index + 1 })}
                maxLength={120}
              />
            </div>
          ))}
          <p className="text-[12px] text-ink-subtle">{t('pulse.correctHint')}</p>
        </fieldset>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger-text">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={submit} iconLeft={<Plus size={15} aria-hidden />}>
          {t('pulse.saveDraft')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <span className="text-[12px] text-ink-subtle">{t('pulse.draftNote')}</span>
      </div>
    </Panel>
  );
}

/* ---- results --------------------------------------------------------- */

function ResultsView({
  pulse,
  entry,
}: {
  pulse: ReturnType<typeof useTeacherPulse>;
  entry: Pulse;
}) {
  const { t, locale } = useI18n();
  const results = pulse.resultsFor(entry);
  const summary = pulse.summaryFor(entry);
  const analysis = pulse.analysis?.pulseId === entry.id ? pulse.analysis : null;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Panel className="p-4 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">{entry.topic}</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-subtle">
              {classById(entry.classId).name} · {t(TYPE_LABEL[entry.type])} ·{' '}
              {formatDate(entry.dateISO, locale)}
              {entry.activatedAt ? ` · ${formatTime(entry.activatedAt)}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <StatusChip status={entry.status} />
            {entry.status === 'draft' ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => pulse.activate(entry)}
                iconLeft={<Play size={14} aria-hidden />}
              >
                {t('pulse.activate')}
              </Button>
            ) : null}
            {entry.status === 'active' ? (
              <Button
                size="sm"
                onClick={() => pulse.close(entry)}
                iconLeft={<Lock size={14} aria-hidden />}
              >
                {t('pulse.close')}
              </Button>
            ) : null}
          </div>
        </header>

        {entry.question ? (
          <p className="mt-3.5 text-[13.5px] text-ink">{entry.question}</p>
        ) : (
          <p className="mt-3.5 text-[13.5px] text-ink">{t('pulse.understandingQuestion')}</p>
        )}

        {entry.status === 'draft' ? (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-info-line bg-info-soft px-3.5 py-3">
            <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-info-text" />
            <p className="text-[12.5px] leading-relaxed text-info-text">
              {t('pulse.draftExplain')}
            </p>
          </div>
        ) : null}
      </Panel>

      {entry.status !== 'draft' ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label={t('pulse.eligible')} value={results.eligible} icon={<Users size={14} aria-hidden />} />
            <Metric label={t('pulse.responded')} value={results.responded} />
            <Metric label={t('pulse.unanswered')} value={results.unanswered} />
            <Metric label={t('pulse.responseRate')} value={`${results.responseRate}%`} />
          </div>

          <Panel className="p-4 sm:p-5">
            <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('pulse.distribution')}
            </h3>

            {results.responded === 0 ? (
              <EmptyState dense title={t('pulse.noAnswersYet')} body={t('pulse.noAnswersBody')} />
            ) : entry.type === 'exit' ? (
              <ul className="flex flex-col gap-2.5">
                {results.texts.map((row) => (
                  <li
                    key={row.studentId}
                    className="rounded-lg border border-line bg-surface-muted/50 px-3.5 py-2.5"
                  >
                    <p className="whitespace-pre-line text-[13px] leading-relaxed text-ink">
                      {row.answer}
                    </p>
                    <p className="mt-1 text-[11.5px] text-ink-subtle">{row.studentName}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="flex flex-col gap-3">
                {results.distribution.map((row) => (
                  <li key={row.key} className="min-w-0">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {row.label}
                        {entry.correctOptionId === row.key ? (
                          <CheckCircle2
                            size={13}
                            aria-label={t('pulse.correctAnswer')}
                            className="ml-1.5 inline-block align-[-2px] text-success-text"
                          />
                        ) : null}
                      </span>
                      <span data-numeric className="shrink-0 text-[12.5px] text-ink-muted">
                        {row.count} · {row.percent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          entry.correctOptionId === row.key ? 'bg-success-text' : 'bg-accent',
                        )}
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {results.correct !== null ? (
              <p className="mt-4 text-[13px] text-ink-muted">
                {t('pulse.correctCount', {
                  correct: results.correct,
                  responded: results.responded,
                })}
              </p>
            ) : null}
          </Panel>

          <Panel className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('pulse.summaryTitle')}
              </h3>
              <Chip>{t('pulse.badgeCounted')}</Chip>
            </div>
            <p className="text-[13.5px] leading-relaxed text-ink">{summary}</p>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Button
                size="sm"
                disabled={pulse.analysing || results.responded === 0}
                onClick={() => pulse.analyse(entry)}
                iconLeft={
                  pulse.analysing ? (
                    <Loader2 size={14} aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles size={14} aria-hidden />
                  )
                }
              >
                {t('pulse.analyse')}
              </Button>
              <span className="text-[12px] text-ink-subtle">{t('pulse.analyseNote')}</span>
            </div>

            {pulse.analysisError ? (
              <p className="text-[12.5px] text-warn-text">{pulse.analysisError}</p>
            ) : null}

            {analysis ? (
              <div className="flex flex-col gap-2 rounded-lg border border-accent-line bg-accent-soft/40 p-3.5">
                <Chip tone="accent">{t('pulse.badgeAi')}</Chip>
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">
                  {analysis.text}
                </p>
              </div>
            ) : null}
          </Panel>

          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-ink-subtle">
            <MessageSquareText size={12} aria-hidden className="mt-0.5 shrink-0" />
            {t('pulse.privacyNote')}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3.5 py-3 shadow-subtle">
      <p className="flex items-center gap-1.5 text-[11.5px] uppercase tracking-wide text-ink-subtle">
        {icon}
        {label}
      </p>
      <p data-numeric className="mt-1 text-[22px] font-semibold leading-none text-ink">
        {value}
      </p>
    </div>
  );
}
