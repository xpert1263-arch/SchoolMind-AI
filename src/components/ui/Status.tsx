import type { ReactNode } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Circle, Clock3 } from 'lucide-react';
import type { AssignmentKind, DueStatus, Subject } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';

/* Status is never colour-only: every pill carries an icon and a word. */

const tone: Record<DueStatus, string> = {
  completed: 'bg-success-soft text-success-text border-success-line',
  overdue: 'bg-danger-soft text-danger-text border-danger-line',
  today: 'bg-warn-soft text-warn-text border-warn-line',
  soon: 'bg-info-soft text-info-text border-info-line',
  upcoming: 'bg-surface-muted text-ink-muted border-line',
};

const icon: Record<DueStatus, ReactNode> = {
  completed: <CheckCircle2 size={13} aria-hidden />,
  overdue: <AlertTriangle size={13} aria-hidden />,
  today: <Clock3 size={13} aria-hidden />,
  soon: <CalendarClock size={13} aria-hidden />,
  upcoming: <Circle size={13} aria-hidden />,
};

export function StatusPill({ status, label }: { status: DueStatus; label?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium',
        tone[status],
      )}
    >
      {icon[status]}
      {label ?? t(`status.${status}` as const)}
    </span>
  );
}

export function Chip({
  children,
  className,
  tone: chipTone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: 'neutral' | 'accent' | 'outline';
}) {
  const tones = {
    neutral: 'bg-surface-muted text-ink-muted',
    accent: 'bg-accent-soft text-accent-text',
    outline: 'border border-line text-ink-muted',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium',
        tones[chipTone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Subject chips derive their palette from the subject's hue token. */
export function SubjectChip({ subject, short }: { subject: Subject; short?: boolean }) {
  const { text } = useI18n();
  return (
    <span
      data-hue
      style={
        {
          '--hue': subject.hue,
          background: 'var(--subject-bg)',
          borderColor: 'var(--subject-line)',
        } as React.CSSProperties
      }
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs font-medium"
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: 'var(--subject-dot)' }}
        aria-hidden
      />
      <span style={{ color: 'var(--subject-fg)' }}>
        {short ? subject.short : text(subject.name)}
      </span>
    </span>
  );
}

export function SubjectDot({ subject, size = 8 }: { subject: Subject; size?: number }) {
  return (
    <span
      data-hue
      style={{ '--hue': subject.hue, width: size, height: size } as React.CSSProperties}
      aria-hidden
      className="inline-block shrink-0 rounded-full"
    >
      <span
        className="block h-full w-full rounded-full"
        style={{ background: 'var(--subject-dot)' }}
      />
    </span>
  );
}

/** A square subject tile used in dense timetable layouts. */
export function SubjectTile({ subject, children }: { subject: Subject; children: ReactNode }) {
  return (
    <div
      data-hue
      style={
        {
          '--hue': subject.hue,
          background: 'var(--subject-bg)',
          borderColor: 'var(--subject-line)',
        } as React.CSSProperties
      }
      className="rounded-md border p-2.5"
    >
      {children}
    </div>
  );
}

export function KindLabel({ kind }: { kind: AssignmentKind }) {
  const { t } = useI18n();
  return <>{t(`kind.${kind}` as const)}</>;
}
