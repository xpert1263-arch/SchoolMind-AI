import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useI18n } from '@/i18n/useI18n';

const EASE = [0.32, 0.72, 0, 1] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Escape to close, focus moved in and restored, Tab kept inside. */
function useDialogBehaviour(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (nodes.length === 0) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  return panelRef;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Modal is centred; drawer slides in from the right (bottom on mobile). */
  variant?: 'modal' | 'drawer';
  widthClass?: string;
}

export function Overlay({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'modal',
  widthClass,
}: OverlayProps) {
  const { t } = useI18n();
  const panelRef = useDialogBehaviour(open, onClose);
  const titleId = `${variant}-title`;
  const descId = description ? `${variant}-desc` : undefined;

  const stop = useCallback((e: React.MouseEvent) => e.stopPropagation(), []);

  const isDrawer = variant === 'drawer';

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className={cn(
            'fixed inset-0 z-40 flex',
            isDrawer ? 'items-end justify-end sm:items-stretch' : 'items-end justify-center sm:items-center',
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={onClose}
        >
          <div className="absolute inset-0 bg-[rgb(10_12_16/0.42)] backdrop-blur-[2px]" aria-hidden />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            onMouseDown={stop}
            initial={isDrawer ? { x: '100%', y: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
            animate={isDrawer ? { x: 0, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isDrawer ? { x: '100%' } : { opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.24, ease: EASE }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden border border-line bg-surface-raised shadow-overlay',
              isDrawer
                ? cn('rounded-t-xl sm:h-full sm:max-h-none sm:rounded-none sm:rounded-l-xl sm:border-r-0', widthClass ?? 'sm:max-w-[26rem]')
                : cn('rounded-t-xl sm:rounded-xl', widthClass ?? 'sm:max-w-lg'),
            )}
          >
            <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[15px] font-semibold text-ink">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-0.5 text-[13px] text-ink-subtle">
                    {description}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 shrink-0"
                onClick={onClose}
                aria-label={t('a11y.closeDialog')}
              >
                <X size={16} aria-hidden />
              </Button>
            </header>

            <div className="sm-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3.5">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
