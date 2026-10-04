import type { DueStatus, Locale, Weekday } from '@/data/types';

/* Dates are handled as local-calendar ISO strings ("YYYY-MM-DD") so the
   demo never drifts a day because of UTC conversion, and so the dataset
   can be expressed relative to "today" instead of a frozen 2024 date. */

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** The real calendar day, from the machine clock. */
function realToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * The day SchoolMind treats as today.
 *
 * THIS IS THE DEMO CLOCK, and it is the single point that decides what
 * every date in the app means. The seeded dataset is expressed as
 * offsets from it, so moving this moves the whole school calendar
 * together — homework, tests, announcements, the timetable and "bugun"
 * can never disagree, because they are all counted from one day.
 *
 * Before the presentation it returns 10 October 2026, so a rehearsal
 * on any earlier day shows exactly the calendar the judges will see.
 * Without it the demo is correct only relative to whatever day it is
 * run on: rehearsed on 4 October it showed announcements dated 29
 * September, which is the bug this replaces.
 *
 * From 10 October onwards it returns the real day, so the app does not
 * freeze in the past once the presentation has happened.
 *
 * What it does NOT touch: the time of day. `nowMinutes` and `dayPart`
 * read the real clock, so "your next lesson" and the greeting still
 * follow the actual hour. And a genuine instant — when a quiz was
 * finished, when an assignment was created — is still stamped with
 * `new Date()`. The demo clock moves the calendar, not the stopwatch.
 */
export function today(): Date {
  const real = realToday();
  const demo = fromISODate(DEMO_REFERENCE_DATE);
  return real.getTime() < demo.getTime() ? demo : real;
}

export function todayISO(): string {
  return toISODate(today());
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** ISO date `days` away from today — the backbone of the relative dataset. */
export function isoFromToday(days: number): string {
  return toISODate(addDays(today(), days));
}

/* ------------------------------------------------------------------
   The demo calendar.

   The seeded dataset is expressed as offsets from "today", never as
   fixed dates, so the demo reads as current on whatever day it runs —
   including 10 October 2026, the presentation date. Nothing below
   pins the app to that date; it is written down because the
   chronology has to make sense ON it.

   10 October 2026 is a SATURDAY, which matters. A Saturday is a
   teaching day in this school and the Sunday after it is not, so an
   offset counted in calendar days would put "tomorrow's test" on a
   day with no lessons. `isoTeachingFromToday` counts in teaching days
   instead, which is what a school timetable actually means by
   "tomorrow".
   ------------------------------------------------------------------ */

/** The presentation the demo data must look current on. */
export const DEMO_REFERENCE_DATE = '2026-10-10';

/** Mon–Sat are teaching days in this school; Sunday is not. */
export function isTeachingDay(date: Date): boolean {
  return weekdayOf(date) !== 7;
}

/**
 * The date `offset` TEACHING days from today, skipping Sundays.
 *
 * `0` is today when today is a teaching day, and the next teaching day
 * when it is not — so a demo run on a Sunday still has work "due
 * today" rather than a blank screen. Negative offsets walk backwards
 * the same way.
 */
export function isoTeachingFromToday(offset: number): string {
  let cursor = today();

  if (!isTeachingDay(cursor)) {
    /* Start from the nearest teaching day in the direction of travel. */
    cursor = addDays(cursor, offset < 0 ? -1 : 1);
    while (!isTeachingDay(cursor)) cursor = addDays(cursor, offset < 0 ? -1 : 1);
  }

  const step = offset < 0 ? -1 : 1;
  let remaining = Math.abs(offset);
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (isTeachingDay(cursor)) remaining -= 1;
  }
  return toISODate(cursor);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = fromISODate(fromISO).getTime();
  const b = fromISODate(toISOStr).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Days from today until `iso`. Negative once the date has passed. */
export function daysFromToday(iso: string): number {
  return daysBetween(todayISO(), iso);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: Date): Weekday {
  const js = date.getDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function weekdayOfISO(iso: string): Weekday {
  return weekdayOf(fromISODate(iso));
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -(weekdayOf(date) - 1));
}

/** The dates of the current Mon–Sat teaching week, as ISO strings. */
export function currentTeachingWeek(): string[] {
  const monday = startOfWeek(today());
  return Array.from({ length: 6 }, (_, i) => toISODate(addDays(monday, i)));
}

/** Next date that is a teaching day (Mon–Sat), today included. */
export function nextTeachingDayISO(fromIso = todayISO()): string {
  let cursor = fromISODate(fromIso);
  for (let i = 0; i < 7; i += 1) {
    if (weekdayOf(cursor) !== 7) return toISODate(cursor);
    cursor = addDays(cursor, 1);
  }
  return fromIso;
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}

/* Browser Intl data for `uz-UZ` is unusable ("M10 2, Fri"), so Uzbek
   dates are formatted from our own tables. Russian uses Intl, which is
   correct and handles the genitive month forms for us. */

const UZ_MONTHS_LONG = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

const UZ_MONTHS_SHORT = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyn',
  'iyl',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
];

