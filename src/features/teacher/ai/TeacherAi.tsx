import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ClipboardList,
  Info,
  Lightbulb,
  Loader2,
  MessageSquare,
  Save,
  Send,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import type { AssignmentKind, ID } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { isoTeachingFromToday } from '@/lib/dates';
import { LESSON_LENGTHS, type LessonLength, type TeacherAiAction } from '@/lib/teacherAi/types';
import { useTeacherAi } from '@/lib/teacherAi/useTeacherAi';
import { useToast } from '@/state/toast';
import { Button } from '@/components/ui/Button';
import { Field, Select, TextArea, TextInput } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Feedback';
import { Segmented } from '@/components/ui/Segmented';
import { Chip } from '@/components/ui/Status';
import { Panel } from '@/components/ui/Surface';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------
   "O'qituvchi AI" — the teacher's own workspace.

   Structured actions rather than a blank chat box, because a teacher
   opening this at 07:50 wants a lesson plan, not a conversation about
   what they might want.

   Two rules are visible in this file.

   NOTHING PUBLISHES ITSELF. The assignment draft has a Save form with
   a class, a type and a date the teacher chooses, and the draft stays
   a draft until they press it. There is no automatic path from a
   model's output to a pupil's homework list.

   THE SOURCE IS ALWAYS LABELLED. Every result carries a badge saying
   whether it came from AI or from SchoolMind's own template, because
   those are different things and a teacher is entitled to know which
   one they are reading.
   ------------------------------------------------------------------ */

const ACTION_ICON: Record<TeacherAiAction, typeof BookOpen> = {
  lesson: BookOpen,
  assignment: ClipboardList,
  explain: Lightbulb,
  quiz: Target,
  chat: MessageSquare,
};

const ACTION_LABEL: Record<TeacherAiAction, TranslationKey> = {
  lesson: 'teacherAi.actionLesson',
  assignment: 'teacherAi.actionAssignment',
  explain: 'teacherAi.actionExplain',
  quiz: 'teacherAi.actionQuiz',
  chat: 'teacherAi.actionChat',
};

const ACTIONS: TeacherAiAction[] = ['lesson', 'assignment', 'explain', 'quiz', 'chat'];

const DIFFICULTIES: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL: Record<'easy' | 'medium' | 'hard', TranslationKey> = {
  easy: 'quiz.easy',
  medium: 'quiz.medium',
  hard: 'quiz.hard',
};

