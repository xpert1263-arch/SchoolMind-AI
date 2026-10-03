import type { Translator } from '@/i18n';
import { minutesOf } from '@/lib/dates';
import type { Intensity, PlannerContext, PlannerTask, PlanItem, StudyPlan } from './types';

/* ------------------------------------------------------------------
   The plan SchoolMind can always produce.

   No network, no model, no invention: the same real obligations, laid
   out by deadline. Used when Gemini is out of quota or unreachable,
   and labelled as a basic plan so it is never mistaken for AI work.
   ------------------------------------------------------------------ */

/** Block and break length per intensity, in minutes. */
const SHAPE: Record<Intensity, { block: number; pause: number }> = {
  light: { block: 20, pause: 10 },
  balanced: { block: 30, pause: 10 },
  intense: { block: 40, pause: 5 },
};

function clockFrom(startTime: string, offsetMinutes: number): string {
  const total = (minutesOf(startTime) + offsetMinutes) % (24 * 60);
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`;
}

/** Below this a study block is not worth scheduling. */
const MIN_BLOCK = 15;

function reasonFor(task: PlannerTask, t: Translator): string {
  if (task.overdue) return t('planner.reasonOverdue');
  if (task.daysLeft === 0) return t('planner.reasonToday');
  if (task.kind === 'test' && task.daysLeft <= 3) return t('planner.reasonTestSoon');
  if (task.daysLeft === 1) return t('planner.reasonTomorrow');
  return t('planner.reasonUpcoming');
}

export function buildFallbackPlan(context: PlannerContext, t: Translator): StudyPlan {
  const { block, pause } = SHAPE[context.intensity];
  const items: PlanItem[] = [];

  let offset = 0;
  let studyMinutes = 0;
  let placed = 0;

  for (const task of context.tasks) {
    const pauseFirst = items.length > 0 ? pause : 0;
    /* Whatever is left after the pause, capped at a full block. A
       short remainder is still worth using; anything under a quarter
       hour is not. */
    const remaining = context.availableMinutes - offset - pauseFirst;
    const length = Math.min(block, remaining);
    if (length < MIN_BLOCK) break;

    if (pauseFirst > 0) {
      items.push({
        id: `fb-break-${items.length}`,
        type: 'break',
        subjectId: null,
        title: t('planner.breakTitle'),
        startTime: clockFrom(context.startTime, offset),
        durationMinutes: pauseFirst,
        priority: 'low',
        reason: '',
        sourceAssignmentId: null,
      });
      offset += pauseFirst;
    }

    items.push({
      id: `fb-${task.id}`,
      type: task.kind === 'test' ? 'test' : 'homework',
      subjectId: task.subjectId,
      title: task.title,
      startTime: clockFrom(context.startTime, offset),
      durationMinutes: length,
      priority: task.urgency,
      reason: reasonFor(task, t),
      sourceAssignmentId: task.id,
    });
    offset += length;
    studyMinutes += length;
    placed += 1;
  }

  const left = context.tasks.length - placed;

  return {
    title: t('planner.fallbackTitle'),
    summary: t('planner.fallbackSummary'),
    totalStudyMinutes: studyMinutes,
    items,
    warnings: left > 0 ? [t('planner.warnTimeShort', { n: left })] : [],
    source: 'fallback',
    locale: context.locale,
    dateISO: context.dateISO,
    generatedAt: new Date().toISOString(),
    availableMinutes: context.availableMinutes,
    intensity: context.intensity,
  };
}
