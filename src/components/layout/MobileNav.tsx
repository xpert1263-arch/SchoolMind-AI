import { AnimatePresence, motion } from 'framer-motion';
import { NavLink } from 'react-router-dom';
import { Moon, Sun, X } from 'lucide-react';
import type { AppMode } from '@/data/types';
import { navigationFor } from '@/app/navigation';
import { school } from '@/data/school';
import { locales, localeLabels } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { useApp } from '@/state/store';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { NavList } from './NavList';
import { ModeSwitch } from './ModeSwitch';
import { WorkspaceBadge } from './WorkspaceBadge';

const EASE = [0.32, 0.72, 0, 1] as const;

/** Primary destinations as a thumb-reachable tab bar — not a squeezed sidebar. */
export function BottomNav({ mode }: { mode: AppMode }) {
  const { t } = useI18n();
  const items = navigationFor(mode)[0].items;

  return (
    <nav
      aria-label={t('a11y.mainNavigation')}
      className="sticky bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-medium transition-colors',
                    isActive ? 'text-accent-text' : 'text-ink-subtle',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="bottom-nav-active"
                        className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent"
                        transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      />
                    ) : null}
                    <Icon size={19} aria-hidden />
                    <span className="max-w-full truncate leading-none">{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Full navigation plus settings, for everything the tab bar omits. */
export function MobileMenu({
  open,
  onClose,
  mode,
  onChangeMode,
}: {
  open: boolean;
  onClose: () => void;
  mode: AppMode;
  onChangeMode: (mode: AppMode) => void;
}) {
  const { t, text, locale } = useI18n();
  const { state, setLocale, toggleTheme } = useApp();
  const isDark = state.theme === 'dark';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-[rgb(10_12_16/0.42)] backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('a11y.mainNavigation')}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.26, ease: EASE }}
            className="absolute inset-y-0 left-0 flex w-[min(19rem,86vw)] flex-col border-r border-line bg-surface shadow-overlay"
          >
            <div className="flex h-[var(--topbar-h)] items-center justify-between border-b border-line pl-4 pr-2">
              <Logo />
              <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('a11y.closeMenu')}>
                <X size={18} aria-hidden />
              </Button>
            </div>

            <div className="sm-scroll min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <div className="mb-4 flex justify-center">
                <ModeSwitch mode={mode} onChange={onChangeMode} />
              </div>
              <div className="mb-4">
                <WorkspaceBadge mode={mode} />
              </div>
              <NavList groups={navigationFor(mode)} layoutPrefix="mobile" onNavigate={onClose} />
            </div>

            <div className="border-t border-line px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center rounded-md border border-line bg-surface-muted p-0.5">
                  {locales.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLocale(value)}
                      aria-pressed={value === locale}
                      className={cn(
                        'rounded px-2.5 py-1 text-[12px] font-semibold transition-colors',
                        value === locale ? 'bg-surface text-ink shadow-subtle' : 'text-ink-subtle',
                      )}
                    >
                      {localeLabels[value]}
                    </button>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={toggleTheme}
                  iconLeft={isDark ? <Sun size={14} aria-hidden /> : <Moon size={14} aria-hidden />}
                >
                  {isDark ? t('settings.light') : t('settings.dark')}
                </Button>
              </div>
              <p className="mt-3 truncate text-[11.5px] text-ink-subtle">{text(school.name)}</p>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
