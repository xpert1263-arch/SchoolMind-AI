import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  CircleHelp,
  CornerDownLeft,
  GraduationCap,
  Info,
  Lightbulb,
  Loader2,
  MinusCircle,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { normaliseMath } from '@/lib/snap/mathText';
import { useTutor } from '@/lib/tutor/useTutor';
import {
  TUTOR_MODES,
  type Difficulty,
  type TutorErrorCode,
  type TutorMode,
  type TutorTurn,
  type Verdict,
} from '@/lib/tutor/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Surface';
import { SourceBadges } from '../ask/AnswerBlocks';

/* ------------------------------------------------------------------
   AI Tutor.

   The teaching loop is the design: every turn ends in a question, the
   answer box is the main control, and the three side actions — hint,
   simpler, another example — are the things a student actually asks a
   tutor for. Hints are already on the page when the turn arrives, so
   asking for one costs nothing.
   ------------------------------------------------------------------ */

const ERROR_KEY: Record<TutorErrorCode, TranslationKey> = {
  missing_api_key: 'tutor.errNoKey',
  rate_limited: 'tutor.errRateLimited',
  network: 'tutor.errNetwork',
  timeout: 'tutor.errTimeout',
  upstream_error: 'tutor.errUpstream',
  malformed_response: 'tutor.errUpstream',
  empty_response: 'tutor.errUpstream',
  bad_request: 'tutor.errUpstream',
  server_error: 'tutor.errUpstream',
};

const MODE_KEY: Record<TutorMode, TranslationKey> = {
  explain: 'tutor.modeExplain',
  practice: 'tutor.modePractice',
  test: 'tutor.modeTest',
};

const MODE_HINT_KEY: Record<TutorMode, TranslationKey> = {
  explain: 'tutor.modeExplainHint',
  practice: 'tutor.modePracticeHint',
  test: 'tutor.modeTestHint',
};

const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'tutor.easy',
  medium: 'tutor.medium',
  hard: 'tutor.hard',
};

const VERDICT_KEY: Record<Verdict, TranslationKey> = {
  correct: 'tutor.verdictCorrect',
  partial: 'tutor.verdictPartial',
  incorrect: 'tutor.verdictIncorrect',
  unclear: 'tutor.verdictUnclear',
};

const VERDICT_TONE: Record<Verdict, string> = {
  correct: 'border-success-line bg-success-soft text-success-text',
  partial: 'border-warn-line bg-warn-soft text-warn-text',
  incorrect: 'border-danger-line bg-danger-soft text-danger-text',
  unclear: 'border-line bg-surface-muted text-ink-muted',
};

const VERDICT_ICON: Record<Verdict, typeof CheckCircle2> = {
  correct: CheckCircle2,
  partial: MinusCircle,
  incorrect: XCircle,
  unclear: CircleHelp,
};

/** Starting points, so an empty topic box is not the first hurdle. */
const TOPIC_SUGGESTIONS: Record<string, string[]> = {
  math: ['Kvadrat tenglamalar', 'Progressiyalar', 'Foiz masalalari'],
  physics: ['Nyuton qonunlari', 'Tezlanish', 'Energiya saqlanish qonuni'],
  chemistry: ['Atom tuzilishi', 'Oksidlar', 'Reaksiya tenglamalari'],
  biology: ['Fotosintez', 'Hujayra tuzilishi', 'Qon aylanish tizimi'],
  english: ['Present Perfect', 'Phrasal verbs', 'Reported speech'],
  history: ['Amir Temur davri', 'Buyuk ipak yoʻli', 'XX asr islohotlari'],
  native: ['Soʻz turkumlari', 'Gap boʻlaklari', 'Insho yozish'],
  it: ['Algoritm va blok-sxema', 'Shartli operatorlar', 'Massivlar'],
};

