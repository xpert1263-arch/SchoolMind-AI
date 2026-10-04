import type { Locale } from '@/data/types';
import type { Translator } from '@/i18n';
import { bankQuestions } from '@/lib/quiz/bank';
import type {
  AssignmentDraftContent,
  ExplanationMethod,
  LessonPlan,
  TeacherAiScope,
} from './types';

/* ------------------------------------------------------------------
   What Teacher AI can produce with no model at all.

   Not a stub screen and not a fake answer: a real teaching skeleton,
   time-boxed to the lesson length the teacher chose and named after
   the topic they typed. A teacher can take it into a classroom and
   fill it in — which is exactly what the UI says it is, labelled as
   SchoolMind's template rather than as AI work.

   The wording lives in the dictionary, so these templates are as
   bilingual as the rest of the app.
   ------------------------------------------------------------------ */

/** Minutes for each phase of a lesson of `total` minutes. The shares
 *  are a conventional split; rounding goes to practice, which is the
 *  phase a teacher shortens first in reality. */
function timeBoxes(total: number) {
  const warmUp = Math.max(3, Math.round(total * 0.1));
  const explanation = Math.round(total * 0.3);
  const examples = Math.round(total * 0.2);
  const conclusion = Math.max(3, Math.round(total * 0.08));
  const practice = Math.max(5, total - warmUp - explanation - examples - conclusion);
  return { warmUp, explanation, examples, practice, conclusion };
}

export function fallbackLessonPlan(
  scope: TeacherAiScope,
  minutes: number,
  t: Translator,
): LessonPlan {
  const box = timeBoxes(minutes);
  const vars = { topic: scope.topic, class: scope.classLabel, subject: scope.subject };

  return {
    objective: t('teacherAi.fb.objective', vars),
    warmUp: t('teacherAi.fb.warmUp', { ...vars, min: box.warmUp }),
    explanation: [
      t('teacherAi.fb.explain1', { ...vars, min: box.explanation }),
      t('teacherAi.fb.explain2', vars),
      t('teacherAi.fb.explain3', vars),
    ],
    examples: [
      t('teacherAi.fb.example1', { ...vars, min: box.examples }),
      t('teacherAi.fb.example2', vars),
    ],
    practice: [
      t('teacherAi.fb.practice1', { ...vars, min: box.practice }),
      t('teacherAi.fb.practice2', vars),
      t('teacherAi.fb.practice3', vars),
    ],
    activity: t('teacherAi.fb.activity', vars),
    checks: [t('teacherAi.fb.check1', vars), t('teacherAi.fb.check2', vars)],
    conclusion: t('teacherAi.fb.conclusion', { ...vars, min: box.conclusion }),
    homework: t('teacherAi.fb.homework', vars),
  };
}

export function fallbackAssignment(
  scope: TeacherAiScope,
  t: Translator,
): AssignmentDraftContent {
  const vars = { topic: scope.topic, class: scope.classLabel, subject: scope.subject };
  return {
    title: t('teacherAi.fb.assignmentTitle', vars),
    description: t('teacherAi.fb.assignmentBody', vars),
    steps: [
      t('teacherAi.fb.assignmentStep1', vars),
      t('teacherAi.fb.assignmentStep2', vars),
      t('teacherAi.fb.assignmentStep3', vars),
    ],
    minutes: 30,
  };
}

export function fallbackExplanation(scope: TeacherAiScope, t: Translator): ExplanationMethod {
  const vars = { topic: scope.topic, subject: scope.subject };
  return {
    simple: t('teacherAi.fb.methodSimple', vars),
    analogy: t('teacherAi.fb.methodAnalogy', vars),
    misconception: t('teacherAi.fb.methodMisconception', vars),
    activity: t('teacherAi.fb.methodActivity', vars),
    checkQuestion: t('teacherAi.fb.methodCheck', vars),
  };
}

/** The student question bank, read by a teacher. Returns [] for a
 *  subject the bank does not cover, which the caller reports as
 *  honestly as any other unavailable result. */
export function fallbackQuiz(subjectId: string, locale: Locale, count: number) {
  return bankQuestions(subjectId, locale, count);
}
