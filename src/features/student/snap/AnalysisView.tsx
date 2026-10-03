import {
  AlertTriangle,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  ListOrdered,
  Lock,
} from 'lucide-react';
import { subjects } from '@/data/school';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { normaliseMath } from '@/lib/snap/mathText';
import type { Confidence, HelpLevel, SnapAnalysis, SnapSubjectId } from '@/lib/snap/types';
import { Panel } from '@/components/ui/Surface';
import { EmptyState } from '@/components/ui/Feedback';

/* Renders the typed analysis. Each section is plain structure — no
   markdown parsing, because the server returns a validated object. */

/** Subject label from the shared dataset where possible. */
export function useSubjectLabel(): (id: SnapSubjectId) => string {
  const { t, text } = useI18n();
  return (id) => {
    if (id === 'unknown') return t('snap.subjectUnknown');
    if (id === 'chemistry') return t('snap.chemistry');
    const subject = subjects.find((s) => s.id === id);
    return subject ? text(subject.name) : t('snap.subjectUnknown');
  };
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Prose({ children }: { children: string }) {
  return (
    <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
      {normaliseMath(children)}
    </p>
  );
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high: 'bg-success-soft text-success-text border-success-line',
  medium: 'bg-info-soft text-info-text border-info-line',
  low: 'bg-warn-soft text-warn-text border-warn-line',
};

export function AnalysisView({
  analysis,
  mode,
}: {
  analysis: SnapAnalysis;
  mode: HelpLevel;
}) {
  const { t } = useI18n();
  const subjectLabel = useSubjectLabel();

  if (!analysis.isSchoolTask) {
    return (
      <EmptyState
        icon={<HelpCircle size={17} aria-hidden />}
        title={t('snap.notTaskTitle')}
        body={t('snap.notTaskBody')}
      />
    );
  }

  if (!analysis.readable) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          icon={<AlertTriangle size={17} aria-hidden />}
          title={t('snap.unreadableTitle')}
          body={t('snap.unreadableBody')}
        />
        {analysis.warnings.length > 0 ? <Warnings items={analysis.warnings} /> : null}
      </div>
    );
  }

  const confidenceLabel: Record<Confidence, string> = {
    high: t('snap.confidenceHigh'),
    medium: t('snap.confidenceMedium'),
    low: t('snap.confidenceLow'),
  };

  return (
    <div className="flex flex-col gap-6">
      {/* detected subject */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium text-accent-text">
          <BadgeCheck size={13} aria-hidden />
          {t('snap.subjectLabel')}: {subjectLabel(analysis.detectedSubject)}
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-2xs font-medium',
            CONFIDENCE_TONE[analysis.subjectConfidence],
          )}
        >
          {confidenceLabel[analysis.subjectConfidence]}
        </span>
      </div>

      {analysis.warnings.length > 0 ? <Warnings items={analysis.warnings} /> : null}

      {analysis.detectedTasks.length > 1 ? (
        <Section icon={<ListOrdered size={12} aria-hidden />} title={t('snap.otherTasks')}>
          <Panel>
            <ul className="sm-divide">
              {analysis.detectedTasks.map((task, i) => (
                <li
                  key={i}
                  className={cn(
                    'px-4 py-2.5 text-[13px]',
                    i === 0 ? 'font-medium text-ink' : 'text-ink-muted',
                  )}
                >
                  {normaliseMath(task)}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      ) : null}

      {analysis.taskSummary ? (
        <Section icon={<BookOpen size={12} aria-hidden />} title={t('snap.sectionTask')}>
          <Prose>{analysis.taskSummary}</Prose>
        </Section>
      ) : null}

      {analysis.conceptExplanation ? (
        <Section icon={<Lightbulb size={12} aria-hidden />} title={t('snap.sectionConcept')}>
          <Prose>{analysis.conceptExplanation}</Prose>
        </Section>
      ) : null}

      {analysis.hints.length > 0 ? (
        <Section icon={<Lightbulb size={12} aria-hidden />} title={t('snap.sectionHints')}>
          <ol className="flex flex-col gap-2">
            {analysis.hints.map((hint, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-warn-line bg-warn-soft/50 px-3.5 py-2.5"
              >
                <span
                  data-numeric
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warn-soft text-[11px] font-semibold text-warn-text"
                >
                  {i + 1}
                </span>
                <span className="min-w-0 text-[13.5px] leading-relaxed text-ink">
                  {normaliseMath(hint)}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {analysis.steps.length > 0 ? (
        <Section icon={<ListOrdered size={12} aria-hidden />} title={t('snap.sectionSteps')}>
          <ol className="flex flex-col gap-3">
            {analysis.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  data-numeric
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent-text"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium text-ink">{normaliseMath(step.title)}</p>
                  <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-muted">
                    {normaliseMath(step.detail)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {analysis.finalAnswer ? (
        <Section icon={<CheckCircle2 size={12} aria-hidden />} title={t('snap.sectionAnswer')}>
          <Panel className="border-success-line bg-success-soft/50 px-4 py-3">
            <p className="text-[15px] font-semibold text-success-text">
              {normaliseMath(analysis.finalAnswer)}
            </p>
          </Panel>
        </Section>
      ) : mode !== 'solve' ? (
        <p className="flex items-start gap-2 rounded-md border border-line bg-surface-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
          <Lock size={13} aria-hidden className="mt-0.5 shrink-0" />
          {t('snap.answerHidden')}
        </p>
      ) : null}

      {analysis.understandingQuestion ? (
        <Section icon={<HelpCircle size={12} aria-hidden />} title={t('snap.sectionCheck')}>
          <Panel className="border-accent-line bg-accent-soft/40 px-4 py-3">
            <p className="text-[14px] leading-relaxed text-ink">
              {normaliseMath(analysis.understandingQuestion)}
            </p>
          </Panel>
        </Section>
      ) : null}
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  const { t } = useI18n();
  return (
    <Section icon={<AlertTriangle size={12} aria-hidden />} title={t('snap.sectionWarnings')}>
      <ul className="flex flex-col gap-1.5">
        {items.map((warning, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[13px] leading-relaxed text-warn-text"
          >
            <AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" />
            {normaliseMath(warning)}
          </li>
        ))}
      </ul>
    </Section>
  );
}
