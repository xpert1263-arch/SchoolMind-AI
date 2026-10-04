import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/useI18n';
import { fetchCapabilities } from '@/lib/ask/client';
import { classify } from '@/lib/ask/router';
import type { AskCapabilities } from '@/lib/ask/types';
import { postAnalyse, postFollowUp } from './client';
import { prepareImage } from './image';
import type {
  HelpLevel,
  SelectedImage,
  SnapAnalysis,
  SnapErrorCode,
  SnapFollowUp,
  SnapPhase,
  SnapStatus,
} from './types';

/* ------------------------------------------------------------------
   SnapHomework session state.

   One photo at a time, held in memory. Analysis only runs when the
   student asks for it, and changing help level re-runs it against the
   same in-memory photo rather than storing anything.
   ------------------------------------------------------------------ */

const PHASE_SEQUENCE: SnapPhase[] = ['reading', 'detecting', 'teaching'];
const PHASE_MS = 1800;
const MAX_HISTORY = 4;

function newId(): string {
  return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Compact restatement of the task, so follow-ups stay on topic
 *  without resending the photo or the school database. */
function buildTaskContext(analysis: SnapAnalysis, subjectLabel: string): string {
  const lines = [`Subject: ${subjectLabel}`, `Task: ${analysis.taskSummary}`];
  if (analysis.conceptExplanation) lines.push(`Concept: ${analysis.conceptExplanation}`);
  if (analysis.steps.length > 0) {
    lines.push('Steps:');
    analysis.steps.forEach((step, i) => lines.push(`${i + 1}. ${step.title} — ${step.detail}`));
  }
  if (analysis.finalAnswer) lines.push(`Answer: ${analysis.finalAnswer}`);
  return lines.join('\n');
}

export interface UseSnap {
  image: SelectedImage | null;
  status: SnapStatus;
  phase: SnapPhase;
  mode: HelpLevel;
  analysis: SnapAnalysis | null;
  error: SnapErrorCode | null;
  followUps: SnapFollowUp[];
  capabilities: AskCapabilities | null;
  busy: boolean;
  selectFile: (file: File) => void;
  removeImage: () => void;
  analyse: (mode?: HelpLevel) => void;
  setMode: (mode: HelpLevel) => void;
  askFollowUp: (question: string, subjectLabel: string) => void;
}

export function useSnap(): UseSnap {
  const { locale } = useI18n();

  const [image, setImage] = useState<SelectedImage | null>(null);
  const [status, setStatus] = useState<SnapStatus>('idle');
  const [phase, setPhase] = useState<SnapPhase>('reading');
  const [mode, setModeState] = useState<HelpLevel>('explain');
  const [analysis, setAnalysis] = useState<SnapAnalysis | null>(null);
  const [error, setError] = useState<SnapErrorCode | null>(null);
  const [followUps, setFollowUps] = useState<SnapFollowUp[]>([]);
  const [capabilities, setCapabilities] = useState<AskCapabilities | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Array<{ role: 'user' | 'model'; text: string }>>([]);

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

  /* Walk the honest progress labels while the request is in flight. */
  useEffect(() => {
    if (status !== 'analysing') return;
    setPhase('reading');
    let index = 0;
    const timer = window.setInterval(() => {
      index = Math.min(index + 1, PHASE_SEQUENCE.length - 1);
      setPhase(PHASE_SEQUENCE[index]);
    }, PHASE_MS);
    return () => window.clearInterval(timer);
  }, [status]);

  const runAnalysis = useCallback(
    (target: SelectedImage, helpLevel: HelpLevel) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus('analysing');
      setError(null);

      void (async () => {
        const response = await postAnalyse(
          {
            image: target.base64,
            mimeType: target.mimeType,
            locale,
            mode: helpLevel,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setError(response.error);
          setStatus('error');
          return;
        }
        setAnalysis(response.result);
        setFollowUps([]);
        historyRef.current = [];
        setStatus('done');
      })();
    },
    [locale],
  );

  const selectFile = useCallback((file: File) => {
    void (async () => {
      const prepared = await prepareImage(file);
      if (!prepared.ok) {
        setError(prepared.error);
        setStatus('error');
        return;
      }
      abortRef.current?.abort();
      setImage(prepared.image);
      setAnalysis(null);
      setFollowUps([]);
      historyRef.current = [];
      setError(null);
      setStatus('ready');
    })();
  }, []);

  const removeImage = useCallback(() => {
    abortRef.current?.abort();
    setImage(null);
    setAnalysis(null);
    setFollowUps([]);
    historyRef.current = [];
    setError(null);
    setStatus('idle');
  }, []);

  const analyse = useCallback(
    (helpLevel?: HelpLevel) => {
      /* A second click, or Enter landing on the same button, must not
         start a second reading of the same photograph. */
      if (!image || status === 'analysing') return;
      runAnalysis(image, helpLevel ?? mode);
    },
    [image, mode, runAnalysis, status],
  );

  /** Changing the help level re-teaches the same photo. */
  const setMode = useCallback(
    (next: HelpLevel) => {
      if (status === 'analysing' || next === mode) return;
      setModeState(next);
      if (image && (status === 'done' || status === 'error')) runAnalysis(image, next);
    },
    [image, mode, runAnalysis, status],
  );

  const askFollowUp = useCallback(
    (raw: string, subjectLabel: string) => {
      const question = raw.trim();
      if (!question || !analysis) return;

      /* Reuse the AskMySchool router so "find me a source online"
         grounds in real search instead of model memory. */
      const route = classify(question, { hasFocus: true }).route;
      const web = route === 'WEB_SEARCH' || route === 'HYBRID';

      const id = newId();
      setFollowUps((prev) => [
        ...prev,
        { id, question, status: web ? 'searching' : 'pending' },
      ]);

      void (async () => {
        const response = await postFollowUp({
          question,
          locale,
          task: buildTaskContext(analysis, subjectLabel),
          web,
          history: historyRef.current,
        });

        setFollowUps((prev) =>
          prev.map((turn) => {
            if (turn.id !== id) return turn;
            if (!response.ok) return { ...turn, status: 'error', error: response.error };
            return {
              ...turn,
              status: 'done',
              text: response.text,
              sources: response.sources,
              usedWeb: response.usedWeb,
              degraded: response.degraded ?? undefined,
            };
          }),
        );

        if (response.ok) {
          historyRef.current = [
            ...historyRef.current,
            { role: 'user' as const, text: question },
            { role: 'model' as const, text: response.text },
          ].slice(-MAX_HISTORY);
        }
      })();
    },
    [analysis, locale],
  );

  const busy = status === 'analysing' || followUps.some((f) => f.status !== 'done' && f.status !== 'error');

  return {
    image,
    status,
    phase,
    mode,
    analysis,
    error,
    followUps,
    capabilities,
    busy,
    selectFile,
    removeImage,
    analyse,
    setMode,
    askFollowUp,
  };
}
