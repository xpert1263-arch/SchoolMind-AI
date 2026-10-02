import { Bell, Menu, Moon, Sun } from 'lucide-react';
import type { AppMode, Locale } from '@/data/types';
import { findNavItem } from '@/app/navigation';
import { fullName, initialsOf } from '@/data/queries';
import { locales, localeLabels } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { useApp } from '@/state/store';
import { useAnnouncements, useCurrentStudent, useCurrentTeacher } from '@/state/selectors';
import { Avatar } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/dates';
import { ModeSwitch } from './ModeSwitch';

export function Topbar({
  mode,
  pathname,
  onChangeMode,
  onOpenMenu,
}: {
  mode: AppMode;
  pathname: string;
  onChangeMode: (mode: AppMode) => void;
  onOpenMenu: () => void;
}) {
  const { t, locale } = useI18n();
  const { state, setLocale, toggleTheme } = useApp();
  const current = findNavItem(pathname);
  const isDark = state.theme === 'dark';

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-3 backdrop-blur-md sm:px-5">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label={t('a11y.openMenu')}
      >
        <Menu size={18} aria-hidden />
      </Button>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="lg:hidden">
          <LogoMark size={24} />
        </span>
        <div className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex">
          <span className="truncate text-ink-subtle">
            {mode === 'student' ? t('mode.studentWorkspace') : t('mode.teacherWorkspace')}
          </span>
          <span className="text-ink-subtle/60" aria-hidden>
            /
          </span>
          <span className="truncate font-medium text-ink">
            {current ? t(current.labelKey) : t('app.name')}
          </span>
        </div>
      </div>

      <div className="mx-auto">
        <ModeSwitch mode={mode} onChange={onChangeMode} compact />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <LocaleToggle locale={locale} onChange={setLocale} />

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={t('a11y.toggleTheme')}
          title={isDark ? t('settings.light') : t('settings.dark')}
        >
          {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
        </Button>

        <NotificationsButton />

        <Popover
          label={t('a11y.profile')}
          widthClass="w-60"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-label={t('a11y.profile')}
              className="ml-0.5 rounded-full transition-opacity hover:opacity-85"
            >
              <ProfileAvatar mode={mode} />
            </button>
          )}
        >
          {() => <ProfileCard mode={mode} />}
        </Popover>
      </div>
    </header>
  );
}

function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  const { t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('a11y.changeLanguage')}
      className="mr-1 flex items-center rounded-md border border-line bg-surface p-0.5"
    >
      {locales.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={value === locale}
          className={cn(
            'rounded px-1.5 py-1 text-[11px] font-semibold transition-colors',
            value === locale
              ? 'bg-surface-muted text-ink'
              : 'text-ink-subtle hover:text-ink',
          )}
        >
          {localeLabels[value]}
        </button>
      ))}
    </div>
  );
}

function NotificationsButton() {
  const { t, text, locale } = useI18n();
  const items = useAnnouncements(3);

  return (
    <Popover
      label={t('settings.notifications')}
      trigger={({ toggle, open }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={t('a11y.notifications')}
          aria-expanded={open}
          className="relative"
        >
          <Bell size={17} aria-hidden />
          {items.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-canvas" />
          ) : null}
        </Button>
      )}
    >
      {() => (
        <div>
          <p className="border-b border-line px-3.5 py-2.5 text-[13px] font-semibold text-ink">
            {t('settings.notifications')}
          </p>
          {items.length === 0 ? (
            <div className="px-3.5 py-5 text-center">
              <p className="text-[13px] text-ink">{t('settings.noNotifications')}</p>
              <p className="mt-1 text-[12px] text-ink-subtle">{t('settings.notificationsHint')}</p>
            </div>
          ) : (
            <ul className="sm-divide max-h-72 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="px-3.5 py-2.5">
                  <p className="text-[13px] font-medium leading-snug text-ink">{text(item.title)}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-subtle">
                    {formatDate(item.date, locale)} · {t(`announcement.${item.category}`)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  );
}

function ProfileAvatar({ mode }: { mode: AppMode }) {
  const { student } = useCurrentStudent();
  const { teacher } = useCurrentTeacher();
  const person = mode === 'student' ? student : teacher;
  return <Avatar name={fullName(person)} initials={initialsOf(person)} size={30} />;
}

function ProfileCard({ mode }: { mode: AppMode }) {
  const { t, text } = useI18n();
  const { student, schoolClass } = useCurrentStudent();
  const { teacher } = useCurrentTeacher();
  const person = mode === 'student' ? student : teacher;
  const caption = mode === 'student' ? schoolClass.name : text(teacher.title);

  return (
    <div className="p-3.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={fullName(person)} initials={initialsOf(person)} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{fullName(person)}</p>
          <p className="truncate text-[12px] text-ink-subtle">{caption}</p>
        </div>
      </div>
      <p className="mt-3 rounded-md bg-surface-muted px-2.5 py-2 text-[11.5px] text-ink-subtle">
        {t('settings.demoAccount')}
      </p>
    </div>
  );
}
