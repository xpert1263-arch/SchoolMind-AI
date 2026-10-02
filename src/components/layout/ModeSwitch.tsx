import { motion } from 'framer-motion';
import type { AppMode } from '@/data/types';
import { modeIcons } from '@/app/navigation';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';

/**
 * The core interaction of SchoolMind: one product, two workspaces.
 * Prominent but not oversized, and animated with a shared indicator so
 * the switch reads as moving inside one OS, not loading a new site.
 */
export function ModeSwitch({
  mode,
  onChange,
  compact = false,
}: {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const modes: AppMode[] = ['student', 'teacher'];

  return (
    <div
      role="radiogroup"
      aria-label={t('mode.switchLabel')}
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5 shadow-subtle"
    >
      {modes.map((value) => {
        const Icon = modeIcons[value];
        const active = value === mode;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t('a11y.switchMode', { mode: t(`mode.${value}`) })}
            onClick={() => onChange(value)}
            className={cn(
              'relative flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
              compact ? 'sm:px-3' : 'px-3 sm:px-3.5',
              active ? 'text-accent-text' : 'text-ink-muted hover:text-ink',
            )}
          >
            {active ? (
              <motion.span
                layoutId="mode-switch-pill"
                className="absolute inset-0 rounded-[7px] bg-surface shadow-subtle ring-1 ring-accent-line"
                transition={{ type: 'spring', stiffness: 480, damping: 38 }}
              />
            ) : null}
            <Icon size={15} aria-hidden className="relative" />
            <span className={cn('relative', compact && 'hidden sm:inline')}>
              {t(`mode.${value}`)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
