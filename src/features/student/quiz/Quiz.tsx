import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  GraduationCap,
  Info,
  Lightbulb,
  Loader2,
  MinusCircle,
  RotateCcw,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import { subjectById } from '@/data/queries';
import { resolveText, type ID } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';
import { normaliseMath } from '@/lib/snap/mathText';
import { useQuiz } from '@/lib/quiz/useQuiz';
import {
  QUIZ_DIFFICULTIES,
  QUIZ_LENGTHS,
  type QuizAnswer,
  type QuizDifficulty,
  type QuizErrorCode,
  type QuizLength,
  type QuizQuestion,
  type QuizVerdict,
} from '@/lib/quiz/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { Field, Select, TextInput } from '@/components/ui/Field';
import { Panel } from '@/components/ui/Surface';

/* ------------------------------------------------------------------
   Quiz — the learning loop.

   One question on screen at a time, and the explanation after each
   answer is the point of the feature; the score at the end is just
   the tally. Where the questions came from is always stated, so an
   AI quiz and SchoolMind's own questions are never confused.
   ------------------------------------------------------------------ */

const ERROR_KEY: Record<QuizErrorCode, TranslationKey> = {
  missing_api_key: 'quiz.noKeyBody',
  rate_limited: 'quiz.errRateLimited',
  network: 'quiz.errNetwork',
  timeout: 'quiz.errTimeout',
  upstream_error: 'quiz.errUpstream',
  malformed_response: 'quiz.errUpstream',
  empty_response: 'quiz.errUpstream',
  bad_request: 'quiz.errUpstream',
  server_error: 'quiz.errUpstream',
};

const DIFFICULTY_KEY: Record<QuizDifficulty, TranslationKey> = {
  easy: 'quiz.easy',
  medium: 'quiz.medium',
  hard: 'quiz.hard',
};

const VERDICT_KEY: Record<QuizVerdict, TranslationKey> = {
  correct: 'quiz.verdictCorrect',
  partial: 'quiz.verdictPartial',
  incorrect: 'quiz.verdictIncorrect',
  unclear: 'quiz.verdictUnclear',
};

const VERDICT_TONE: Record<QuizVerdict, string> = {
  correct: 'border-success-line bg-success-soft text-success-text',
  partial: 'border-warn-line bg-warn-soft text-warn-text',
  incorrect: 'border-danger-line bg-danger-soft text-danger-text',
  unclear: 'border-line bg-surface-muted text-ink-muted',
};

const VERDICT_ICON: Record<QuizVerdict, typeof CheckCircle2> = {
  correct: CheckCircle2,
  partial: MinusCircle,
  incorrect: XCircle,
  unclear: CircleHelp,
};

