import { School } from 'lucide-react';
import type { AppMode } from '@/data/types';
import { navigationFor } from '@/app/navigation';
import { school } from '@/data/school';
import { Logo } from '@/components/brand/Logo';
import { useI18n } from '@/i18n/useI18n';
import { NavList } from './NavList';
import { WorkspaceBadge } from './WorkspaceBadge';

export function Sidebar({ mode }: { mode: AppMode }) {
  const { text } = useI18n();

  return (
    <aside
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface lg:flex"
      style={{ width: 'var(--sidebar-w)' }}
    >
      <div className="flex h-[var(--topbar-h)] items-center border-b border-line px-4">
        <Logo />
      </div>

      <div className="px-3 py-4">
        <WorkspaceBadge mode={mode} />
      </div>

      <div className="sm-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <NavList groups={navigationFor(mode)} layoutPrefix="sidebar" />
      </div>

      <div className="border-t border-line px-4 py-3.5">
        <div className="flex items-center gap-2.5 text-[12px] text-ink-subtle">
          <School size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{text(school.name)}</span>
        </div>
      </div>
    </aside>
  );
}
