import type { Locale } from '@/data/types';

/* ------------------------------------------------------------------
   Extension point for the AI features planned from v1.1 onwards
   (AskMySchool, SnapHomework, AI Planner, AI Tutor, ClassPulse).

   v1.0 ships NO model integration and NO credentials. This file only
   fixes the shape of the boundary so later versions can drop a real
   provider in behind it without touching the screens.
   ------------------------------------------------------------------ */

export interface AiRequestContext {
  locale: Locale;
  /** Opaque identifiers only — never raw student records. */
  classId?: string;
  subjectId?: string;
}

export interface AiCapabilities {
  ask: boolean;
  tutor: boolean;
  planDay: boolean;
  analyseClass: boolean;
}

export interface AiProvider {
  readonly id: string;
  readonly capabilities: AiCapabilities;
  ask(prompt: string, context: AiRequestContext): Promise<string>;
}

export const NO_AI_CAPABILITIES: AiCapabilities = {
  ask: false,
  tutor: false,
  planDay: false,
  analyseClass: false,
};

/**
 * The only provider in v1.0. It advertises no capabilities, so UI can
 * ask `provider.capabilities.ask` instead of hardcoding "coming soon".
 */
export const unavailableAiProvider: AiProvider = {
  id: 'none',
  capabilities: NO_AI_CAPABILITIES,
  async ask() {
    throw new Error('AI is not available in SchoolMind v1.0');
  },
};

let active: AiProvider = unavailableAiProvider;

export function getAiProvider(): AiProvider {
  return active;
}

/** Called by a future bootstrap once a real provider is configured. */
export function setAiProvider(provider: AiProvider): void {
  active = provider;
}
