import { useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Sun } from 'lucide-react';
import type { AppMode, Locale } from '@/data/types';
import { findNavItem, modeIcons } from '@/app/navigation';
import { useAuth } from '@/auth/AuthProvider';
import { fullName, initialsOf } from '@/data/queries';
import { locales, localeLabels } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { useApp } from '@/state/store';
import { useCurrentStudent, useCurrentTeacher, useNotifications } from '@/state/selectors';
import { Avatar } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { LogoMark } from '@/components/brand/Logo';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/dates';

export function Topbar({
  mode,
  pathname,
  onOpenMenu,
}: {
  mode: AppMode;
  pathname: string;
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
        <span className="hidden sm:inline lg:hidden">
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

      {/* Where the Student/Teacher switch used to be. Since v1.3 the
          role comes from the login, so this says who is signed in
          instead of offering to become somebody else. */}
      <div className="mx-auto hidden min-w-0 sm:block">
        <SignedInChip mode={mode} />
      </div>

      {/* Phones carry only notifications here; language, theme, the
          profile and sign-out live in the slide-over menu, so the bar
          stays legible at 375px. */}
      <div className="flex shrink-0 items-center gap-1">
        <span className="hidden sm:flex">
          <LocaleToggle locale={locale} onChange={setLocale} />
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          onClick={toggleTheme}
          aria-label={t('a11y.toggleTheme')}
          title={isDark ? t('settings.light') : t('settings.dark')}
        >
          {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
        </Button>

        <NotificationsButton />

        <span className="hidden sm:block">
          <Popover
            label={t('a11y.profile')}
            widthClass="w-64"
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
        </span>
      </div>
    </header>
  );
}

/** Name, role and class of whoever is signed in. */
function SignedInChip({ mode }: { mode: AppMode }) {
  const { t } = useI18n();
  const { student, schoolClass } = useCurrentStudent();
  const { teacher } = useCurrentTeacher();
  const Icon = modeIcons[mode];

  const person = mode === 'student' ? student : teacher;
  const caption =
    mode === 'student' ? `${t('mode.student')} · ${schoolClass.name}` : t('mode.teacher');

  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-1.5 shadow-subtle">
      <Avatar name={fullName(person)} initials={initialsOf(person)} size={26} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[13px] font-medium text-ink">{fullName(person)}</p>
        <p className="flex items-center gap-1 truncate text-[11px] text-ink-subtle">
          <Icon size={10} aria-hidden />
          {caption}
        </p>
      </div>
    </div>
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
            value === locale ? 'bg-surface-muted text-ink' : 'text-ink-subtle hover:text-ink',
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
  const { markAnnouncementsRead } = useApp();
  const { items, unreadIds } = useNotifications();

  return (
    <Popover
      label={t('settings.notifications')}
      /* Opening the panel is reading it: exactly the notices now on
         screen are marked, so a later one brings the dot back. */
      onOpen={() => markAnnouncementsRead(items.map((item) => item.id))}
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
          {unreadIds.length > 0 ? (
            <span
              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent ring-2 ring-canvas"
              aria-label={t('settings.unread', { n: unreadIds.length })}
            />
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
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {t('auth.signedInAs')}
      </p>
      <div className="flex items-center gap-2.5">
        <Avatar name={fullName(person)} initials={initialsOf(person)} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{fullName(person)}</p>
          <p className="truncate text-[12px] text-ink-subtle">
            {t(`mode.${mode}`)} · {caption}
          </p>
        </div>
      </div>
      <p className="mt-3 rounded-md bg-surface-muted px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-subtle">
        {t('auth.demoNote')}
      </p>
      <LogoutButton className="mt-3 w-full" />
    </div>
  );
}

/** Ends the session and nothing else — school data, teacher-created
 *  assignments and the study plan all survive signing out. */
export function LogoutButton({ className }: { className?: string }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <Button
      variant="secondary"
      size="sm"
      className={className}
      iconLeft={<LogOut size={14} aria-hidden />}
      onClick={() => {
        signOut();
        navigate('/login', { replace: true });
      }}
    >
      {t('auth.logout')}
    </Button>
  );
}
