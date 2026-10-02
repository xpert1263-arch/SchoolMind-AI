import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import type { TranslationKey } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Surface';

export interface FuturePageProps {
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  version: string;
  icon: ReactNode;
  backTo: string;
  backLabelKey: TranslationKey;
  /** What the capability is planned to do — described, never simulated. */
  pointKeys: TranslationKey[];
}

/**
 * Honest placeholder for a planned capability: it states the version
 * and the intent, and never simulates an AI answer.
 */
export function FuturePage({
  titleKey,
  bodyKey,
  version,
  icon,
  backTo,
  backLabelKey,
  pointKeys,
}: FuturePageProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[11.5px] font-medium text-ink-muted">
            {t('future.badge')} · {version}
          </span>
        }
        title={t(titleKey)}
      />

      <Panel className="flex flex-col items-start gap-5 px-6 py-10 sm:items-center sm:text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
          {icon}
        </div>
        <div className="max-w-md">
          <p className="text-[15px] font-medium text-ink">{t('future.plannedFor', { version })}</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{t(bodyKey)}</p>
        </div>

        <div className="w-full max-w-md text-left">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
            {t('future.plannedCapabilities')}
          </p>
          <ul className="overflow-hidden rounded-lg border border-line sm-divide">
            {pointKeys.map((key) => (
              <li key={key} className="flex items-start gap-2.5 bg-surface-muted/50 px-3.5 py-2.5">
                <Check size={14} aria-hidden className="mt-0.5 shrink-0 text-accent-text" />
                <span className="text-[13px] leading-relaxed text-ink-muted">{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-muted"
        >
          <ArrowLeft size={14} aria-hidden />
          {t(backLabelKey)}
        </Link>
      </Panel>
    </div>
  );
}
