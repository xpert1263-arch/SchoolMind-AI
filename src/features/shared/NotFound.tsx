import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useI18n } from '@/i18n/useI18n';
import { useApp } from '@/state/store';
import { defaultRouteFor } from '@/app/navigation';

export function NotFound() {
  const { t } = useI18n();
  const { state } = useApp();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-muted text-ink-subtle">
        <Compass size={20} aria-hidden />
      </div>
      <h1 className="text-[20px] font-semibold text-ink">{t('error.notFoundTitle')}</h1>
      <p className="max-w-sm text-[13.5px] text-ink-muted">{t('error.notFoundBody')}</p>
      <Link
        to={defaultRouteFor(state.mode)}
        className="mt-2 inline-flex items-center rounded-md bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-contrast transition-colors hover:bg-accent-hover"
      >
        {t('error.goHome')}
      </Link>
    </div>
  );
}
