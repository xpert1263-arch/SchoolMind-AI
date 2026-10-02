import { motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import type { NavGroup } from '@/app/navigation';
import { useI18n } from '@/i18n/useI18n';
import { cn } from '@/lib/cn';

/** Shared by the desktop sidebar and the mobile menu. */
export function NavList({
  groups,
  layoutPrefix,
  onNavigate,
}: {
  groups: NavGroup[];
  /** Keeps the sliding indicator unique per rendered list. */
  layoutPrefix: string;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();

  return (
    <nav aria-label={t('a11y.mainNavigation')} className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.labelKey}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            {t(group.labelKey)}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors duration-150',
                        isActive ? 'text-accent-text' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive ? (
                          <motion.span
                            layoutId={`${layoutPrefix}-nav-active`}
                            className="absolute inset-0 rounded-md bg-accent-soft"
                            transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                          />
                        ) : null}
                        <Icon size={16} aria-hidden className="relative shrink-0" />
                        <span className="relative truncate">{t(item.labelKey)}</span>
                        {item.futureVersion ? (
                          <span className="relative ml-auto shrink-0 rounded border border-line bg-surface px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                            {item.futureVersion}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
