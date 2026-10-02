import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface MetricProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Pulls attention when the number actually matters. */
  emphasis?: 'none' | 'warn' | 'danger' | 'accent';
  hint?: string;
}

const emphasisText: Record<NonNullable<MetricProps['emphasis']>, string> = {
  none: 'text-ink',
  warn: 'text-warn-text',
  danger: 'text-danger-text',
  accent: 'text-accent-text',
};

/** A small number block — deliberately not a card. */
export function Metric({ label, value, icon, emphasis = 'none', hint }: MetricProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-subtle">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        data-numeric
        className={cn('text-[26px] font-semibold leading-none', emphasisText[emphasis])}
      >
        {value}
      </div>
      {hint ? <div className="truncate text-[12px] text-ink-subtle">{hint}</div> : null}
    </div>
  );
}

/** Metrics sit in one hairline-separated strip rather than four cards. */
export function MetricStrip({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line shadow-subtle sm:grid-cols-4">
      {children}
    </div>
  );
}
