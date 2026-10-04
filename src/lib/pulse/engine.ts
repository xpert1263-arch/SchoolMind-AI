import type { ID } from '@/data/types';
import type { Translator } from '@/i18n';
import type {
  ClassPulse,
  ClassPulseResponse,
  PulseResults,
  UnderstandingLevel,
} from './types';
import { UNDERSTANDING_LEVELS } from './types';

/* ------------------------------------------------------------------
   Turning answers into results.

   Every number on the teacher's screen is produced here, by counting.
   There is no estimate, no model and no weighting anywhere in this
   file: a response rate is responses divided by pupils, and a
   distribution is how many people pressed each button.

   That matters more than it sounds. The moment a classroom tool shows
   a number nobody can derive, a teacher has to decide whether to
   trust it — and a percentage invented to look convincing is exactly
   the kind of thing that ends up in a parent conversation.
   ------------------------------------------------------------------ */

/** Whole percent of `part` out of `whole`, 0 when there is no whole. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

const UNDERSTANDING_LABEL: Record<UnderstandingLevel, Parameters<Translator>[0]> = {
  got_it: 'pulse.levelGotIt',
  partly: 'pulse.levelPartly',
  again: 'pulse.levelAgain',
};

export function understandingLabelKey(level: UnderstandingLevel): Parameters<Translator>[0] {
  return UNDERSTANDING_LABEL[level];
}

export interface RosterEntry {
  id: ID;
  name: string;
}

/**
 * Counts one pulse.
 *
 * `roster` is the class the pulse was set for — the pupils who could
 * have answered. Responses from anybody else are ignored rather than
 * counted, so a stale record can never inflate a total.
 */
export function buildResults(
  pulse: ClassPulse,
  responses: ClassPulseResponse[],
  roster: RosterEntry[],
  t: Translator,
): PulseResults {
  const eligibleIds = new Set(roster.map((entry) => entry.id));

  /* One answer per pupil: if an older duplicate somehow exists, the
     most recent one is the one that counts. */
  const latest = new Map<ID, ClassPulseResponse>();
  for (const response of responses) {
    if (response.pulseId !== pulse.id) continue;
    if (!eligibleIds.has(response.studentId)) continue;
    const previous = latest.get(response.studentId);
    const when = response.updatedAt ?? response.createdAt;
    const previousWhen = previous ? (previous.updatedAt ?? previous.createdAt) : '';
    if (!previous || when >= previousWhen) latest.set(response.studentId, response);
  }

  const given = [...latest.values()];
  const eligible = roster.length;
  const responded = given.length;

  let distribution: PulseResults['distribution'] = [];
  let correct: number | null = null;
  let incorrect: number | null = null;
  let texts: PulseResults['texts'] = [];

  if (pulse.type === 'understanding') {
    distribution = UNDERSTANDING_LEVELS.map((level) => {
      const count = given.filter((entry) => entry.answer === level).length;
      return {
        key: level,
        label: t(UNDERSTANDING_LABEL[level]),
        count,
        /* Of those who answered — a pupil who said nothing has not
           said they are fine. */
        percent: percentOf(count, responded),
      };
    });
  }

  if (pulse.type === 'mcq') {
    distribution = pulse.options.map((option) => {
      const count = given.filter((entry) => entry.answer === option.id).length;
      return {
        key: option.id,
        label: option.text,
        count,
        percent: percentOf(count, responded),
      };
    });
    /* Only a pulse with a marked answer has a right and a wrong. */
    if (pulse.correctOptionId) {
      correct = given.filter((entry) => entry.answer === pulse.correctOptionId).length;
      incorrect = responded - correct;
    }
  }

  if (pulse.type === 'exit') {
    const byId = new Map(roster.map((entry) => [entry.id, entry.name]));
    texts = given
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .map((entry) => ({
        studentId: entry.studentId,
        studentName: byId.get(entry.studentId) ?? entry.studentId,
        answer: entry.answer,
      }));
  }

  return {
    pulse,
    eligible,
    responded,
    unanswered: Math.max(eligible - responded, 0),
    responseRate: percentOf(responded, eligible),
    distribution,
    correct,
    incorrect,
    texts,
  };
}

/**
 * The summary SchoolMind writes itself.
 *
 * Nothing but the counts, in a sentence. This is the default, and for
 * an understanding check or a marked MCQ it is also the complete
 * truth — there is nothing a model could add to "8 of 12 said they
 * understood" except confidence that is not warranted.
 */
export function deterministicSummary(results: PulseResults, t: Translator): string {
  const { pulse, responded, eligible, unanswered } = results;

  if (responded === 0) return t('pulse.summaryNone', { eligible });

  const lines: string[] = [];

  if (pulse.type === 'exit') {
    lines.push(t('pulse.summaryExit', { responded, eligible }));
  } else {
    const parts = results.distribution
      .filter((entry) => entry.count > 0)
      .map((entry) => t('pulse.summaryPart', { n: entry.count, label: entry.label }));
    lines.push(t('pulse.summaryCounts', { responded, eligible, parts: parts.join(', ') }));
  }

  if (pulse.type === 'mcq' && results.correct !== null) {
    lines.push(
      t('pulse.summaryCorrect', {
        correct: results.correct,
        responded,
        percent: percentOf(results.correct, responded),
      }),
    );
  }

  if (unanswered > 0) lines.push(t('pulse.summaryUnanswered', { n: unanswered }));

  return lines.join(' ');
}

/** The evidence an AI summary is allowed to see: counts and, for an
 *  exit ticket, what pupils actually wrote — never a name. */
export function summaryEvidence(results: PulseResults): string {
  const lines = [
    `QUESTION TYPE: ${results.pulse.type}`,
    `TOPIC: ${results.pulse.topic}`,
    `PUPILS IN CLASS: ${results.eligible}`,
    `ANSWERED: ${results.responded}`,
    `DID NOT ANSWER: ${results.unanswered}`,
  ];

  if (results.distribution.length > 0) {
    lines.push(
      `ANSWERS: ${results.distribution
        .map((entry) => `${entry.label} = ${entry.count}`)
        .join('; ')}`,
    );
  }
  if (results.correct !== null) {
    lines.push(`CORRECT: ${results.correct}`, `INCORRECT: ${results.incorrect}`);
  }
  if (results.texts.length > 0) {
    /* Anonymous on purpose: the teacher can read who wrote what on
       their own screen; a model has no business being told. */
    lines.push(
      'WHAT PUPILS WROTE (anonymous):',
      ...results.texts.map((entry, i) => `${i + 1}. ${entry.answer}`),
    );
  }

  return lines.join('\n');
}
