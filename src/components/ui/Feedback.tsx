import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useI18n } from '@/i18n/useI18n';

/* ---- empty states --------------------------------------------------- */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  /** Compact variant for panels and drawers. */
  dense?: boolean;
}

export function EmptyState({ icon, title, body, action, dense }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-surface-muted/50 text-center',
        dense ? 'gap-1.5 px-5 py-7' : 'gap-2 px-6 py-12',
      )}
    >
      {icon ? (
        <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink-subtle shadow-subtle">
          {icon}
        </div>
      ) : null}
      <p className={cn('font-medium text-ink', dense ? 'text-[13px]' : 'text-sm')}>{title}</p>
      {body ? <p className="max-w-sm text-[13px] leading-relaxed text-ink-subtle">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ---- "coming soon" surfaces ------------------------------------------
   These are honest placeholders: they describe the planned capability
   and the version, and never fake a result. */

export function FuturePanel({
  title,
  body,
  version,
  icon,
}: {
  title: string;
  body: string;
  version: string;
  icon?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-lg border border-dashed border-accent-line bg-accent-soft/60 p-5">
      <div className="flex items-start gap-3.5">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-accent-text shadow-subtle">
          {icon ?? <Sparkles size={16} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">{title}</h3>
            <span className="rounded-full bg-surface px-2 py-0.5 text-2xs font-medium text-accent-text shadow-subtle">
              {t('future.badge')} · {version}
            </span>
          </div>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-muted">{body}</p>
        </div>
      </div>
    </div>
  );
}

/* ---- toast ------------------------------------------------------------ */

export interface ToastMessage {
  id: string;
  text: string;
}

export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {message ? (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-line bg-surface-raised px-3.5 py-2.5 shadow-overlay"
          >
            <CheckCircle2 size={16} className="shrink-0 text-success-text" aria-hidden />
            <p className="text-[13px] text-ink">{message.text}</p>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1.5 h-7 w-7"
              onClick={onDismiss}
              aria-label={t('common.close')}
            >
              <X size={14} aria-hidden />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