export function TeacherAi() {
  const { t } = useI18n();
  const ai = useTeacherAi();

  const [action, setAction] = useState<TeacherAiAction>('lesson');
  const [classId, setClassId] = useState<ID>(ai.classes[0]?.id ?? '');
  const [subjectId, setSubjectId] = useState<ID>('');
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState<LessonLength>(45);
  const [note, setNote] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [count, setCount] = useState(5);
  const [question, setQuestion] = useState('');

  /* The class list is this teacher's own; keep the selection inside it. */
  useEffect(() => {
    if (ai.classes.length === 0) return;
    if (!ai.classes.some((entry) => entry.id === classId)) setClassId(ai.classes[0].id);
  }, [ai.classes, classId]);

  const subjects = useMemo(() => (classId ? ai.subjectsFor(classId) : []), [ai, classId]);

  /* A subject this teacher does not teach to the selected class must
     not stay selected when the class changes. */
  useEffect(() => {
    if (subjects.length === 0) return;
    if (!subjects.some((entry) => entry.id === subjectId)) setSubjectId(subjects[0].id);
  }, [subjectId, subjects]);

  const suggestions = useMemo(
    () => (classId && subjectId ? ai.topicsFor(classId, subjectId) : []),
    [ai, classId, subjectId],
  );

  const run = () => {
    if (!classId || !subjectId || !topic.trim()) return;
    if (action === 'lesson') ai.runLesson(classId, subjectId, topic, minutes);
    if (action === 'assignment') ai.runAssignment(classId, subjectId, topic, note);
    if (action === 'explain') ai.runExplain(classId, subjectId, topic);
    if (action === 'quiz') ai.runQuiz(classId, subjectId, topic, difficulty, count);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.08em] text-accent-text">
          <Sparkles size={13} aria-hidden />
          {t('teacherAi.eyebrow')}
        </p>
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">
          {t('teacherAi.heading')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          {t('teacherAi.subtitle')}
        </p>
      </header>

      {ai.capabilities && !ai.capabilities.aiConfigured ? (
        <Notice tone="warn" title={t('teacherAi.noKeyTitle')} body={t('teacherAi.noKeyBody')} />
      ) : null}

      <Segmented
        ariaLabel={t('teacherAi.actionsLabel')}
        value={action}
        onChange={setAction}
        options={ACTIONS.map((value) => ({ value, label: t(ACTION_LABEL[value]) }))}
      />

      {action === 'chat' ? (
        <ChatPanel
          chat={ai.chat}
          busy={ai.busy}
          errorText={ai.errorText}
          question={question}
          onQuestion={setQuestion}
          onAsk={() => {
            ai.ask(question);
            setQuestion('');
          }}
          onClear={ai.clearChat}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-8">
          {/* ---- what to produce ---- */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+24px)] lg:self-start">
            <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-subtle">
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
                {t('teacherAi.setupTitle')}
              </h2>

              <Field label={t('teacherAi.class')} hint={t('teacherAi.classHint')}>
                <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
                  {ai.classes.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('teacherAi.subject')}>
                <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  {subjects.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={t('teacherAi.topic')}>
                <TextInput
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t('teacherAi.topicPlaceholder')}
                  maxLength={140}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !ai.busy) run();
                  }}
                />
              </Field>

              {suggestions.length > 0 ? (
                <div className="min-w-0">
                  <p className="mb-1.5 text-[12px] text-ink-subtle">
                    {t('teacherAi.fromYourWork')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setTopic(suggestion)}
                        className="max-w-full truncate rounded-full border border-line bg-surface-muted px-2.5 py-1 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {action === 'lesson' ? (
                <fieldset className="min-w-0">
                  <legend className="mb-2 text-[13px] font-medium text-ink">
                    {t('teacherAi.lessonLength')}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {LESSON_LENGTHS.map((value) => (
                      <Choice
                        key={value}
                        active={minutes === value}
                        onClick={() => setMinutes(value)}
                      >
                        {t('teacherAi.minutes', { n: value })}
                      </Choice>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {action === 'assignment' ? (
                <Field label={t('teacherAi.note')} optional hint={t('teacherAi.noteHint')}>
                  <TextArea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('teacherAi.notePlaceholder')}
                    maxLength={300}
                  />
                </Field>
              ) : null}

              {action === 'quiz' ? (
                <>
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-[13px] font-medium text-ink">
                      {t('quiz.difficulty')}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {DIFFICULTIES.map((value) => (
                        <Choice
                          key={value}
                          active={difficulty === value}
                          onClick={() => setDifficulty(value)}
                        >
                          {t(DIFFICULTY_LABEL[value])}
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-[13px] font-medium text-ink">
                      {t('quiz.length')}
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {[5, 10].map((value) => (
                        <Choice key={value} active={count === value} onClick={() => setCount(value)}>
                          {t('quiz.lengthValue', { n: value })}
                        </Choice>
                      ))}
                    </div>
                  </fieldset>
                </>
              ) : null}

              <Button
                variant="primary"
                disabled={ai.busy || !topic.trim() || !classId || !subjectId}
                onClick={run}
                iconLeft={
                  ai.busy ? (
                    <Loader2 size={15} aria-hidden className="animate-spin" />
                  ) : (
                    <Sparkles size={15} aria-hidden />
                  )
                }
              >
                {ai.busy ? t('teacherAi.working') : t(ACTION_LABEL[action])}
              </Button>
            </section>

            <p className="text-[12px] leading-relaxed text-ink-subtle">
              {t('teacherAi.scopeNote')}
            </p>
          </div>

          {/* ---- what came back ---- */}
          <div className="flex min-w-0 flex-col gap-4">
            {ai.errorText ? (
              <Notice tone="warn" title={t('teacherAi.degradedTitle')} body={ai.errorText} />
            ) : null}

            {ai.busy ? (
              <Panel className="flex items-center gap-2.5 px-4 py-6">
                <Loader2 size={16} aria-hidden className="animate-spin text-accent-text" />
                <p className="text-[13px] text-ink-muted">{t('teacherAi.working')}</p>
              </Panel>
            ) : null}

            {!ai.busy && !ai.result ? (
              <EmptyState
                icon={<Sparkles size={17} aria-hidden />}
                title={t('teacherAi.emptyTitle')}
                body={t('teacherAi.emptyBody')}
              />
            ) : null}

            {!ai.busy && ai.result ? (
              <ResultView result={ai.result} onSave={ai.saveDraft} onClear={ai.clearResult} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- small shared bits ----------------------------------------------- */

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

function Notice({
  tone,
  title,
  body,
}: {
  tone: 'warn' | 'info';
  title: string;
  body: string;
}) {
  const warn = tone === 'warn';
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3.5 py-3',
        warn ? 'border-warn-line bg-warn-soft' : 'border-info-line bg-info-soft',
      )}
    >
      <Info
        size={15}
        aria-hidden
        className={cn('mt-0.5 shrink-0', warn ? 'text-warn-text' : 'text-info-text')}
      />
      <div className="min-w-0">
        <p className={cn('text-[13px] font-medium', warn ? 'text-warn-text' : 'text-info-text')}>
          {title}
        </p>
        <p
          className={cn(
            'mt-1 text-[12.5px] leading-relaxed',
            warn ? 'text-warn-text/90' : 'text-info-text/90',
          )}
        >
          {body}
        </p>
      </div>
    </div>
  );
}

function SourceBadge({ source }: { source: 'ai' | 'schoolmind' }) {
  const { t } = useI18n();
  return (
    <Chip tone={source === 'ai' ? 'accent' : 'neutral'}>
      {source === 'ai' ? t('teacherAi.badgeAi') : t('teacherAi.badgeSchoolmind')}
    </Chip>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {title}
      </h3>
      <div className="text-[13.5px] leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <li key={`${i}-${item.slice(0, 12)}`} className="flex gap-2">
          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
          <span className="min-w-0 whitespace-pre-line">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---- results --------------------------------------------------------- */

function ResultView({
  result,
  onSave,
  onClear,
}: {
  result: NonNullable<ReturnType<typeof useTeacherAi>['result']>;
  onSave: ReturnType<typeof useTeacherAi>['saveDraft'];
  onClear: () => void;
}) {
  const { t } = useI18n();
  const Icon = ACTION_ICON[result.kind];

  return (
    <Panel className="min-w-0 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{result.scope.topic}</h2>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-subtle">
              {result.scope.classLabel} · {result.scope.subject}
              {result.kind === 'lesson' ? ` · ${t('teacherAi.minutes', { n: result.minutes })}` : ''}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SourceBadge source={result.source} />
          <Button variant="ghost" size="icon" onClick={onClear} aria-label={t('common.close')}>
            <Trash2 size={15} aria-hidden />
          </Button>
        </div>
      </header>

      {result.kind === 'lesson' ? (
        <div className="flex flex-col gap-4">
          <Block title={t('teacherAi.lessonObjective')}>{result.plan.objective}</Block>
          <Block title={t('teacherAi.lessonWarmUp')}>{result.plan.warmUp}</Block>
          <Block title={t('teacherAi.lessonExplanation')}>
            <Lines items={result.plan.explanation} />
          </Block>
          <Block title={t('teacherAi.lessonExamples')}>
            <Lines items={result.plan.examples} />
          </Block>
          <Block title={t('teacherAi.lessonPractice')}>
            <Lines items={result.plan.practice} />
          </Block>
          <Block title={t('teacherAi.lessonActivity')}>{result.plan.activity}</Block>
          <Block title={t('teacherAi.lessonChecks')}>
            <Lines items={result.plan.checks} />
          </Block>
          <Block title={t('teacherAi.lessonConclusion')}>{result.plan.conclusion}</Block>
          {result.plan.homework ? (
            <Block title={t('teacherAi.lessonHomework')}>{result.plan.homework}</Block>
          ) : null}
        </div>
      ) : null}

      {result.kind === 'explain' ? (
        <div className="flex flex-col gap-4">
          <Block title={t('teacherAi.methodSimple')}>{result.method.simple}</Block>
          <Block title={t('teacherAi.methodAnalogy')}>{result.method.analogy}</Block>
          <Block title={t('teacherAi.methodMisconception')}>{result.method.misconception}</Block>
          <Block title={t('teacherAi.methodActivity')}>{result.method.activity}</Block>
          <Block title={t('teacherAi.methodCheck')}>{result.method.checkQuestion}</Block>
        </div>
      ) : null}

      {result.kind === 'quiz' ? (
        <div className="flex flex-col gap-3.5">
          <p className="text-[12.5px] text-ink-subtle">{t('teacherAi.quizDraftNote')}</p>
          {result.quiz.questions.map((entry, index) => (
            <div key={entry.id} className="rounded-lg border border-line bg-surface-muted/50 p-3.5">
              <p className="text-[13.5px] font-medium text-ink">
                {index + 1}. {entry.prompt}
              </p>
              {entry.options.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {entry.options.map((option) => (
                    <li
                      key={option.id}
                      className={cn(
                        'flex items-center gap-2 text-[13px]',
                        option.id === entry.correctOptionId
                          ? 'font-medium text-success-text'
                          : 'text-ink-muted',
                      )}
                    >
                      {option.id === entry.correctOptionId ? (
                        <Check size={13} aria-hidden className="shrink-0" />
                      ) : (
                        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-ink-subtle" />
                      )}
                      {option.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-success-text">
                  {t('quiz.correctAnswerIs', { answer: entry.correctAnswer })}
                </p>
              )}
              {entry.explanation ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-ink-subtle">
                  {entry.explanation}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {result.kind === 'assignment' ? (
        <AssignmentDraftView result={result} onSave={onSave} />
      ) : null}
    </Panel>
  );
}

/* ---- the draft a teacher may choose to publish ----------------------- */

const KINDS: AssignmentKind[] = ['homework', 'project', 'test'];

function AssignmentDraftView({
  result,
  onSave,
}: {
  result: Extract<NonNullable<ReturnType<typeof useTeacherAi>['result']>, { kind: 'assignment' }>;
  onSave: ReturnType<typeof useTeacherAi>['saveDraft'];
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [title, setTitle] = useState(result.draft.title);
  const [description, setDescription] = useState(
    [result.draft.description, ...result.draft.steps.map((step) => `- ${step}`)].join('\n'),
  );
  const [kind, setKind] = useState<AssignmentKind>('homework');
  const [dueDate, setDueDate] = useState(() => isoTeachingFromToday(1));

  /* A new draft replaces what is in the editor. */
  useEffect(() => {
    setTitle(result.draft.title);
    setDescription(
      [result.draft.description, ...result.draft.steps.map((step) => `- ${step}`)].join('\n'),
    );
  }, [result.draft]);

  const saved = Boolean(result.savedAssignmentId);

  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" title={t('teacherAi.draftTitle')} body={t('teacherAi.draftBody')} />

      <Field label={t('teacher.assignments.fieldTitle')}>
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={90}
          disabled={saved}
        />
      </Field>

      <Field label={t('teacher.assignments.fieldDescription')}>
        <TextArea
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={saved}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('teacher.assignments.fieldKind')}>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as AssignmentKind)}
            disabled={saved}
          >
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`kind.${value}` as TranslationKey)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('teacher.assignments.fieldDeadline')}>
          <TextInput
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={saved}
          />
        </Field>
      </div>

      <p className="text-[12px] text-ink-subtle">
        {t('teacherAi.draftTarget', {
          class: result.scope.classLabel,
          subject: result.scope.subject,
        })}
      </p>

      {saved ? (
        <div className="flex items-center gap-2 rounded-lg border border-success-line bg-success-soft px-3.5 py-3 text-[13px] text-success-text">
          <Check size={15} aria-hidden className="shrink-0" />
          {t('teacherAi.draftSaved')}
        </div>
      ) : (
        <div>
          <Button
            variant="primary"
            disabled={!title.trim() || !description.trim() || !dueDate}
            onClick={() => {
              const created = onSave({
                title: title.trim(),
                description: description.trim(),
                classId: result.scope.classId,
                subjectId: result.scope.subjectId,
                kind,
                dueDate,
              });
              if (created) toast(t('teacherAi.draftSavedToast'));
            }}
            iconLeft={<Save size={15} aria-hidden />}
          >
            {t('teacherAi.saveAsAssignment')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---- chat ------------------------------------------------------------ */

function ChatPanel({
  chat,
  busy,
  errorText,
  question,
  onQuestion,
  onAsk,
  onClear,
}: {
  chat: ReturnType<typeof useTeacherAi>['chat'];
  busy: boolean;
  errorText: string | null;
  question: string;
  onQuestion: (value: string) => void;
  onAsk: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {errorText ? (
        <Notice tone="warn" title={t('teacherAi.degradedTitle')} body={errorText} />
      ) : null}

      {chat.length === 0 ? (
        <EmptyState
          icon={<MessageSquare size={17} aria-hidden />}
          title={t('teacherAi.chatEmptyTitle')}
          body={t('teacherAi.chatEmptyBody')}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {chat.map((turn) => (
            <div key={turn.id} className="flex min-w-0 flex-col gap-2.5">
              <p className="self-end max-w-[85%] rounded-lg rounded-br-sm bg-accent-soft px-3.5 py-2.5 text-[13.5px] text-ink">
                {turn.question}
              </p>

              {turn.schoolBlocks.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5 shadow-subtle">
                  <Chip tone="outline">{t('teacherAi.badgeSchoolData')}</Chip>
                  {turn.schoolBlocks.map((block, i) => (
                    <p
                      key={`${turn.id}-b${i}`}
                      className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink"
                    >
                      {block}
                    </p>
                  ))}
                </div>
              ) : null}

              {turn.withheld ? (
                <Notice
                  tone="warn"
                  title={t('teacherAi.liveUnavailableTitle')}
                  body={t('teacherAi.liveUnavailableBody')}
                />
              ) : null}

              {turn.answer ? (
                <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3.5 shadow-subtle">
                  <div className="flex flex-wrap items-center gap-2">
                    <SourceBadge source="ai" />
                    {turn.usedWeb ? <Chip tone="outline">{t('ask.badgeWeb')}</Chip> : null}
                  </div>
                  <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink">
                    {turn.answer}
                  </p>
                  {turn.sources.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-1">
                      {turn.sources.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[12.5px] text-accent-text underline-offset-2 hover:underline"
                          >
                            {source.title} · {source.domain}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {!turn.answer && !turn.withheld && turn.schoolBlocks.length === 0 && busy ? (
                <p className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <Loader2 size={14} aria-hidden className="animate-spin" />
                  {t('teacherAi.working')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <TextArea
          rows={2}
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          placeholder={t('teacherAi.chatPlaceholder')}
          maxLength={700}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!busy) onAsk();
            }
          }}
        />
        <Button
          variant="primary"
          size="icon"
          className="h-10 w-10 shrink-0"
          disabled={busy || !question.trim()}
          onClick={onAsk}
          aria-label={t('teacherAi.send')}
        >
          {busy ? (
            <Loader2 size={16} aria-hidden className="animate-spin" />
          ) : (
            <Send size={16} aria-hidden />
          )}
        </Button>
      </div>

      {chat.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={onClear} iconLeft={<Trash2 size={14} aria-hidden />}>
            {t('teacherAi.clearChat')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
