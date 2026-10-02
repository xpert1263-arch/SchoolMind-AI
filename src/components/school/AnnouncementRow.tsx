import { CalendarClock, Info, Megaphone, Pin, ScrollText } from 'lucide-react';
import type { Announcement, AnnouncementCategory } from '@/data/types';
import { useI18n } from '@/i18n/useI18n';
import { formatDate } from '@/lib/dates';

const categoryIcon: Record<AnnouncementCategory, typeof Info> = {
  exam: ScrollText,
  event: Megaphone,
  schedule: CalendarClock,
  general: Info,
};

const categoryTone: Record<AnnouncementCategory, string> = {
  exam: 'bg-warn-soft text-warn-text',
  event: 'bg-accent-soft text-accent-text',
  schedule: 'bg-info-soft text-info-text',
  general: 'bg-surface-muted text-ink-muted',
};

export function AnnouncementRow({ item }: { item: Announcement }) {
  const { t, text, locale } = useI18n();
  const Icon = categoryIcon[item.category];

  return (
    <li className="flex gap-3 px-4 py-3 sm:px-5">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${categoryTone[item.category]}`}
        aria-hidden
      >
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[13.5px] font-medium leading-snug text-ink">{text(item.title)}</p>
          {item.pinned ? (
            <span className="inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-warn-text">
              <Pin size={9} aria-hidden />
              {t('announcement.pinned')}
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
          {text(item.body)}
        </p>
        <p className="mt-1.5 text-[11.5px] text-ink-subtle">
          {t(`announcement.${item.category}`)} · {formatDate(item.date, locale)}
        </p>
      </div>
    </li>
  );
}
