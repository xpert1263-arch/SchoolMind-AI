import type { ID } from '@/data/types';

/* ------------------------------------------------------------------
   ClassPulse — "did the class understand this lesson?"

   A teacher asks one short question; the class answers in a tap or a
   sentence; the teacher sees what came back. That is the whole idea,
   and the restraint is deliberate.

   WHAT THIS IS NOT, BY CONSTRUCTION

   There is no field here for a score about a person. No mastery
   percentage, no engagement rating, no ranking, no label. The model
   below can only express what a pupil actually said about one lesson,
   because anything else would be a claim SchoolMind has no evidence
   for — and a claim like that, attached to a child's name, is exactly
   the kind of thing a school system should not invent.

   The aggregate is the product. Individual answers exist because a
   teacher needs to read an exit ticket, not so anyone can be sorted.
   ------------------------------------------------------------------ */

/** The three things a teacher can ask at the end of a lesson. */
export type PulseType = 'understanding' | 'mcq' | 'exit';

/**
 * draft   written, not yet visible to anyone
 * active  pupils can answer
 * closed  no longer accepting answers; results stay readable
 */
export type PulseStatus = 'draft' | 'active' | 'closed';

/** The three self-reported answers to an understanding check. */
export type UnderstandingLevel = 'got_it' | 'partly' | 'again';

export const UNDERSTANDING_LEVELS: UnderstandingLevel[] = ['got_it', 'partly', 'again'];

export interface PulseOption {
  id: ID;
  text: string;
}

export interface ClassPulse {
  id: ID;
  teacherId: ID;
  classId: ID;
  subjectId: ID;
  topic: string;
  type: PulseType;
  /** The question as the pupil sees it. Understanding checks use the
   *  standard wording and leave this empty. */
  question: string;
  options: PulseOption[];
  /** Set only when the teacher marked one option correct. Without it
   *  an MCQ pulse is an opinion poll, and is reported as one. */
  correctOptionId: ID | null;
  status: PulseStatus;
  /** Real instant, for ordering. */
  createdAt: string;
  /** Calendar day from the demo clock, for display. */
  dateISO: string;
  activatedAt: string | null;
  closedAt: string | null;
}

export interface ClassPulseResponse {
  id: ID;
  pulseId: ID;
  studentId: ID;
  /** An option id, an UnderstandingLevel, or free text for an exit
   *  ticket. The pulse's own type says which it is. */
  answer: string;
  createdAt: string;
  updatedAt: string | null;
}

/** What the teacher's results view is built from — all of it counted,
 *  none of it estimated. */
export interface PulseResults {
  pulse: ClassPulse;
  /** Pupils in the class the pulse was set for. */
  eligible: number;
  responded: number;
  unanswered: number;
  /** Whole percent, from the two counts above. 0 when nobody is eligible. */
  responseRate: number;
  /** Answer -> how many pupils gave it. */
  distribution: Array<{ key: string; label: string; count: number; percent: number }>;
  /** Only for an MCQ with a correct option marked. */
  correct: number | null;
  incorrect: number | null;
  /** Exit-ticket answers, newest first. */
  texts: Array<{ studentId: ID; studentName: string; answer: string }>;
}

export type PulseSummarySource = 'schoolmind' | 'ai';

export interface PulseSummary {
  pulseId: ID;
  text: string;
  source: PulseSummarySource;
  at: string;
}
