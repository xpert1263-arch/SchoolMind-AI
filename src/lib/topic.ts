/* ------------------------------------------------------------------
   Is this a topic a lesson can actually be about?

   The AI features let a student type their own topic, which is the
   point — they should be able to ask about whatever the lesson was.
   But a free-text box with no floor accepts "mil.avv 10000000-asr"
   ("the 10,000,000th century BC"), and a model asked to teach that
   will cheerfully invent a curriculum for it. The nonsense then shows
   up on screen as if SchoolMind believed it.

   So the check happens before anything is spent: a topic that cannot
   be real is refused here, with a sentence telling the student what
   to type instead. The model never sees it, nothing is generated, and
   nothing absurd can reach a demo screen.

   This is deliberately a floor and not a curriculum filter. It
   catches the impossible, not the unusual — a pupil asking about
   something off-syllabus is still a pupil asking a question.
   ------------------------------------------------------------------ */

export type TopicProblem = 'empty' | 'tooShort' | 'tooLong' | 'absurdPeriod' | 'noLetters';

export type TopicCheck = { ok: true; topic: string } | { ok: false; problem: TopicProblem };

const MIN_CHARS = 2;
const MAX_CHARS = 120;

/* Period words in both languages, so "10000000-asr" and
   "10000000 век" are caught the same way. */
const PERIOD_WORDS = ['asr', 'yil', 'yillar', 'аср', 'век', 'год', 'года', 'годы'];

/** The highest century and year a school topic can sensibly name.
 *  Generous on purpose: geology and astronomy legitimately talk in
 *  millions of years, so only a number attached to a CENTURY or a
 *  calendar year is treated as impossible. */
const MAX_CENTURY = 30;
const MAX_YEAR = 2200;

/**
 * Cleans a typed topic and decides whether it can be taught.
 *
 * Returns the tidied topic, or the reason it was refused so the
 * caller can show the right sentence.
 */
export function checkTopic(raw: string): TopicCheck {
  const topic = raw.replace(/\s+/g, ' ').trim();

  if (!topic) return { ok: false, problem: 'empty' };
  if (topic.length < MIN_CHARS) return { ok: false, problem: 'tooShort' };
  if (topic.length > MAX_CHARS) return { ok: false, problem: 'tooLong' };

  /* A topic made only of digits and punctuation is not a topic. */
  if (!/\p{L}/u.test(topic)) return { ok: false, problem: 'noLetters' };

  const lower = topic.toLowerCase();

  /* A number sitting next to a period word, however it is joined:
     "10000000-asr", "10000000 asr", "500 век". */
  for (const word of PERIOD_WORDS) {
    const pattern = new RegExp(`(\\d[\\d\\s.,]*)\\s*[-–—]?\\s*${word}\\b`, 'gu');
    for (const match of lower.matchAll(pattern)) {
      const value = Number(match[1].replace(/[\s.,]/g, ''));
      if (!Number.isFinite(value)) continue;
      const limit = word.startsWith('asr') || word.startsWith('аср') || word.startsWith('век')
        ? MAX_CENTURY
        : MAX_YEAR;
      if (value > limit) return { ok: false, problem: 'absurdPeriod' };
    }
  }

  return { ok: true, topic };
}

/** The dictionary key explaining why a topic was refused. */
export function topicProblemKey(problem: TopicProblem): string {
  return `topic.${problem}`;
}
