import type { ID } from '@/data/types';
import type { TranslationKey } from '@/i18n';

/* ------------------------------------------------------------------
   AskMySchool shared vocabulary.

   Answers are structured blocks, not prose dumps, and blocks reference
   school records by id so a rendered answer always reflects the live
   shared data (ticking homework updates the answer too).
   ------------------------------------------------------------------ */

/** Where an answer has to come from. */
export type AskRoute = 'SCHOOL_DATA' | 'AI_KNOWLEDGE' | 'WEB_SEARCH' | 'HYBRID';

/** What actually contributed, shown as badges. */
export type AnswerSource = 'school' | 'ai' | 'web';

export interface WebSource {
  url: string;
  title: string;
  domain: string;
}

export interface AskAction {
  labelKey: TranslationKey;
  to: string;
}

export type AnswerBlock =
  | { kind: 'text'; text: string }
  | { kind: 'lesson'; lessonId: ID; dateISO: string }
  | { kind: 'schedule'; dateISO: string; lessonIds: ID[] }
  | { kind: 'homework'; assignmentIds: ID[] }
  | { kind: 'tests'; assignmentIds: ID[] }
  | { kind: 'announcements'; announcementIds: ID[] }
  | { kind: 'subject'; subjectId: ID; teacherId: ID; room: string }
  | { kind: 'sources'; sources: WebSource[] }
  | { kind: 'warning'; textKey: TranslationKey }
  | { kind: 'empty'; titleKey: TranslationKey; bodyKey?: TranslationKey };

export type AskErrorCode =
  | 'missing_api_key'
  | 'network'
  | 'upstream_error'
  | 'empty_response'
  | 'question_too_long'
  | 'server_error';

export type AskStatus = 'thinking' | 'searching' | 'done' | 'error';

export interface AskTurn {
  id: string;
  question: string;
  status: AskStatus;
  route: AskRoute;
  /** Badges — only ever set for contributions that really happened. */
  sources: AnswerSource[];
  blocks: AnswerBlock[];
  actions: AskAction[];
  error?: AskErrorCode;
  /** Set when live search was wanted but could not be delivered. */
  degraded?: 'web_unavailable' | 'no_results';
  searchQueries?: string[];
}

/**
 * What the last answer was "about", so a bare follow-up such as
 * "Qaysi xonada?" can be resolved without repeating the subject.
 */
export interface AskFocus {
  subjectId?: ID;
  dateISO?: string;
  lessonId?: ID;
  assignmentId?: ID;
}

export interface AskCapabilities {
  geminiConfigured: boolean;
  webSearchEnabled: boolean;
}
