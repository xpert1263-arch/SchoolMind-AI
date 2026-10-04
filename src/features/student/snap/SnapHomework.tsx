import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Globe, Info, Loader2, ScanLine, Sparkles } from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { normaliseMath } from '@/lib/snap/mathText';
import { useSnap } from '@/lib/snap/useSnap';
import type { SnapErrorCode, SnapFollowUp, SnapPhase } from '@/lib/snap/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Panel } from '@/components/ui/Surface';
import { AnalysisView, useSubjectLabel } from './AnalysisView';
import { ImageWorkspace } from './ImageWorkspace';
import { SourceBadges } from '../ask/AnswerBlocks';

const ERROR_KEY: Record<SnapErrorCode, TranslationKey> = {
  missing_api_key: 'snap.errNoKey',
  rate_limited: 'snap.errRateLimited',
  network: 'snap.errNetwork',
  timeout: 'snap.errTimeout',
  upstream_error: 'snap.errUpstream',
  malformed_response: 'snap.errMalformed',
  empty_response: 'snap.errUpstream',
  image_too_large: 'snap.errTooLarge',
  unsupported_type: 'snap.errUnsupported',
  no_image: 'snap.errNoImage',
  read_failed: 'snap.errRead',
  question_too_long: 'snap.errUpstream',
  server_error: 'snap.errUpstream',
  bad_request: 'snap.errUpstream',
};

const PHASE_KEY: Record<SnapPhase, TranslationKey> = {
  reading: 'snap.loadingReading',
  detecting: 'snap.loadingDetecting',
  teaching: 'snap.loadingTeaching',
};

const FOLLOW_UP_KEYS: TranslationKey[] = ['snap.f1', 'snap.f2', 'snap.f3', 'snap.f4'];

/**
 * SnapHomework — photograph a task, understand it.
 * Deliberately a teaching surface, not an answer vending machine: the
 * help level decides how much is revealed, and the default explains.
 */
export function SnapHomework() {
  const { t } = useI18n();
  const snap = useSnap();
  const subjectLabel = useSubjectLabel();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (snap.followUps.length > 0) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [snap.followUps]);

  const sendFollowUp = (value: string) => {
    const question = value.trim();
    if (!question || !snap.analysis) return;
    snap.askFollowUp(question, subjectLabel(snap.analysis.detectedSubject));
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendFollowUp(draft);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendFollowUp(draft);
  };

  const canFollowUp = snap.status === 'done' && snap.analysis?.isSchoolTask && snap.analysis.readable;

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          <ScanLine size={22} aria-hidden className="shrink-0 text-accent-text" />
          {t('snap.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('snap.subtitle')}
        </p>
      </header>

      {snap.capabilities && !snap.capabilities.visionConfigured ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-warn-text">{t('snap.noKeyTitle')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-warn-text/90">
              {t('snap.noKeyBody')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-8">
        {/* ---- left: the photo ---- */}
        <div className="lg:sticky lg:top-[calc(var(--topbar-h)+24px)] lg:self-start">
          <ImageWorkspace
            image={snap.image}
            status={snap.status}
            mode={snap.mode}
            onSelect={snap.selectFile}
            onRemove={snap.removeImage}
            onAnalyse={() => snap.analyse()}
            onModeChange={snap.setMode}
          />
        </div>

        {/* ---- right: the teaching ---- */}
        <div className="flex min-w-0 flex-col gap-6">
          {snap.status === 'idle' ? (
            <EmptyState
              icon={<ScanLine size={17} aria-hidden />}
              title={t('snap.emptyTitle')}
              body={t('snap.emptyBody')}
            />
          ) : null}

          {snap.status === 'ready' ? (
            <EmptyState
              icon={<Sparkles size={17} aria-hidden />}
              title={t('snap.readyTitle')}
              body={t('snap.readyBody')}
            />
          ) : null}

          {snap.status === 'analysing' ? (
            <AnimatePresence mode="wait">
              <motion.p
                key={snap.phase}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-[14px] text-ink-muted"
              >
                <Loader2 size={15} aria-hidden className="animate-spin" />
                {t(PHASE_KEY[snap.phase])}
              </motion.p>
            </AnimatePresence>
          ) : null}

          {snap.status === 'error' && snap.error ? (
            <p className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-[13px] leading-relaxed text-danger-text">
              <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
              {t(ERROR_KEY[snap.error])}
            </p>
          ) : null}

          {snap.status === 'done' && snap.analysis ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            >
              <AnalysisView analysis={snap.analysis} mode={snap.mode} />
            </motion.div>
          ) : null}

          {canFollowUp ? (
            <section className="flex flex-col gap-3 border-t border-line pt-5">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('snap.followUpTitle')}
              </h2>

              {snap.followUps.map((turn) => (
                <FollowUpTurn key={turn.id} turn={turn} />
              ))}

              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UP_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={snap.busy}
                    onClick={() => sendFollowUp(t(key))}
                    className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] text-ink-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-ink disabled:opacity-50"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>

              <form onSubmit={onSubmit}>
                <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2 shadow-subtle focus-within:border-accent">
                  <textarea
                    rows={1}
                    value={draft}
                    maxLength={600}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('snap.followUpPlaceholder')}
                    aria-label={t('snap.followUpPlaceholder')}
                    className="min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={!draft.trim() || snap.busy}
                    iconRight={<CornerDownLeft size={14} aria-hidden />}
                  >
                    <span className="hidden sm:inline">{t('snap.followUpSend')}</span>
                  </Button>
                </div>
              </form>
              <div ref={endRef} />
            </section>
          ) : null}

          {snap.status === 'done' ? (
            <p className="text-[12px] leading-relaxed text-ink-subtle">{t('snap.disclaimer')}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FollowUpTurn({ turn }: { turn: SnapFollowUp }) {
  const { t } = useI18n();
  const pending = turn.status === 'pending' || turn.status === 'searching';

  return (
    <article className="flex flex-col gap-2">
      <p className="text-[13.5px] font-medium text-ink">{turn.question}</p>
      <div className="border-l-2 border-line pl-3.5">
        {pending ? (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-[13px] text-ink-muted"
          >
            {turn.status === 'searching' ? (
              <Globe size={13} aria-hidden className="animate-pulse text-info-text" />
            ) : (
              <Loader2 size={13} aria-hidden className="animate-spin" />
            )}
            {turn.status === 'searching' ? t('ask.searching') : t('snap.followUpThinking')}
          </p>
        ) : turn.status === 'error' && turn.error ? (
          <p className="text-[13px] text-danger-text">{t(ERROR_KEY[turn.error])}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {turn.usedWeb ? <SourceBadges sources={['web', 'ai']} /> : null}
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">
              {normaliseMath(turn.text ?? '')}
            </p>
            {turn.degraded === 'web_unavailable' ? (
              <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[12.5px] text-warn-text">
                {t('ask.warn.webUnavailable')}
              </p>
            ) : null}
            {turn.sources && turn.sources.length > 0 ? (
              <Panel>
                <ul className="sm-divide">
                  {turn.sources.map((source) => (
                    <li key={source.url}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-3.5 py-2 transition-colors hover:bg-surface-muted/70"
                      >
                        <span className="block break-words text-[13px] font-medium text-ink">
                          {source.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-ink-subtle">
                          {source.domain}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
