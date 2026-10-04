import { postJson } from '@/lib/ai/request';
import type { QuizQuestion } from '@/lib/quiz/types';
import type {
  AssignmentDraftContent,
  ExplanationMethod,
  LessonPlan,
  TeacherAiErrorCode,
} from './types';

/* The browser's only channel to Teacher AI. The teacher's id travels
   with every request because the SERVER decides what that teacher may
   ask about — the class list in the form is a convenience, not the
   permission. */

const ERRORS: TeacherAiErrorCode[] = [
  'missing_api_key',
  'forbidden',
  'rate_limited',
  'network',
  'timeout',
  'upstream_error',
  'malformed_response',
  'empty_response',
  'bad_request',
  'server_error',
];

function toErrorCode(value: unknown): TeacherAiErrorCode {
  return ERRORS.includes(value as TeacherAiErrorCode)
    ? (value as TeacherAiErrorCode)
    : 'server_error';
}

export interface TeacherAiRequest {
  action: 'lesson' | 'assignment' | 'explain' | 'quiz' | 'chat' | 'pulse';
  locale: string;
  teacherId: string;
  teacherName: string;
  classId?: string;
  classLabel?: string;
  subjectId?: string;
  subject?: string;
  topic?: string;
  grade?: number;
  studentCount?: number;
  minutes?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
  note?: string;
  message?: string;
  schoolContext?: string;
  /** ClassPulse counts the summary may describe — and may not exceed. */
  evidence?: string;
  web?: boolean;
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

interface ChatPayload {
  text: string;
  sources: Array<{ url: string; title: string; domain: string }>;
  usedWeb: boolean;
}

interface Body {
  ok?: boolean;
  error?: unknown;
  lesson?: LessonPlan;
  assignment?: AssignmentDraftContent;
  explain?: ExplanationMethod;
  quiz?: { questions?: QuizQuestion[] };
  chat?: ChatPayload;
  withheld?: boolean;
  degraded?: 'web_unavailable' | 'no_results' | null;
}

export type TeacherAiResponse =
  | {
      ok: true;
      lesson?: LessonPlan;
      assignment?: AssignmentDraftContent;
      explain?: ExplanationMethod;
      questions?: QuizQuestion[];
      chat?: ChatPayload;
      withheld: boolean;
      degraded: 'web_unavailable' | 'no_results' | null;
    }
  | { ok: false; error: TeacherAiErrorCode };

export async function postTeacherAi(
  request: TeacherAiRequest,
  signal?: AbortSignal,
): Promise<TeacherAiResponse> {
  const result = await postJson<Body>('/api/teacher-ai', request, { signal });
  if (!result.ok) return { ok: false, error: result.error };

  const body = result.body;
  if (result.status >= 400 || body.ok !== true) {
    return { ok: false, error: toErrorCode(body.error) };
  }

  return {
    ok: true,
    lesson: body.lesson,
    assignment: body.assignment,
    explain: body.explain,
    questions: Array.isArray(body.quiz?.questions) ? body.quiz?.questions : undefined,
    chat: body.chat,
    withheld: body.withheld === true,
    degraded: body.degraded ?? null,
  };
}
