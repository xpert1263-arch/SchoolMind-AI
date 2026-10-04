import { useState } from 'react';
import { Activity, Check, Send } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import type { TranslationKey } from '@/i18n';
import { UNDERSTANDING_LEVELS, type UnderstandingLevel } from '@/lib/pulse/types';
import { useStudentPulse, type StudentPulseItem } from '@/lib/pulse/usePulse';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';

/* ------------------------------------------------------------------
   The pupil's side of ClassPulse: one card, one tap.

   It appears on the screens a pupil is already looking at rather than
   behind a new navigation item, because the whole point is that it
   gets answered in the thirty seconds at the end of a lesson.

   An answer already given is shown back, and can be changed — the
   store updates that pupil's single response rather than adding a
   second one, so a teacher's count can never be inflated by somebody
   pressing a button twice.
   ------------------------------------------------------------------ */

const LEVEL_LABEL: Record<UnderstandingLevel, TranslationKey> = {
  got_it: 'pulse.levelGotIt',
  partly: 'pulse.levelPartly',
  again: 'pulse.levelAgain',
};

const LEVEL_TONE: Record<UnderstandingLevel, string> = {
  got_it: 'border-success-line bg-success-soft text-success-text',
  partly: 'border-warn-line bg-warn-soft text-warn-text',
  again: 'border-danger-line bg-danger-soft text-danger-text',
};

/** Renders nothing when this pupil's class has no live pulse. */
export function PulseCard() {
  const pulse = useStudentPulse();
  if (pulse.items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {pulse.items.map((item) => (
        <OnePulse key={item.pulse.id} item={item} onAnswer={pulse.answer} />
      ))}
    </div>
  );
}

function OnePulse({
  item,
  onAnswer,
}: {
  item: StudentPulseItem;
  onAnswer: (pulse: StudentPulseItem['pulse'], value: string) => void;
}) {
  const { t } = useI18n();
  const { pulse, subjectName, answer } = item;
  const [text, setText] = useState(pulse.type === 'exit' ? (answer?.answer ?? '') : '');
  const [editing, setEditing] = useState(false);

  const answered = answer !== null && !editing;

  return (
    <section className="min-w-0 rounded-lg border border-accent-line bg-accent-soft/40 p-4 shadow-subtle">
      <header className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-accent-text shadow-subtle">
          <Activity size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-accent-text">
            {t('pulse.studentEyebrow')}
          </p>
          <h2 className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">
            {pulse.question || t('pulse.understandingQuestion')}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-subtle">
            {subjectName} · {pulse.topic}
          </p>
        </div>
      </header>

      {answered ? (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success-line bg-success-soft px-2.5 py-1 text-[12.5px] font-medium text-success-text">
            <Check size={13} aria-hidden />
            {t('pulse.accepted')}
          </span>
          <span className="min-w-0 truncate text-[12.5px] text-ink-muted">
            {labelOfAnswer(item, t)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t('pulse.change')}
          </Button>
        </div>
      ) : (
        <>
          {pulse.type === 'understanding' ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {UNDERSTANDING_LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => {
                    onAnswer(pulse, level);
                    setEditing(false);
                  }}
                  className={cn(
                    'rounded-lg border px-3 py-2.5 text-[13px] font-medium transition-transform active:translate-y-px',
                    LEVEL_TONE[level],
                  )}
                >
                  {t(LEVEL_LABEL[level])}
                </button>
              ))}
            </div>
          ) : null}

          {pulse.type === 'mcq' ? (
            <ul className="flex flex-col gap-2">
              {pulse.options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAnswer(pulse, option.id);
                      setEditing(false);
                    }}
                    className="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-left text-[13px] text-ink transition-colors hover:border-accent hover:bg-accent-soft/50"
                  >
                    {option.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {pulse.type === 'exit' ? (
            <div className="flex flex-col gap-2">
              <TextArea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('pulse.exitAnswerPlaceholder')}
                maxLength={400}
              />
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!text.trim()}
                  onClick={() => {
                    onAnswer(pulse, text);
                    setEditing(false);
                  }}
                  iconLeft={<Send size={14} aria-hidden />}
                >
                  {t('pulse.submit')}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function labelOfAnswer(item: StudentPulseItem, t: (key: TranslationKey) => string): string {
  const { pulse, answer } = item;
  if (!answer) return '';
  if (pulse.type === 'understanding') {
    return t(LEVEL_LABEL[answer.answer as UnderstandingLevel] ?? 'pulse.levelGotIt');
  }
  if (pulse.type === 'mcq') {
    return pulse.options.find((option) => option.id === answer.answer)?.text ?? '';
  }
  return answer.answer;
}
