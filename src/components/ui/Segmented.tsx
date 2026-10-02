import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Filter switcher. The active pill is a shared layout element, so it
 *  slides between options instead of popping. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full items-center gap-0.5 overflow-x-auto rounded-md border border-line bg-surface-muted p-0.5 sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex-1 whitespace-nowrap rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition-colors sm:flex-none',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-[5px] bg-surface shadow-subtle"
                transition={{ type: 'spring', stiffness: 460, damping: 38 }}
              />
            ) : null}
            <span className="relative flex items-center gap-1.5">
              {option.label}
              {typeof option.count === 'number' ? (
                <span
                  data-numeric
                  className={cn(
                    'rounded px-1 text-[11px] tabular-nums',
                    active ? 'bg-accent-soft text-accent-text' : 'text-ink-subtle',
                  )}
                >
                  {option.count}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
