import type { ID, Locale } from '@/data/types';

/* ------------------------------------------------------------------
   AI Planner vocabulary.

   The division of labour is the whole point of this feature:

     SchoolMind decides WHAT must be done — every obligation comes from
     the shared school dataset and is identified by its record id.

     Gemini decides WHEN and IN WHAT ORDER — sequencing, durations,
     breaks and the reasoning behind the arrangement.

   A plan item that claims to be school work but carries no real
   record id is rejected on the server, so the model cannot invent
   homework, a test or a deadline.
   ------------------------------------------------------------------ */

export type Intensity = 'light' | 'balanced' | 'intense';

export const INTENSITIES: Intensity[] = ['light', 'balanced', 'intense'];

export type PlanItemType = 'homework' | 'test' | 'review' | 'break';

export type Priority = 'high' | 'medium' | 'low';

export interface PlanItem {
  id: string;
  type: PlanItemType;
  /** A SchoolMind subject id, or null for breaks. */
  subjectId: ID | null;
  title: string;
  /** "16:00" — local clock time. */
  startTime: string;
  durationMinutes: number;
  priority: Priority;
  /** Why the plan put this here. Written by the model. */
  reason: string;
  /** The real assignment this step works on. Null means it is not
   *  school-assigned work: a break, or an optional AI suggestion. */
  sourceAssignmentId: ID | null;
}

export interface StudyPlan {
  title: string;
  summary: string;
  totalStudyMinutes: number;
  items: PlanItem[];
  warnings: string[];
  /** Whether a model produced this, or SchoolMind built it alone. */
  source: 'ai' | 'fallback';
  /** The language the plan's own wording is in. A deterministic plan
   *  is rebuilt when this stops matching the interface; a model's
   *  prose cannot be retranslated, so it keeps the language it was
   *  written in. */
  locale: Locale;
  /** The day the plan is for; a plan is not shown on another day. */
  dateISO: string;
  generatedAt: string;
  availableMinutes: number;
  intensity: Intensity;
}

/** One real obligation, as SchoolMind knows it. The catalogue the
 *  model is allowed to arrange — and nothing outside it. */
export interface PlannerTask {
  id: ID;
  kind: 'homework' | 'project' | 'test';
  title: string;
  subjectId: ID;
  subjectName: string;
  dueDate: string;
  /** Negative once the deadline has passed. */
  daysLeft: number;
  urgency: Priority;
  overdue: boolean;
  description: string;
}

/** Everything the planner sends to the server: a compact slice of the
 *  school data, never the dataset. */
export interface PlannerContext {
  locale: Locale;
  dateISO: string;
  dateLabel: string;
  weekdayLabel: string;
  startTime: string;
  studentName: string;
  className: string;
  schoolName: string;
  availableMinutes: number;
  intensity: Intensity;
  tasks: PlannerTask[];
  lessonsToday: string[];
  lessonsTomorrow: string[];
}

export type PlannerErrorCode =
  | 'missing_api_key'
  | 'rate_limited'
  | 'network'
  | 'upstream_error'
  | 'malformed_response'
  | 'empty_response'
  | 'bad_request'
  | 'server_error';

export type PlannerStatus = 'idle' | 'generating' | 'adjusting' | 'ready' | 'error';

export interface PlannerAdjustment {
  id: string;
  request: string;
  status: 'pending' | 'done' | 'error';
  /** The model's one-line note about what it changed. */
  note?: string;
  error?: PlannerErrorCode;
}
