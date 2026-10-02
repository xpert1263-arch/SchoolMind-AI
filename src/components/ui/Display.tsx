import { cn } from '@/lib/cn';

/** Deterministic hue per person so avatars stay stable between renders. */
function hueOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({
  name,
  initials,
  size = 32,
  ring,
}: {
  name: string;
  initials: string;
  size?: number;
  ring?: boolean;
}) {
  const hue = hueOf(name);
  return (
    <span
      data-hue
      aria-hidden
      style={
        {
          '--hue': hue,
          width: size,
          height: size,
          background: 'var(--subject-bg)',
          color: 'var(--subject-fg)',
          borderColor: 'var(--subject-line)',
          fontSize: Math.round(size * 0.36),
        } as React.CSSProperties
      }
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border font-semibold uppercase',
        ring && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
      )}
    >
      {initials}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  label,
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}) {
  const percent = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="h-1.5 w-full min-w-[56px] overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-swift"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span data-numeric className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-muted">
        {percent}%
      </span>
    </div>
  );
}
