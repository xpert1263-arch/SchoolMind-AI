import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fullName } from '@/data/queries';
import { useI18n } from '@/i18n/useI18n';
import { fetchCapabilities } from '@/lib/ask/client';
import type { AskCapabilities } from '@/lib/ask/types';
import { todayISO } from '@/lib/dates';
import { useCurrentStudent, useStudentItems } from '@/state/selectors';
import { useApp } from '@/state/store';
import { postAdjust, postPlan, type PlanPayload } from './client';
import { buildPlannerContext } from './context';
import { buildFallbackPlan } from './fallback';
import type {
  Intensity,
  PlannerAdjustment,
  PlannerContext,
  PlannerErrorCode,
  PlannerStatus,
  StudyPlan,
} from './types';

/* ------------------------------------------------------------------
   One generated plan at a time, owned by the application store so a
   refresh does not lose it.

   Every call starts from a freshly built SchoolMind context, so a
   plan is always arranged around the workload as it is right now —
   including homework the student ticked off five minutes ago.
   ------------------------------------------------------------------ */

export const TIME_PRESETS = [30, 60, 120] as const;

const MAX_ADJUSTMENTS = 6;

function newId(): string {
  return `adj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface UsePlanner {
  plan: StudyPlan | null;
  status: PlannerStatus;
  error: PlannerErrorCode | null;
  /** Set when the plan on screen is the deterministic one because the
   *  model could not be reached. Drives the honest label. */
  degraded: boolean;
  adjustments: PlannerAdjustment[];
  capabilities: AskCapabilities | null;
  context: PlannerContext;
  completedItemIds: string[];
  availableMinutes: number;
  intensity: Intensity;
  busy: boolean;
  setAvailableMinutes: (minutes: number) => void;
  setIntensity: (intensity: Intensity) => void;
  generate: () => void;
  adjust: (request: string) => void;
  toggleItemDone: (id: string) => void;
  discard: () => void;
}

export function usePlanner(): UsePlanner {
  const { t, locale } = useI18n();
  const { state, setPlan, clearPlan, togglePlanItemDone } = useApp();
  const { student, schoolClass } = useCurrentStudent();
  const items = useStudentItems();

  const [status, setStatus] = useState<PlannerStatus>(state.plan ? 'ready' : 'idle');
  const [error, setError] = useState<PlannerErrorCode | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [adjustments, setAdjustments] = useState<PlannerAdjustment[]>([]);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);
  const [availableMinutes, setAvailableMinutes] = useState(60);
  const [intensity, setIntensity] = useState<Intensity>('balanced');

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

  /* A stored plan carries the settings it was made with, so the
     controls describe what is on screen rather than a stale default. */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !state.plan) return;
    restored.current = true;
    setAvailableMinutes(state.plan.availableMinutes);
    setIntensity(state.plan.intensity);
    setDegraded(state.plan.source === 'fallback');
  }, [state.plan]);

  const context = useMemo(
    () =>
      buildPlannerContext({
        locale,
        schoolClass,
        studentName: fullName(student),
        items,
        availableMinutes,
        intensity,
      }),
    [locale, schoolClass, student, items, availableMinutes, intensity],
  );

  /* A deterministic plan is written entirely from the dictionary, so
     switching language can simply rebuild it. A model's prose cannot
     be retranslated, so an AI plan keeps the language it was written
     in until the student generates a new one. */
  useEffect(() => {
    const current = state.plan;
    if (!current || current.source !== 'fallback' || current.locale === locale) return;
    setPlan(
      buildFallbackPlan(
        { ...context, availableMinutes: current.availableMinutes, intensity: current.intensity },
        t,
      ),
    );
  }, [locale, state.plan, context, setPlan, t]);

  /** Wraps the server's half of a plan with the bookkeeping the client
   *  owns, so a persisted plan knows which day and settings it is for. */
  const toStudyPlan = useCallback(
    (payload: PlanPayload, ctx: PlannerContext): StudyPlan => ({
      title: payload.title,
      summary: payload.summary,
      totalStudyMinutes: payload.totalStudyMinutes,
      items: payload.items,
      warnings: payload.warnings,
      source: 'ai',
      locale: ctx.locale,
      dateISO: ctx.dateISO,
      generatedAt: new Date().toISOString(),
      /* The model owns the budget once a plan exists, so a follow-up
         such as "fit it into two hours" survives the next one. */
      availableMinutes: payload.availableMinutes || ctx.availableMinutes,
      intensity: ctx.intensity,
    }),
    [],
  );

  const generate = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const ctx = context;
    setStatus('generating');
    setError(null);
    setDegraded(false);
    setAdjustments([]);

    void (async () => {
      const response = await postPlan({ locale, context: ctx }, controller.signal);
      if (controller.signal.aborted) return;

      if (!response.ok) {
        /* Never lose the page: fall back to the plan SchoolMind can
           build from the same real deadlines, and label it. */
        setError(response.error);
        setDegraded(true);
        setPlan(buildFallbackPlan(ctx, t));
        setStatus('ready');
        return;
      }

      setPlan(toStudyPlan(response.plan, ctx));
      setStatus('ready');
    })();
  }, [context, locale, setPlan, t, toStudyPlan]);

  const adjust = useCallback(
    (raw: string) => {
      const request = raw.trim();
      const current = state.plan;
      if (!request || !current) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      /* Adjust the plan the student is looking at: it carries the
         budget the last adjustment settled on, which the controls do
         not know about. */
      const ctx: PlannerContext = {
        ...context,
        availableMinutes: current.availableMinutes,
      };
      const id = newId();
      const entry: PlannerAdjustment = { id, request, status: 'pending' };
      setAdjustments((prev) => [...prev, entry].slice(-MAX_ADJUSTMENTS));
      setStatus('adjusting');
      setError(null);

      void (async () => {
        const response = await postAdjust(
          { locale, context: ctx, plan: current, request },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (!response.ok) {
          /* An adjustment that fails leaves the existing plan alone —
             losing a good plan to a failed tweak would be worse. */
          setError(response.error);
          setAdjustments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: 'error', error: response.error } : a)),
          );
          setStatus('ready');
          return;
        }

        const next = toStudyPlan(response.plan, ctx);
        setPlan(next);
        /* Keep the control honest about the plan on screen. */
        setAvailableMinutes(next.availableMinutes);
        setAdjustments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: 'done', note: response.plan.note } : a)),
        );
        setDegraded(false);
        setStatus('ready');
      })();
    },
    [context, locale, setPlan, state.plan, toStudyPlan],
  );

  const discard = useCallback(() => {
    abortRef.current?.abort();
    clearPlan();
    setAdjustments([]);
    setError(null);
    setDegraded(false);
    setStatus('idle');
  }, [clearPlan]);

  /* A plan rolls over at midnight; the store drops it on load, and
     this catches a session left open across the boundary. */
  const plan = state.plan && state.plan.dateISO === todayISO() ? state.plan : null;

  return {
    plan,
    status: plan ? status : status === 'generating' ? status : 'idle',
    error,
    degraded,
    adjustments,
    capabilities,
    context,
    completedItemIds: state.completedPlanItemIds,
    availableMinutes,
    intensity,
    busy: status === 'generating' || status === 'adjusting',
    setAvailableMinutes,
    setIntensity,
    generate,
    adjust,
    toggleItemDone: togglePlanItemDone,
    discard,
  };
}
