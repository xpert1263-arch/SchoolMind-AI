import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CornerDownLeft,
  Globe,
  Info,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { useAsk } from '@/lib/ask/useAsk';
import type { AskTurn } from '@/lib/ask/types';
import { Button } from '@/components/ui/Button';
import { Panel } from '@/components/ui/Surface';
import { AnswerBlockView, SourceBadges } from './AnswerBlocks';

const SUGGESTION_KEYS: TranslationKey[] = [
  'ask.s1',
  'ask.s2',
  'ask.s3',
  'ask.s4',
  'ask.s5',
  'ask.s6',
];

const MAX_QUESTION = 1000;

/**
 * AskMySchool — AI search inside the school operating system.
 * Deliberately not a messenger: a question is a heading, an answer is
 * structured content, and every answer says where it came from.
 */
export function AskSchool() {
  const { t } = useI18n();
  const { turns, capabilities, busy, ask, clear } = useAsk();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const hasTurns = turns.length > 0;

  useEffect(() => {
    if (hasTurns) feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, hasTurns]);

  const submit = (value: string) => {
    const question = value.trim();
    if (!question || busy) return;
    ask(question);
    setDraft('');
    const el = inputRef.current;
    if (el) el.style.height = 'auto';
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(draft);
    }
  };

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
            {t('nav.askSchool')}
          </h1>
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            {t('ask.subtitle')}
          </p>
        </div>
        {hasTurns ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clear}
            iconLeft={<X size={14} aria-hidden />}
            className="shrink-0"
          >
            {t('ask.clear')}
          </Button>
        ) : null}
      </header>

      {/* ---- composer ------------------------------------------------ */}
      <form onSubmit={onSubmit}>
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2 shadow-subtle transition-colors focus-within:border-accent">
          <Search size={17} aria-hidden className="mb-2.5 ml-2 shrink-0 text-ink-subtle" />
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MAX_QUESTION}
            onChange={(e) => {
              setDraft(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={onKeyDown}
            placeholder={t('ask.placeholder')}
            aria-label={t('ask.placeholder')}
            className="min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[15px] text-ink outline-none placeholder:text-ink-subtle"
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!draft.trim() || busy}
            className="shrink-0"
            iconRight={
              busy ? (
                <Loader2 size={14} aria-hidden className="animate-spin" />
              ) : (
                <CornerDownLeft size={14} aria-hidden />
              )
            }
          >
            <span className="hidden sm:inline">{t('ask.send')}</span>
          </Button>
        </div>
      </form>

      {/* ---- capability notice --------------------------------------- */}
      {capabilities && !capabilities.aiConfigured ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-warn-text">{t('ask.noKeyTitle')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-warn-text/90">
              {t('ask.noKeyBody')}
            </p>
          </div>
        </div>
      ) : null}

      {/* ---- feed or starting state ---------------------------------- */}
      {hasTurns ? (
        <div className="flex flex-col gap-8">
          {turns.map((turn) => (
            <TurnView key={turn.id} turn={turn} onRetry={() => ask(turn.question)} busy={busy} />
          ))}
          <div ref={feedEndRef} />
        </div>
      ) : (
        <StartState onPick={submit} />
      )}

      <p className="pt-2 text-[12px] leading-relaxed text-ink-subtle">{t('ask.disclaimer')}</p>
    </div>
  );
}

function StartState({ onPick }: { onPick: (q: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col items-start gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
          <Sparkles size={17} aria-hidden />
        </span>
        <p className="text-[15px] font-semibold text-ink">{t('ask.emptyTitle')}</p>
        <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-muted">{t('ask.emptyBody')}</p>
      </Panel>

      <section>
        <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          {t('ask.suggestions')}
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SUGGESTION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onPick(t(key))}
              className="group flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left transition-colors hover:border-accent-line hover:bg-accent-soft/50"
            >
              <span className="min-w-0 text-[13.5px] text-ink">{t(key)}</span>
              <ArrowRight
                size={14}
                aria-hidden
                className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text"
              />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TurnView({
  turn,
  onRetry,
  busy,
}: {
  turn: AskTurn;
  onRetry: () => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const pending = turn.status === 'thinking' || turn.status === 'searching';

  return (
    <article className="flex flex-col gap-3.5">
      <h2 className="flex items-start gap-2.5 text-[16px] font-semibold leading-snug text-ink sm:text-[17px]">
        <Search size={16} aria-hidden className="mt-1 shrink-0 text-ink-subtle" />
        <span className="min-w-0 break-words">{turn.question}</span>
      </h2>

      <div className="border-l-2 border-line pl-4 sm:pl-5">
        {/* The waiting line is NOT inside AnimatePresence, and the
            answer is not held back by mode="wait".

            Both choices exist for the same reason: an exit animation
            needs requestAnimationFrame, and browsers suspend that for
            a hidden tab. Under mode="wait" the answer would wait for
            a frame that never comes, so a student who switched away
            mid-question returned to a spinner that never resolved.
            Rendering the waiting line as a plain element lets it
            disappear the instant the answer exists, in every
            visibility state. */}
        {pending ? (
          <p
            className="flex items-center gap-2 py-1 text-[13.5px] text-ink-muted"
            role="status"
            aria-live="polite"
          >
              {turn.status === 'searching' ? (
                <Globe size={14} aria-hidden className="animate-pulse text-info-text" />
              ) : (
                <Loader2 size={14} aria-hidden className="animate-spin" />
              )}
            {turn.status === 'searching' ? t('ask.searching') : t('ask.thinking')}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {!pending ? (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
              className="flex flex-col gap-3.5"
            >
              <SourceBadges sources={turn.sources} />

              {turn.blocks.map((block, index) => (
                <AnswerBlockView key={index} block={block} />
              ))}

              {/* Live search could not be checked, so nothing was
                  answered. Offer the one thing that might help. */}
              {turn.withheld ? (
                <div className="pt-0.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onRetry}
                    disabled={busy}
                    iconLeft={<RotateCcw size={13} aria-hidden />}
                  >
                    {t('ask.retry')}
                  </Button>
                </div>
              ) : null}

              {turn.actions.length > 0 ? (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {turn.actions.map((action) => (
                    <Link
                      key={action.to}
                      to={action.to}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5',
                        'text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-muted',
                      )}
                    >
                      {t(action.labelKey)}
                      <ArrowRight size={13} aria-hidden />
                    </Link>
                  ))}
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </article>
  );
}
