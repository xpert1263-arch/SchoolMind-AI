import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

/* Two containers only — a bordered Panel and an unbordered Section.
   Keeping the vocabulary this small is what stops the UI turning into
   cards inside cards. */

export function Panel({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-line bg-surface shadow-subtle', className)}
      {...rest}
    />
  );
}

export interface SectionProps {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Renders the heading smaller — used inside drawers and panels. */
  dense?: boolean;
}

export function Section({ title, hint, action, children, className, dense }: SectionProps) {
  return (
    <section className={cn('min-w-0', className)}>
      <header className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2
            className={cn(
              'font-semibold text-ink',
              dense ? 'text-[13px] uppercase tracking-wider text-ink-muted' : 'text-[15px]',
            )}
          >
            {title}
          </h2>
          {hint ? <p className="mt-0.5 truncate text-[13px] text-ink-subtle">{hint}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** A horizontal hairline list. Rows supply their own padding. */
export function Rows({ className, ...rest }: HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn('sm-divide', className)} {...rest} />;
}
