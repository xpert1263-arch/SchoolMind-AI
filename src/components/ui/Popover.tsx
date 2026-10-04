import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/** Lightweight anchored popover: click outside or Escape closes it. */
export function Popover({
  trigger,
  children,
  align = 'end',
  widthClass = 'w-72',
  label,
  onOpen,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  widthClass?: string;
  label: string;
  /** Fires when the popover is opened — the moment its contents are
   *  actually on screen, which is what "read" means for a bell. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        open,
        toggle: () => {
          /* The callback has to fire here, in the event handler. React
             may run a state updater during a render pass, and a parent
             setState from there is a warning and a bug. */
          if (!open) onOpen?.();
          setOpen(!open);
        },
      })}
      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-label={label}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              'absolute top-[calc(100%+8px)] z-40 origin-top overflow-hidden rounded-lg border border-line bg-surface-raised shadow-overlay',
              align === 'end' ? 'right-0' : 'left-0',
              widthClass,
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
