import {
  EXPLAIN_CUES,
  QUESTION_CUES,
  SCHOOL_TOPIC,
  SCHOOL_TOPIC_WORDS,
  TIME_CUES,
  WEEKDAY_CUES,
} from './lexicon';
import { WEB_CUES } from './lexicon';
import { detectSubjectId } from './subjectMatch';
import { hasStem, hasWord, normalise } from './text';
import type { AskRoute } from './types';

/* ------------------------------------------------------------------
   Source router.

   Deterministic, and deliberately built on two independent signals
   rather than a pile of phrase matching:

     strong school  a SchoolMind record is being asked about
                    (lesson, homework, test, teacher, room, announcement)
     web            the answer depends on current external information

   strong + web -> HYBRID, web -> WEB_SEARCH, strong -> SCHOOL_DATA,
   otherwise AI_KNOWLEDGE. A subject name on its own is only a weak
   signal: "explain algebra" is knowledge, "algebra homework" is not.

   When neither signal fires the route is AI_KNOWLEDGE with low
   confidence, and the server may spend one small model call deciding
   whether the question really needs fresh information.
   ------------------------------------------------------------------ */

export interface Classification {
  route: AskRoute;
  confidence: 'high' | 'low';
  signals: {
    schoolTopic: boolean;
    subject: boolean;
    web: boolean;
    explain: boolean;
    followUp: boolean;
  };
}

const TOPIC_STEMS = Object.values(SCHOOL_TOPIC).flat();
const TOPIC_WORDS = Object.values(SCHOOL_TOPIC_WORDS).flat();
const TIME_STEMS = Object.values(TIME_CUES).flat();
const DEADLINE_STEMS = QUESTION_CUES.deadline;

/** Words that point back at whatever was just discussed. */
const REFERENCE_CUES = ['shu ', 'bu ', 'o\'sha', 'этот', 'эту', 'этой', 'этому', 'том же', 'нем'];

/** Bare follow-ups carry no topic of their own ("Qaysi xonada?"). */
function looksLikeFollowUp(text: string): boolean {
  const words = text.split(' ').length;
  if (words > 5) return false;
  const property =
    hasStem(text, SCHOOL_TOPIC.room) ||
    hasWord(text, SCHOOL_TOPIC_WORDS.room) ||
    hasStem(text, SCHOOL_TOPIC.teacher) ||
    hasWord(text, SCHOOL_TOPIC_WORDS.teacher) ||
    hasStem(text, DEADLINE_STEMS);
  /* A bare "when?" only counts as a follow-up when it is the whole
     question — otherwise "when was Rome founded" would look local. */
  return property || (words <= 3 && hasStem(text, QUESTION_CUES.when));
}

export interface ClassifyOptions {
  /** True when a previous answer established a subject or record. */
  hasFocus?: boolean;
}

export function classify(question: string, options: ClassifyOptions = {}): Classification {
  const text = normalise(question);

  const referential = options.hasFocus === true && hasStem(text, REFERENCE_CUES);
  const namedSubject = detectSubjectId(text) !== undefined;
  const weekday = WEEKDAY_CUES.some((cue) => hasStem(text, cue.stems));
  const timeCue = hasStem(text, TIME_STEMS);

  /* Naming a weekday is already a timetable question ("is there
     physics on Thursday?"), and a day plus a subject is too. */
  const schoolTopic =
    hasStem(text, TOPIC_STEMS) ||
    hasWord(text, TOPIC_WORDS) ||
    looksLikeFollowUp(text) ||
    weekday ||
    (timeCue && namedSubject);
  const subject = namedSubject || referential;
  const web = hasStem(text, WEB_CUES.stems) || hasWord(text, WEB_CUES.words);
  const explain = hasStem(text, EXPLAIN_CUES);
  const followUp = looksLikeFollowUp(text);

  const signals = { schoolTopic, subject, web, explain, followUp };

  if (web && (schoolTopic || subject)) {
    return { route: 'HYBRID', confidence: 'high', signals };
  }
  if (web) {
    return { route: 'WEB_SEARCH', confidence: 'high', signals };
  }
  if (schoolTopic) {
    /* "Explain my maths homework topic" is a record plus an
       explanation, so it still starts from school data. */
    return { route: 'SCHOOL_DATA', confidence: 'high', signals };
  }
  if (explain || subject) {
    return { route: 'AI_KNOWLEDGE', confidence: 'high', signals };
  }
  /* Nothing fired: general question, possibly time-sensitive. */
  return { route: 'AI_KNOWLEDGE', confidence: 'low', signals };
}

/** Time cues are only meaningful alongside a school topic — "today's
 *  news" is not a schedule question. Exposed for the school engine. */
export function hasTimeCue(normalisedText: string): boolean {
  return hasStem(normalisedText, TIME_STEMS);
}