export function Quiz() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const quiz = useQuiz();

  const [subjectId, setSubjectId] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<QuizDifficulty>('medium');
  const [length, setLength] = useState<QuizLength>(5);
  const [typed, setTyped] = useState('');
  const [hintShown, setHintShown] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { session } = quiz;

  useEffect(() => {
    if (!subjectId && quiz.subjects.length > 0) setSubjectId(quiz.subjects[0].id);
  }, [subjectId, quiz.subjects]);

  /* A new question starts clean. */
  useEffect(() => {
    setTyped('');
    setHintShown(false);
  }, [session?.index, session?.id]);

  useEffect(() => {
    if (session) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.index, quiz.currentAnswer]);

  const question = session?.questions[session.index] ?? null;
  const answer = quiz.currentAnswer;
  const isLast = session ? session.index >= session.questions.length - 1 : false;

  const begin = (event: FormEvent) => {
    event.preventDefault();
    if (!subjectId || !topic.trim() || quiz.busy) return;
    quiz.start(subjectId, topic, difficulty, length);
  };

  const submitTyped = () => {
    if (!typed.trim() || quiz.busy || answer) return;
    quiz.answer(typed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitTyped();
    }
  };

  /* Hand the tutor a subject and topic, and let the student press the
     button there. Navigating must not spend a request. */
  const openTutor = (tutorTopic: string) => {
    navigate('/student/tutor', {
      state: { subjectId: session?.subjectId, topic: tutorTopic },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-accent-text">
          <Target size={13} aria-hidden />
          {t('quiz.eyebrow')}
        </p>
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          {t('quiz.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('quiz.subtitle')}
        </p>
      </header>

      {quiz.capabilities && !quiz.capabilities.aiConfigured ? (
        <Notice tone="warn" title={t('quiz.noKeyTitle')} body={t('quiz.noKeyBody')} />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-8">
        {/* ---- left: setup, or where you are ---- */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--topbar-h)+24px)] lg:self-start">
          {session ? (
            <ProgressPanel
              subjectName={subjectName(session.subjectId, locale)}
              topic={session.topic}
              index={session.index}
              total={session.questions.length}
              source={session.source}
              difficulty={session.difficulty}
              busy={quiz.busy}
              onDiscard={quiz.discard}
            />
          ) : (
            <form onSubmit={begin} className="flex flex-col gap-4">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('quiz.setupTitle')}
              </h2>

              <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
                <Field label={t('quiz.subject')} htmlFor="quiz-subject">
                  <Select
                    id="quiz-subject"
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setTopic('');
                    }}
                  >
                    {quiz.subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label={t('quiz.topic')} htmlFor="quiz-topic" hint={t('quiz.topicHint')}>
                  <TextInput
                    id="quiz-topic"
                    value={topic}
                    maxLength={120}
                    placeholder={t('quiz.topicPlaceholder')}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </Field>

                {/* Suggestions are this student's own open work, so the
                    quiz can practise what is actually due. */}
                {quiz.topicsFor(subjectId).length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[12px] text-ink-subtle">{t('quiz.fromHomework')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {quiz.topicsFor(subjectId).map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          onClick={() => setTopic(suggestion)}
                          className="max-w-full truncate rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:border-accent-line hover:bg-accent-soft/50 hover:text-ink"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <fieldset className="min-w-0">
                  <legend className="mb-2 text-[13px] font-medium text-ink">
                    {t('quiz.length')}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {QUIZ_LENGTHS.map((value) => (
                      <Choice
                        key={value}
                        active={length === value}
                        onClick={() => setLength(value)}
                      >
                        {t('quiz.lengthValue', { n: value })}
                      </Choice>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="min-w-0">
                  <legend className="mb-2 text-[13px] font-medium text-ink">
                    {t('quiz.difficulty')}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {QUIZ_DIFFICULTIES.map((value) => (
                      <Choice
                        key={value}
                        active={difficulty === value}
                        onClick={() => setDifficulty(value)}
                      >
                        {t(DIFFICULTY_KEY[value])}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!topic.trim() || quiz.busy}
                className="w-full"
                iconLeft={
                  quiz.status === 'generating' ? (
                    <Loader2 size={16} aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles size={16} aria-hidden />
                  )
                }
              >
                {quiz.status === 'generating' ? t('quiz.generating') : t('quiz.start')}
              </Button>

              <HistoryPanel history={quiz.history} signals={quiz.signals} locale={locale} />
            </form>
          )}
        </div>

        {/* ---- right: the loop ---- */}
        <div className="flex min-w-0 flex-col gap-5">
          {!session && quiz.status !== 'generating' ? (
            <EmptyState
              icon={<Target size={17} aria-hidden />}
              title={t('quiz.emptyTitle')}
              body={t('quiz.emptyBody')}
            />
          ) : null}

          {quiz.status === 'generating' ? (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 text-[14px] text-ink-muted"
            >
              <Loader2 size={15} aria-hidden className="animate-spin" />
              {t('quiz.generating')}
            </p>
          ) : null}

          {/* The model failed but the loop runs anyway — say which. */}
          {session?.source === 'bank' && quiz.error ? (
            <Notice
              tone="warn"
              title={t(ERROR_KEY[quiz.error])}
              body={t('quiz.bankNote')}
            />
          ) : null}
          {!session && quiz.error ? (
            <Notice tone="danger" title={t(ERROR_KEY[quiz.error])} />
          ) : null}

          {session && !session.finishedAt && question ? (
            <QuestionView
              question={question}
              index={session.index}
              total={session.questions.length}
              answer={answer}
              typed={typed}
              hintShown={hintShown}
              busy={quiz.busy}
              checking={quiz.status === 'checking'}
              isLast={isLast}
              onTyped={setTyped}
              onKeyDown={onKeyDown}
              onChoose={(optionId) => quiz.answer(optionId)}
              onSubmit={submitTyped}
              onHint={() => setHintShown(true)}
              onNext={quiz.next}
            />
          ) : null}

          {session?.finishedAt ? (
            <ResultView
              subjectName={subjectName(session.subjectId, locale)}
              topic={session.topic}
              questions={session.questions}
              answers={session.answers}
              onAgain={quiz.restart}
              onNew={quiz.discard}
              onTutor={openTutor}
              busy={quiz.busy}
            />
          ) : null}

          {session ? (
            <p className="text-[12px] leading-relaxed text-ink-subtle">{t('quiz.disclaimer')}</p>
          ) : null}

          <div ref={endRef} />
        </div>
      </div>
    </div>
  );
}

function subjectName(id: ID, locale: 'uz' | 'ru'): string {
  try {
    return resolveText(subjectById(id).name, locale);
  } catch {
    return id;
  }
}

function QuestionView({
  question,
  index,
  total,
  answer,
  typed,
  hintShown,
  busy,
  checking,
  isLast,
  onTyped,
  onKeyDown,
  onChoose,
  onSubmit,
  onHint,
  onNext,
}: {
  question: QuizQuestion;
  index: number;
  total: number;
  answer: QuizAnswer | null;
  typed: string;
  hintShown: boolean;
  busy: boolean;
  checking: boolean;
  isLast: boolean;
  onTyped: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChoose: (optionId: string) => void;
  onSubmit: () => void;
  onHint: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const VerdictIcon = answer ? VERDICT_ICON[answer.verdict] : null;

  return (
    <motion.section
      key={question.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="flex min-w-0 flex-col gap-4"
    >
      <p data-numeric className="text-[12px] font-medium uppercase tracking-wide text-ink-subtle">
        {t('quiz.questionOf', { current: index + 1, total })}
      </p>

      <h2 className="whitespace-pre-line text-[16.5px] font-semibold leading-snug text-ink">
        {normaliseMath(question.prompt)}
      </h2>

      {question.type === 'short' ? (
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 shadow-subtle focus-within:border-accent">
          <input
            type="text"
            value={answer ? answer.given : typed}
            maxLength={400}
            disabled={Boolean(answer) || checking}
            onChange={(e) => onTyped(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('quiz.answerPlaceholder')}
            aria-label={t('quiz.answerPlaceholder')}
            className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-ink-subtle disabled:opacity-70"
          />
          {!answer ? (
            <Button
              variant="primary"
              onClick={onSubmit}
              disabled={!typed.trim() || busy}
              iconLeft={checking ? <Loader2 size={14} aria-hidden className="animate-spin" /> : null}
            >
              {checking ? t('quiz.checking') : t('quiz.submit')}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => {
            const chosen = answer?.given === option.id;
            const isCorrect = option.id === question.correctOptionId;
            const reveal = Boolean(answer);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  disabled={reveal || busy}
                  onClick={() => onChoose(option.id)}
                  aria-pressed={chosen}
                  className={cn(
                    'flex w-full items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-left transition-colors',
                    'disabled:cursor-default',
                    reveal && isCorrect
                      ? 'border-success-line bg-success-soft'
                      : reveal && chosen
                        ? 'border-danger-line bg-danger-soft'
                        : 'border-line bg-surface hover:border-accent-line hover:bg-accent-soft/40',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold',
                      reveal && isCorrect
                        ? 'border-success-line text-success-text'
                        : reveal && chosen
                          ? 'border-danger-line text-danger-text'
                          : 'border-line-strong text-ink-subtle',
                    )}
                  >
                    {option.id.replace('o', '')}
                  </span>
                  <span className="min-w-0 text-[14px] leading-relaxed text-ink">
                    {normaliseMath(option.text)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!answer && question.hint ? (
        hintShown ? (
          <p className="flex gap-2 rounded-md border border-dashed border-line bg-surface-muted/50 px-3 py-2 text-[13px] leading-relaxed text-ink-muted">
            <Lightbulb size={13} aria-hidden className="mt-0.5 shrink-0 text-warn-text" />
            <span className="min-w-0">{normaliseMath(question.hint)}</span>
          </p>
        ) : (
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={onHint}
              iconLeft={<Lightbulb size={13} aria-hidden />}
            >
              {t('quiz.hint')}
            </Button>
          </div>
        )
      ) : null}

      {answer && VerdictIcon ? (
        <div className="flex flex-col gap-3">
          <div
            className={cn(
              'flex items-start gap-2 rounded-md border px-3.5 py-2.5',
              VERDICT_TONE[answer.verdict],
            )}
          >
            <VerdictIcon size={15} aria-hidden className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold">{t(VERDICT_KEY[answer.verdict])}</p>
              {answer.verdict === 'unclear' ? (
                <p className="mt-1 text-[13px] leading-relaxed">{t('quiz.uncheckedNote')}</p>
              ) : null}
              {answer.verdict !== 'correct' ? (
                <p className="mt-1 text-[13px] leading-relaxed">
                  {t('quiz.correctAnswerIs', { answer: normaliseMath(question.correctAnswer) })}
                </p>
              ) : null}
            </div>
          </div>

          {answer.feedback ? (
            <section className="min-w-0">
              <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('quiz.whyTitle')}
              </h3>
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
                {normaliseMath(answer.feedback)}
              </p>
            </section>
          ) : null}

          <div>
            <Button
              variant="primary"
              onClick={onNext}
              iconRight={<ArrowRight size={14} aria-hidden />}
            >
              {isLast ? t('quiz.finish') : t('quiz.next')}
            </Button>
          </div>
        </div>
      ) : null}
    </motion.section>
  );
}

function ResultView({
  subjectName: subject,
  topic,
  questions,
  answers,
  onAgain,
  onNew,
  onTutor,
  busy,
}: {
  subjectName: string;
  topic: string;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  onAgain: () => void;
  onNew: () => void;
  onTutor: (topic: string) => void;
  busy: boolean;
}) {
  const { t } = useI18n();
  const correct = answers.filter((a) => a.verdict === 'correct').length;
  const missed = questions.filter((question) => {
    const given = answers.find((a) => a.questionId === question.id);
    return !given || given.verdict !== 'correct';
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="flex min-w-0 flex-col gap-5"
    >
      <header className="min-w-0">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          {t('quiz.resultTitle')}
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">
          {subject} · {topic}
        </p>
        <p
          data-numeric
          className="mt-2 text-[30px] font-semibold leading-none tabular-nums text-ink"
        >
          {t('quiz.score', { correct, total: questions.length })}
        </p>
        <p className="mt-1 text-[13px] text-ink-subtle">{t('quiz.scoreLabel')}</p>
      </header>

      <section className="min-w-0">
        <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
          {t('quiz.reviewTitle')}
        </h3>
        {missed.length === 0 ? (
          <p className="text-[13.5px] text-ink-muted">{t('quiz.reviewNone')}</p>
        ) : (
          <>
            <p className="mb-2 text-[13px] text-ink-muted">
              {t('quiz.reviewCount', { n: missed.length })}
            </p>
            <Panel>
              <ul className="sm-divide">
                {missed.map((question) => (
                  <li key={question.id} className="flex flex-col gap-2 px-3.5 py-3">
                    <p className="text-[13.5px] font-medium leading-snug text-ink">
                      {normaliseMath(question.prompt)}
                    </p>
                    <p className="text-[13px] leading-relaxed text-ink-muted">
                      {t('quiz.correctAnswerIs', {
                        answer: normaliseMath(question.correctAnswer),
                      })}
                    </p>
                    {question.explanation ? (
                      <p className="text-[13px] leading-relaxed text-ink-subtle">
                        {normaliseMath(question.explanation)}
                      </p>
                    ) : null}
                    <div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onTutor(topic)}
                        iconLeft={<GraduationCap size={13} aria-hidden />}
                      >
                        {t('quiz.openTutor')}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          variant="primary"
          onClick={onAgain}
          disabled={busy}
          iconLeft={<RotateCcw size={14} aria-hidden />}
        >
          {t('quiz.againSame')}
        </Button>
        <Button variant="secondary" onClick={onNew} disabled={busy}>
          {t('quiz.newQuiz')}
        </Button>
      </div>
    </motion.section>
  );
}

function ProgressPanel({
  subjectName: subject,
  topic,
  index,
  total,
  source,
  difficulty,
  busy,
  onDiscard,
}: {
  subjectName: string;
  topic: string;
  index: number;
  total: number;
  source: 'ai' | 'bank';
  difficulty: QuizDifficulty;
  busy: boolean;
  onDiscard: () => void;
}) {
  const { t } = useI18n();
  const percent = total === 0 ? 0 : Math.round((index / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {t('quiz.setupTitle')}
      </h2>

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 shadow-subtle">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-ink-subtle">{subject}</p>
          <p className="mt-0.5 text-[15px] font-semibold leading-snug text-ink">{topic}</p>
        </div>

        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={index}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-swift"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium',
              source === 'ai'
                ? 'border-accent-line bg-accent-soft text-accent-text'
                : 'border-line bg-surface-muted text-ink-muted',
            )}
          >
            <Sparkles size={10} aria-hidden />
            {source === 'ai' ? t('quiz.badgeAi') : t('quiz.badgeBank')}
          </span>
          <span className="text-[12px] text-ink-subtle">{t(DIFFICULTY_KEY[difficulty])}</span>
        </div>
      </div>

      <Button variant="secondary" onClick={onDiscard} disabled={busy}>
        {t('quiz.newQuiz')}
      </Button>
    </div>
  );
}

function HistoryPanel({
  history,
  signals,
  locale,
}: {
  history: ReturnType<typeof useQuiz>['history'];
  signals: ReturnType<typeof useQuiz>['signals'];
  locale: 'uz' | 'ru';
}) {
  const { t } = useI18n();

  return (
    <section className="min-w-0">
      <h2 className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {t('quiz.historyTitle')}
      </h2>
      <Panel className="px-4 py-3.5">
        {history.length === 0 ? (
          <p className="text-[13px] text-ink-muted">{t('quiz.historyEmpty')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px]">
              <Stat label={t('quiz.signalsQuizzes')} value={signals.quizzes} />
              <Stat label={t('quiz.signalsAnswered')} value={signals.answered} />
              <Stat label={t('quiz.signalsCorrect')} value={signals.correct} />
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
              {history.slice(0, 4).map((entry) => (
                <li key={entry.id} className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
                  <span className="min-w-0 flex-1 truncate text-ink-muted">
                    {t('quiz.historyRow', {
                      subject: subjectName(entry.subjectId, locale),
                      topic: entry.topic,
                    })}
                  </span>
                  <span data-numeric className="shrink-0 tabular-nums text-ink">
                    {entry.correct}/{entry.total}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-ink-subtle">
          {t('quiz.signalsNote')}
        </p>
      </Panel>
    </section>
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

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'warn' | 'danger';
  title: string;
  body?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3',
        tone === 'warn'
          ? 'border-warn-line bg-warn-soft text-warn-text'
          : 'border-danger-line bg-danger-soft text-danger-text',
      )}
    >
      <Info size={15} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{title}</p>
        {body ? <p className="mt-1 text-[12.5px] leading-relaxed opacity-90">{body}</p> : null}
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
