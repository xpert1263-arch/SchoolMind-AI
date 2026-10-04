import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarCheck,
  CornerDownLeft,
  Info,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { formatLongDate } from '@/lib/dates';
import { INTENSITIES, type Intensity, type PlannerErrorCode } from '@/lib/planner/types';
import { TIME_PRESETS, usePlanner } from '@/lib/planner/usePlanner';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { TextInput } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Surface';
import { PlanTimeline } from './PlanTimeline';

/* ------------------------------------------------------------------
   AI Planner.

   Not a chatbot with a school theme: the workload comes from
   SchoolMind, the arrangement comes from the model, and the two are
   kept visibly distinct. Anything the model suggests that is not real
   school work is labelled as a suggestion.
   ------------------------------------------------------------------ */

const ERROR_KEY: Record<PlannerErrorCode, TranslationKey> = {
  missing_api_key: 'planner.noKeyBody',
  rate_limited: 'planner.errRateLimited',
  network: 'planner.errNetwork',
  timeout: 'planner.errTimeout',
  upstream_error: 'planner.errUpstream',
  malformed_response: 'planner.errUpstream',
  empty_response: 'planner.errUpstream',
  bad_request: 'planner.errUpstream',
  server_error: 'planner.errUpstream',
};

const INTENSITY_KEY: Record<Intensity, TranslationKey> = {
  light: 'planner.light',
  balanced: 'planner.balanced',
  intense: 'planner.intense',
};

const PRESET_KEY: Record<number, TranslationKey> = {
  30: 'planner.min30',
  60: 'planner.min60',
  120: 'planner.min120',
};

const ADJUST_KEYS: TranslationKey[] = [
  'planner.adjust1',
  'planner.adjust2',
  'planner.adjust3',
  'planner.adjust4',
  'planner.adjust5',
];

