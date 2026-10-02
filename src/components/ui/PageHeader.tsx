import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1.5 flex items-center gap-2 text-[13px] text-ink-subtle">{eyebrow}</div>
        ) : null}
        <h1 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px]">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-ink-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
