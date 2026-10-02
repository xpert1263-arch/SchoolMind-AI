import type { Locale } from '@/data/types';
import type { Translator } from '@/i18n';
import { daysFromToday, formatDate } from './dates';

/** Human deadline wording. Falls back to a date once it stops being "soon". */
export function dueLabel(dueISO: string, t: Translator, locale: Locale): string {
  const days = daysFromToday(dueISO);
  if (days < 0) return t('status.overdueByDays', { n: Math.abs(days) });
  if (days === 0) return t('status.dueToday');
  if (days === 1) return t('status.dueTomorrow');
  if (days <= 6) return t('status.dueInDays', { n: days });
  return formatDate(dueISO, locale);
}

/** "Bugun" / "Ertaga" / "Kecha", otherwise a weekday + date. */
export function dayLabel(iso: string, t: Translator, locale: Locale): string {
  const days = daysFromToday(iso);
  if (days === 0) return t('common.today');
  if (days === 1) return t('common.tomorrow');
  if (days === -1) return t('common.yesterday');
  return formatDate(iso, locale, { weekday: 'long', day: 'numeric', month: 'short' });
}

export function weekdayLabel(iso: string, locale: Locale, short = false): string {
  return formatDate(iso, locale, { weekday: short ? 'short' : 'long' });
}