export function AiPlanner() {
  const { t, locale } = useI18n();
  const planner = usePlanner();
  const [draft, setDraft] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const { context, plan } = planner;
  const hasWork = context.tasks.length > 0;
  const overdueCount = context.tasks.filter((task) => task.overdue).length;

  const sendAdjustment = (value: string) => {
    const request = value.trim();
    if (!request || planner.busy || !plan) return;
    planner.adjust(request);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendAdjustment(draft);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendAdjustment(draft);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-accent-text">
          <Wand2 size={13} aria-hidden />
          {t('planner.eyebrow')}
        </p>
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          {t('planner.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('planner.subtitle')}
        </p>
      </header>

      {planner.capabilities && !planner.capabilities.aiConfigured ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-warn-text">{t('planner.noKeyTitle')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-warn-text/90">
              {t('planner.noKeyBody')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-8">
        {/* ---- left: what the plan is built from ---- */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--topbar-h)+24px)] lg:self-start">
          <section>
            <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('planner.setupTitle')}
            </h2>

            <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
              <fieldset className="min-w-0">
                <legend className="mb-2 text-[13px] font-medium text-ink">
                  {t('planner.availableTime')}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_PRESETS.map((minutes) => (
                    <Choice
                      key={minutes}
                      active={!customOpen && planner.availableMinutes === minutes}
                      onClick={() => {
                        setCustomOpen(false);
                        planner.setAvailableMinutes(minutes);
                      }}
                    >
                      {t(PRESET_KEY[minutes])}
                    </Choice>
                  ))}
                  <Choice active={customOpen} onClick={() => setCustomOpen(true)}>
                    {t('planner.custom')}
                  </Choice>
                </div>
                {customOpen ? (
                  <label className="mt-2.5 flex items-center gap-2 text-[12.5px] text-ink-muted">
                    <span className="shrink-0">{t('planner.customLabel')}</span>
                    <TextInput
                      type="number"
                      min={15}
                      max={360}
                      step={5}
                      value={planner.availableMinutes}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (Number.isFinite(next)) {
                          planner.setAvailableMinutes(Math.min(Math.max(next, 15), 360));
                        }
                      }}
                      className="h-8 w-24"
                    />
                  </label>
                ) : null}
              </fieldset>

              <fieldset className="min-w-0">
                <legend className="mb-2 text-[13px] font-medium text-ink">
                  {t('planner.intensity')}
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {INTENSITIES.map((value) => (
                    <Choice
                      key={value}
                      active={planner.intensity === value}
                      onClick={() => planner.setIntensity(value)}
                    >
                      {t(INTENSITY_KEY[value])}
                    </Choice>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>

          <section>
            <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
              {t('planner.workloadTitle')}
            </h2>
            <Panel className="px-4 py-3.5">
              {hasWork ? (
                <>
                  <p className="text-[13.5px] font-medium text-ink">
                    {t('planner.workloadCount', { n: context.tasks.length })}
                    {overdueCount > 0 ? (
                      <span className="text-danger-text">
                        {' · '}
                        {t('planner.workloadOverdue', { n: overdueCount })}
                      </span>
                    ) : null}
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-1.5">
                    {context.tasks.slice(0, 5).map((task) => (
                      <li key={task.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
                        <span className="shrink-0 text-ink-subtle">{task.subjectName}</span>
                        <span className="min-w-0 flex-1 truncate text-ink-muted">{task.title}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] text-ink-muted">{t('planner.emptyTitle')}</p>
              )}
              <p className="mt-3 border-t border-line pt-2.5 text-[12px] text-ink-subtle">
                {t('planner.startFrom', { time: context.startTime })}
              </p>
            </Panel>
          </section>

          <Button
            variant="primary"
            size="lg"
            onClick={planner.generate}
            disabled={planner.busy}
            className="w-full"
            iconLeft={
              planner.status === 'generating' ? (
                <Loader2 size={16} aria-hidden className="animate-spin" />
              ) : (
                <Sparkles size={16} aria-hidden />
              )
            }
          >
            {planner.status === 'generating'
              ? t('planner.generating')
              : plan
                ? t('planner.regenerate')
                : hasWork
                  ? t('planner.generate')
                  : t('planner.emptyAction')}
          </Button>
        </div>

        {/* ---- right: the plan ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          {!plan && planner.status !== 'generating' ? (
            hasWork ? (
              <EmptyState
                icon={<CalendarCheck size={17} aria-hidden />}
                title={t('planner.heading')}
                body={t('planner.subtitle')}
              />
            ) : (
              <EmptyState
                icon={<CalendarCheck size={17} aria-hidden />}
                title={t('planner.emptyTitle')}
                body={t('planner.emptyBody')}
              />
            )
          ) : null}

          {planner.status === 'generating' ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-[14px] text-ink-muted"
            >
              <Loader2 size={15} aria-hidden className="animate-spin" />
              {t('planner.generating')}
            </p>
          ) : null}

          {plan ? (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="flex min-w-0 flex-col gap-5"
            >
              <header className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
                      plan.source === 'ai'
                        ? 'border-accent-line bg-accent-soft text-accent-text'
                        : 'border-line bg-surface-muted text-ink-muted',
                    )}
                  >
                    <Sparkles size={11} aria-hidden />
                    {plan.source === 'ai' ? t('planner.badgeAi') : t('planner.badgeBasic')}
                  </span>
                  <span className="text-[12px] text-ink-subtle">
                    {t('planner.planFor', { date: formatLongDate(plan.dateISO, locale) })}
                  </span>
                </div>

                <h2 className="mt-2 text-[17px] font-semibold leading-snug text-ink">
                  {plan.title}
                </h2>
                {plan.summary ? (
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">
                    {plan.summary}
                  </p>
                ) : null}
                <p className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-subtle">
                  <span data-numeric className="tabular-nums">
                    {t('planner.totalMinutes', { n: plan.totalStudyMinutes })}
                  </span>
                  <span aria-hidden>·</span>
                  <span data-numeric className="tabular-nums">
                    {t('planner.itemCount', { n: plan.items.length })}
                  </span>
                </p>
              </header>

              {/* Honest about which plan this is. */}
              {planner.degraded ? (
                <p className="flex items-start gap-2 rounded-md border border-warn-line bg-warn-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn-text">
                  <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
                  <span>
                    {planner.error ? `${t(ERROR_KEY[planner.error])} ` : ''}
                    {t('planner.basicNote')}
                  </span>
                </p>
              ) : null}

              {plan.warnings.length > 0 ? (
                <div className="rounded-md border border-warn-line bg-warn-soft px-3.5 py-2.5">
                  <p className="flex items-center gap-1.5 text-[12px] font-semibold text-warn-text">
                    <AlertTriangle size={13} aria-hidden />
                    {t('planner.warningsTitle')}
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {plan.warnings.map((warning, i) => (
                      <li key={i} className="text-[12.5px] leading-relaxed text-warn-text/95">
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {plan.items.some((item) => item.type === 'review') ? (
                <p className="text-[12.5px] leading-relaxed text-ink-subtle">
                  {t('planner.optionalNote')}
                </p>
              ) : null}

              <PlanTimeline
                plan={plan}
                completedIds={planner.completedItemIds}
                onToggle={planner.toggleItemDone}
              />

              <p className="text-[12px] leading-relaxed text-ink-subtle">{t('planner.doneNote')}</p>

              {/* ---- conversational adjustment ---- */}
              <section className="flex flex-col gap-3 border-t border-line pt-5">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                  {t('planner.adjustTitle')}
                </h3>

                {planner.adjustments.map((entry) => (
                  <div key={entry.id} className="min-w-0">
                    <p className="text-[13px] font-medium text-ink">{entry.request}</p>
                    <div className="mt-1 border-l-2 border-line pl-3">
                      {entry.status === 'pending' ? (
                        <p
                          role="status"
                          aria-live="polite"
                          className="flex items-center gap-2 text-[12.5px] text-ink-muted"
                        >
                          <Loader2 size={12} aria-hidden className="animate-spin" />
                          {t('planner.adjusting')}
                        </p>
                      ) : entry.status === 'error' ? (
                        <p className="text-[12.5px] text-danger-text">{t('planner.errAdjust')}</p>
                      ) : (
                        <p className="text-[12.5px] leading-relaxed text-ink-muted">
                          {entry.note || t('planner.adjustTitle')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-1.5">
                  {ADJUST_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      disabled={planner.busy}
                      onClick={() => sendAdjustment(t(key))}
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-ink disabled:opacity-50"
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>

                <form onSubmit={onSubmit}>
                  <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-subtle focus-within:border-accent">
                    <input
                      type="text"
                      value={draft}
                      maxLength={300}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={t('planner.adjustPlaceholder')}
                      aria-label={t('planner.adjustPlaceholder')}
                      className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!draft.trim() || planner.busy}
                      iconRight={<CornerDownLeft size={14} aria-hidden />}
                    >
                      <span className="hidden sm:inline">{t('planner.adjustSend')}</span>
                    </Button>
                  </div>
                </form>
              </section>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-subtle">
                  {t('planner.disclaimer')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={planner.discard}
                  disabled={planner.busy}
                  iconLeft={<RotateCcw size={13} aria-hidden />}
                >
                  {t('planner.regenerate')}
                </Button>
              </div>
            </motion.section>
          ) : null}

          <AnimatePresence>
            {!plan && planner.error ? (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-[13px] leading-relaxed text-danger-text"
              >
                <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
                {t(ERROR_KEY[planner.error])}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors',
        active
          ? 'border-accent bg-accent-soft text-accent-text'
          : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
