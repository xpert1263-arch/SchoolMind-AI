import { useCallback, useEffect, useRef, useState } from 'react';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { useAllAssignments, useCurrentStudent } from '@/state/selectors';
import { useApp } from '@/state/store';
import { fetchCapabilities, postAsk } from './client';
import { buildSchoolContext } from './contextBuilder';
import { classify } from './router';
import { answerFromSchool } from './schoolEngine';
import type {
  AnswerBlock,
  AnswerSource,
  AskCapabilities,
  AskErrorCode,
  AskFocus,
  AskTurn,
} from './types';

/* ------------------------------------------------------------------
   Orchestrates one question:

     classify -> (school engine) -> (server: Gemini / grounded search)
     -> structured answer with honest source badges

   School-data answers never touch the network, so AskMySchool stays
   genuinely useful even with no API key configured.
   ------------------------------------------------------------------ */

const MAX_HISTORY = 6;

const ERROR_TEXT: Record<AskErrorCode, Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  missing_api_key: 'ask.error.noKey',
  network: 'ask.error.network',
  upstream_error: 'ask.error.upstream',
  empty_response: 'ask.error.upstream',
  question_too_long: 'ask.error.tooLong',
  server_error: 'ask.error.upstream',
};

function newId(): string {
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Splits model prose into paragraphs and bullet runs. */
function toTextBlocks(text: string): AnswerBlock[] {
  return text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ kind: 'text', text: part }) as AnswerBlock);
}

export interface UseAsk {
  turns: AskTurn[];
  capabilities: AskCapabilities | null;
  busy: boolean;
  ask: (question: string) => void;
  clear: () => void;
}

export function useAsk(): UseAsk {
  const { t, locale } = useI18n();
  const { state } = useApp();
  const assignments = useAllAssignments();
  const { student, schoolClass } = useCurrentStudent();

  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);
  const [busy, setBusy] = useState(false);

  const focusRef = useRef<AskFocus>({});
  const historyRef = useRef<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    fetchCapabilities().then((caps) => {
      if (active) setCapabilities(caps);
    });
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  const patch = useCallback((id: string, update: Partial<AskTurn>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, ...update } : turn)));
  }, []);

  const ask = useCallback(
    (raw: string) => {
      const question = raw.trim();
      if (!question || busy) return;

      const hasFocus = Object.keys(focusRef.current).length > 0;
      const classification = classify(question, { hasFocus });
      const id = newId();
      const wantsWeb =
        classification.route === 'WEB_SEARCH' || classification.route === 'HYBRID';

      setTurns((prev) => [
        ...prev,
        {
          id,
          question,
          status: wantsWeb ? 'searching' : 'thinking',
          route: classification.route,
          sources: [],
          blocks: [],
          actions: [],
        },
      ]);
      setBusy(true);

      void (async () => {
        /* ---- school data ------------------------------------------- */
        const wantsSchool =
          classification.route === 'SCHOOL_DATA' || classification.route === 'HYBRID';

        const school = wantsSchool
          ? answerFromSchool({
              question,
              locale,
              t,
              schoolClass,
              assignments,
              completedIds: state.completedAssignmentIds,
              focus: focusRef.current,
            })
          : null;

        if (school?.resolved) focusRef.current = school.focus;

        /* A resolved school question is answered entirely offline. */
        if (classification.route === 'SCHOOL_DATA' && school?.resolved) {
          historyRef.current = [
            ...historyRef.current,
            { role: 'user' as const, text: question },
            { role: 'model' as const, text: school.factSummary || 'school answer' },
          ].slice(-MAX_HISTORY);

          patch(id, {
            status: 'done',
            sources: ['school'],
            blocks: school.blocks,
            actions: school.actions,
          });
          setBusy(false);
          return;
        }

        /* ---- anything the model is needed for ----------------------- */
        const schoolFallback = classification.route === 'SCHOOL_DATA' && !school?.resolved;
        const includeContext =
          classification.route === 'HYBRID' || schoolFallback || classification.signals.subject;

        const schoolContext = includeContext
          ? buildSchoolContext({
              question,
              locale,
              schoolClass,
              studentName: fullName(student),
              assignments,
              completedIds: state.completedAssignmentIds,
              focus: focusRef.current,
              factSummary: school?.factSummary,
            })
          : undefined;

        const controller = new AbortController();
        abortRef.current = controller;

        const response = await postAsk(
          {
            question,
            locale,
            route: schoolFallback ? 'AI_KNOWLEDGE' : classification.route,
            confidence: classification.confidence,
            schoolContext,
            history: historyRef.current,
          },
          controller.signal,
        );

        const schoolBlocks = school?.resolved ? school.blocks : [];
        const schoolActions = school?.resolved ? school.actions : [];

        if (!response.ok) {
          patch(id, {
            status: schoolBlocks.length > 0 ? 'done' : 'error',
            error: response.error,
            sources: schoolBlocks.length > 0 ? ['school'] : [],
            blocks: [...schoolBlocks, { kind: 'warning', textKey: ERROR_TEXT[response.error] }],
            actions: schoolActions,
          });
          setBusy(false);
          return;
        }

        const badges: AnswerSource[] = [];
        if (schoolBlocks.length > 0 || includeContext) badges.push('school');
        if (response.usedWeb) badges.push('web');
        badges.push('ai');

        const blocks: AnswerBlock[] = [...schoolBlocks, ...toTextBlocks(response.text)];

        if (response.degraded === 'web_unavailable') {
          blocks.push({ kind: 'warning', textKey: 'ask.warn.webUnavailable' });
        } else if (response.degraded === 'no_results') {
          blocks.push({ kind: 'warning', textKey: 'ask.warn.noWebResults' });
        }
        if (response.sources.length > 0) {
          blocks.push({ kind: 'sources', sources: response.sources });
        }

        historyRef.current = [
          ...historyRef.current,
          { role: 'user' as const, text: question },
          { role: 'model' as const, text: response.text },
        ].slice(-MAX_HISTORY);

        patch(id, {
          status: 'done',
          route: response.route,
          sources: badges,
          blocks,
          actions: schoolActions,
          degraded: response.degraded ?? undefined,
          searchQueries: response.searchQueries,
        });
        setBusy(false);
      })();
    },
    [assignments, busy, locale, patch, schoolClass, state.completedAssignmentIds, student, t],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    focusRef.current = {};
    historyRef.current = [];
    setTurns([]);
    setBusy(false);
  }, []);

  return { turns, capabilities, busy, ask, clear };
}