export function AiTutor() {
  const { t } = useI18n();
  const tutor = useTutor();
  const location = useLocation();
  const [subjectId, setSubjectId] = useState('');
  const [topic, setTopic] = useState('');
  const [mode, setMode] = useState<TutorMode>('explain');
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const { session } = tutor;

  /* Default to the first subject once the student's list is known. */
  useEffect(() => {
    if (!subjectId && tutor.subjects.length > 0) setSubjectId(tutor.subjects[0].id);
  }, [subjectId, tutor.subjects]);

  /* Arriving from a quiz mistake: the subject and topic are filled in
     and nothing else happens. Starting the lesson stays the student's
     decision, so navigating here never spends a request. */
  const handover = location.state as { subjectId?: string; topic?: string } | null;
  const handoverKey = `${handover?.subjectId ?? ''}|${handover?.topic ?? ''}`;
  const appliedRef = useRef('');
  useEffect(() => {
    if (!handover?.topic || appliedRef.current === handoverKey) return;
    appliedRef.current = handoverKey;
    if (handover.subjectId && tutor.subjects.some((s) => s.id === handover.subjectId)) {
      setSubjectId(handover.subjectId);
    }
    setTopic(handover.topic);
  }, [handover, handoverKey, tutor.subjects]);

  useEffect(() => {
    if (session?.turns.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.turns.length, session?.revealedHints]);

  const begin = (event: FormEvent) => {
    event.preventDefault();
    if (!subjectId || !topic.trim() || tutor.busy) return;
    tutor.start(subjectId, topic, mode);
  };

  const sendAnswer = () => {
    if (!draft.trim() || tutor.busy) return;
    tutor.answer(draft);
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      sendAnswer();
    }
  };

  const last = session?.turns[session.turns.length - 1];
  const awaitingAnswer = Boolean(last && last.status === 'done' && last.question);
  const subjectName = session
    ? (tutor.subjects.find((s) => s.id === session.subjectId)?.name ?? session.subjectId)
    : '';

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-accent-text">
          <GraduationCap size={13} aria-hidden />
          {t('tutor.eyebrow')}
        </p>
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          {t('tutor.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('tutor.subtitle')}
        </p>
      </header>

      {tutor.capabilities && !tutor.capabilities.aiConfigured ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn-line bg-warn-soft px-3.5 py-3">
          <Info size={15} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-warn-text">{t('tutor.noKeyTitle')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-warn-text/90">
              {t('tutor.noKeyBody')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-8">
        {/* ---- left: the lesson's settings ---- */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--topbar-h)+24px)] lg:self-start">
          {session ? (
            <SessionPanel
              subjectName={subjectName}
              topic={session.topic}
              mode={session.mode}
              difficulty={session.difficulty}
              answered={session.progress.answered}
              correct={session.progress.correct}
              hintsUsed={session.progress.hintsUsed}
              busy={tutor.busy}
              onMode={tutor.setMode}
              onReset={() => {
                tutor.reset();
                setDraft('');
              }}
            />
          ) : (
            <form onSubmit={begin} className="flex flex-col gap-4">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('tutor.setupTitle')}
              </h2>

              <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
                <Field label={t('tutor.subject')} htmlFor="tutor-subject">
                  <Select
                    id="tutor-subject"
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setTopic('');
                    }}
                  >
                    {tutor.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t('tutor.topic')} htmlFor="tutor-topic" hint={t('tutor.topicHint')}>
                  <TextInput
                    id="tutor-topic"
                    value={topic}
                    maxLength={120}
                    placeholder={t('tutor.topicPlaceholder')}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </Field>

                {TOPIC_SUGGESTIONS[subjectId] ? (
                  <div className="flex flex-wrap gap-1.5">
                    {TOPIC_SUGGESTIONS[subjectId].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setTopic(suggestion)}
                        className="rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-ink"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                <fieldset className="min-w-0">
                  <legend className="mb-2 text-[13px] font-medium text-ink">
                    {t('tutor.modeTitle')}
                  </legend>
                  <div className="flex flex-col gap-1.5">
                    {TUTOR_MODES.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        aria-pressed={mode === value}
                        className={cn(
                          'rounded-md border px-3 py-2 text-left transition-colors',
                          mode === value
                            ? 'border-accent bg-accent-soft'
                            : 'border-line bg-surface hover:border-line-strong',
                        )}
                      >
                        <span
                          className={cn(
                            'block text-[13px] font-medium',
                            mode === value ? 'text-accent-text' : 'text-ink',
                          )}
                        >
                          {t(MODE_KEY[value])}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink-subtle">
                          {t(MODE_HINT_KEY[value])}
                        </span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!topic.trim() || tutor.busy}
                className="w-full"
                iconLeft={
                  tutor.busy ? (
                    <Loader2 size={16} aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles size={16} aria-hidden />
                  )
                }
              >
                {tutor.busy ? t('tutor.starting') : t('tutor.start')}
              </Button>
            </form>
          )}
        </div>

        {/* ---- right: the lesson ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          {!session ? (
            <EmptyState
              icon={<GraduationCap size={17} aria-hidden />}
              title={t('tutor.emptyTitle')}
              body={t('tutor.emptyBody')}
            />
          ) : null}

          {session?.turns.map((turn, index) => (
            <TurnView
              key={turn.id}
              turn={turn}
              isLast={index === session.turns.length - 1}
              revealedHints={session.revealedHints}
            />
          ))}

          {session && tutor.error && last?.status === 'error' ? (
            <p className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-[13px] leading-relaxed text-danger-text">
              <Info size={14} aria-hidden className="mt-0.5 shrink-0" />
              {t(ERROR_KEY[tutor.error])}
            </p>
          ) : null}

          {session && !tutor.busy ? (
            <section className="flex flex-col gap-3 border-t border-line pt-5">
              {awaitingAnswer ? (
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-subtle focus-within:border-accent">
                  <input
                    type="text"
                    value={draft}
                    maxLength={600}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder={t('tutor.answerPlaceholder')}
                    aria-label={t('tutor.answerPlaceholder')}
                    className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-subtle"
                  />
                  <Button
                    variant="primary"
                    onClick={sendAnswer}
                    disabled={!draft.trim()}
                    iconRight={<CornerDownLeft size={14} aria-hidden />}
                  >
                    <span className="hidden sm:inline">{t('tutor.answerSend')}</span>
                  </Button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-1.5">
                {awaitingAnswer && last && session.revealedHints < last.hints.length ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={tutor.revealHint}
                    iconLeft={<Lightbulb size={13} aria-hidden />}
                  >
                    {t('tutor.hint')}
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={tutor.simplify}>
                  {t('tutor.simplify')}
                </Button>
                <Button variant="secondary" size="sm" onClick={tutor.example}>
                  {t('tutor.example')}
                </Button>
                <Button variant="secondary" size="sm" onClick={tutor.next}>
                  {t('tutor.next')}
                </Button>
                <Button variant="ghost" size="sm" onClick={tutor.findSources}>
                  {t('tutor.sources')}
                </Button>
              </div>
            </section>
          ) : null}

          {session && tutor.busy ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-[14px] text-ink-muted"
            >
              <Loader2 size={15} aria-hidden className="animate-spin" />
              {t('tutor.thinking')}
            </p>
          ) : null}

          {session ? (
            <p className="text-[12px] leading-relaxed text-ink-subtle">{t('tutor.disclaimer')}</p>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

function SessionPanel({
  subjectName,
  topic,
  mode,
  difficulty,
  answered,
  correct,
  hintsUsed,
  busy,
  onMode,
  onReset,
}: {
  subjectName: string;
  topic: string;
  mode: TutorMode;
  difficulty: Difficulty;
  answered: number;
  correct: number;
  hintsUsed: number;
  busy: boolean;
  onMode: (mode: TutorMode) => void;
  onReset: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {t('tutor.progressTitle')}
      </h2>

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-ink-subtle">{subjectName}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{topic}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-[12.5px]">
          <Stat label={t('tutor.answered')} value={answered} />
          <Stat label={t('tutor.correct')} value={correct} />
          <Stat label={t('tutor.hintsUsed')} value={hintsUsed} />
        </div>

        <div className="border-t border-line pt-3">
          <p className="mb-1.5 text-[12px] font-medium text-ink">{t('tutor.difficulty')}</p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[12px] font-medium text-accent-text">
            {t(DIFFICULTY_KEY[difficulty])}
          </span>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-subtle">
            {t('tutor.difficultyNote')}
          </p>
        </div>

        <fieldset className="min-w-0 border-t border-line pt-3">
          <legend className="sr-only">{t('tutor.modeTitle')}</legend>
          <p className="mb-2 text-[12px] font-medium text-ink">{t('tutor.modeTitle')}</p>
          <div className="flex flex-wrap gap-1.5">
            {TUTOR_MODES.map((value) => (
              <button
                key={value}
                type="button"
                disabled={busy}
                onClick={() => onMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50',
                  mode === value
                    ? 'border-accent bg-accent-soft text-accent-text'
                    : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                {t(MODE_KEY[value])}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <Button
        variant="secondary"
        onClick={onReset}
        disabled={busy}
        iconLeft={<RotateCcw size={14} aria-hidden />}
      >
        {t('tutor.newSession')}
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span data-numeric className="text-[16px] font-semibold tabular-nums text-ink">
        {value}
      </span>
      <span className="text-ink-subtle">{label}</span>
    </span>
  );
}

function TurnView({
  turn,
  isLast,
  revealedHints,
}: {
  turn: TutorTurn;
  isLast: boolean;
  revealedHints: number;
}) {
  const { t } = useI18n();

  if (turn.status === 'pending') return null;
  if (turn.status === 'error') return null;

  const VerdictIcon = turn.verdict ? VERDICT_ICON[turn.verdict] : null;
  const hints = isLast ? turn.hints.slice(0, revealedHints) : [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="flex min-w-0 flex-col gap-3"
    >
      {turn.studentText ? (
        <p className="self-end rounded-xl rounded-br-sm bg-surface-muted px-3.5 py-2 text-[13.5px] text-ink">
          {turn.studentText}
        </p>
      ) : null}

      {turn.verdict && VerdictIcon ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-md border px-3.5 py-2.5',
            VERDICT_TONE[turn.verdict],
          )}
        >
          <VerdictIcon size={15} aria-hidden className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold">{t(VERDICT_KEY[turn.verdict])}</p>
            {turn.feedback ? (
              <p className="mt-1 text-[13px] leading-relaxed">{normaliseMath(turn.feedback)}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {turn.usedWeb ? <SourceBadges sources={['web', 'ai']} /> : null}

      {turn.explanation ? (
        <Block title={t('tutor.explanationTitle')} text={turn.explanation} />
      ) : null}
      {turn.example ? <Block title={t('tutor.exampleTitle')} text={turn.example} muted /> : null}

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

      {turn.question ? (
        <div className="rounded-lg border border-accent-line bg-accent-soft/50 px-4 py-3">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent-text">
            {t('tutor.questionTitle')}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">
            {normaliseMath(turn.question)}
          </p>
        </div>
      ) : null}

      {hints.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {hints.map((hint, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-md border border-dashed border-line bg-surface-muted/50 px-3 py-2 text-[13px] leading-relaxed text-ink-muted"
            >
              <Lightbulb size={13} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
              <span className="min-w-0">
                <span className="font-medium text-ink">{t('tutor.hintTitle', { n: i + 1 })}: </span>
                {normaliseMath(hint)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </motion.article>
  );
}

function Block({ title, text, muted }: { title: string; text: string; muted?: boolean }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {title}
      </h3>
      <p
        className={cn(
          'whitespace-pre-line text-[14px] leading-relaxed',
          muted ? 'text-ink-muted' : 'text-ink',
        )}
      >
        {normaliseMath(text)}
      </p>
    </section>
  );
}