/** Indexed by ISO weekday - 1 (Monday first). */
const UZ_WEEKDAYS_LONG = [
  'dushanba',
  'seshanba',
  'chorshanba',
  'payshanba',
  'juma',
  'shanba',
  'yakshanba',
];

const UZ_WEEKDAYS_SHORT = ['Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha', 'Yak'];

function formatUzbek(date: Date, options: Intl.DateTimeFormatOptions): string {
  const monthIndex = date.getMonth();
  const month =
    options.month === 'long'
      ? UZ_MONTHS_LONG[monthIndex]
      : options.month === 'short'
        ? UZ_MONTHS_SHORT[monthIndex]
        : '';

  let datePart = '';
  if (options.day && month) datePart = `${date.getDate()}-${month}`;
  else if (options.day) datePart = String(date.getDate());
  else if (month) datePart = month;

  const iso = weekdayOf(date);
  const weekday =
    options.weekday === 'long'
      ? UZ_WEEKDAYS_LONG[iso - 1]
      : options.weekday === 'short'
        ? UZ_WEEKDAYS_SHORT[iso - 1]
        : '';

  if (datePart && weekday) return `${datePart}, ${weekday}`;
  return datePart || weekday;
}

export function formatDate(
  iso: string,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  const date = fromISODate(iso);
  if (locale === 'uz') return formatUzbek(date, options);
  return new Intl.DateTimeFormat('ru-RU', options).format(date);
}

/** 24-hour clock, identical in both languages. */
export function formatTime(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
}

export function formatLongDate(iso: string, locale: Locale): string {
  return formatDate(iso, locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * How a person would refer to this date today: "bugun", "ertaga", or
 * the weekday by name.
 *
 * Seeded copy uses this instead of writing "ertaga" into the text,
 * because the test it refers to is scheduled in teaching days. On a
 * Saturday the next teaching day is Monday, and an announcement that
 * said "tomorrow" would then be wrong — the one thing a demo dataset
 * must never be about its own dates.
 */
export function relativeDayWord(iso: string, locale: Locale): string {
  const delta = daysFromToday(iso);
  if (delta === 0) return locale === 'uz' ? 'bugun' : 'сегодня';
  if (delta === 1) return locale === 'uz' ? 'ertaga' : 'завтра';
  if (delta === -1) return locale === 'uz' ? 'kecha' : 'вчера';

  const weekday = weekdayOfISO(iso);
  if (locale === 'uz') return `${UZ_WEEKDAYS_LONG[weekday - 1]} kuni`;

  const RU_IN = [
    'в понедельник',
    'во вторник',
    'в среду',
    'в четверг',
    'в пятницу',
    'в субботу',
    'в воскресенье',
  ];
  return RU_IN[weekday - 1];
}

/** "08:30" → minutes since midnight, for sorting and "now" comparisons. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function nowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPart(): DayPart {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function dueStatusOf(dueISO: string, completed: boolean): DueStatus {
  if (completed) return 'completed';
  const delta = daysFromToday(dueISO);
  if (delta < 0) return 'overdue';
  if (delta === 0) return 'today';
  if (delta <= 2) return 'soon';
  return 'upcoming';
}
