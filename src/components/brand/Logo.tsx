import { cn } from '@/lib/cn';
import { useI18n } from '@/i18n/useI18n';

/** Abstract SchoolMind mark: an open book-plane with a thought node
 *  rising from it. Pure geometry, drawn in the current accent. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <rect width="32" height="32" rx="8.5" className="fill-accent" />
      <path d="M16 8.2 25 12.6l-9 4.4-9-4.4 9-4.4Z" className="fill-accent-contrast" opacity="0.95" />
      <path
        d="M10.4 15.1v3.6c0 2.1 2.5 3.5 5.6 3.5s5.6-1.4 5.6-3.5v-3.6"
        className="stroke-accent-contrast"
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.6"
        fill="none"
      />
      <circle cx="16" cy="12.6" r="1.7" className="fill-accent" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {compact ? null : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {t('app.name')}
          </span>
          <span className="mt-1 truncate text-[11px] text-ink-subtle">{t('app.tagline')}</span>
        </span>
      )}
    </span>
  );
}
