import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Loader2, Moon, School, Sun } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Field, TextInput } from '@/components/ui/Field';
import { school } from '@/data/school';
import { locales, localeLabels } from '@/i18n';
import { useI18n } from '@/i18n/useI18n';
import { defaultRouteFor } from '@/app/navigation';
import { cn } from '@/lib/cn';
import { useApp } from '@/state/store';

/* ------------------------------------------------------------------
   The one door into SchoolMind.

   Two workspaces live behind it; which one opens is decided by the
   credentials, not by a switch in the interface. The page is a full
   bleed split on large screens — brand on the left, the form on the
   right — and collapses to a single centred column on phones.

   The demo credentials are deliberately not printed anywhere here.
   ------------------------------------------------------------------ */

type Status = 'idle' | 'submitting' | 'error';

export function Login() {
  const { t, text, locale } = useI18n();
  const { session, signIn } = useAuth();
  const { state, setLocale, toggleTheme } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<'auth.invalid' | 'auth.empty' | null>(null);

  const loginRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    loginRef.current?.focus();
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  /* Already signed in: never show the form again, just go through. */
  if (session) {
    const from = (location.state as { from?: string } | null)?.from;
    const fallback = defaultRouteFor(session.role);
    const target = from && from.startsWith(`/${session.role}`) ? from : fallback;
    return <Navigate to={target} replace />;
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (status === 'submitting') return;

    if (!login.trim() || !password) {
      setStatus('error');
      setErrorKey('auth.empty');
      return;
    }

    setStatus('submitting');
    setErrorKey(null);

    /* A short beat so the transition reads as entering a workspace
       rather than the page flickering. */
    timerRef.current = window.setTimeout(() => {
      const result = signIn(login, password);
      if (!result.ok) {
        setStatus('error');
        setErrorKey('auth.invalid');
        setPassword('');
        loginRef.current?.focus();
        return;
      }
      navigate(defaultRouteFor(result.session.role), { replace: true });
    }, 320);
  };

  const isDark = state.theme === 'dark';
  const busy = status === 'submitting';

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:flex-row">
      {/* ---- brand side ------------------------------------------------ */}
      <section className="relative isolate flex shrink-0 flex-col justify-between overflow-hidden border-b border-line bg-surface px-5 py-6 sm:px-8 lg:w-[46%] lg:max-w-[620px] lg:border-b-0 lg:border-r lg:px-12 lg:py-10">
        {/* A single soft accent wash — the page's only decoration. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-28 h-[22rem] w-[22rem] rounded-full bg-accent/10 blur-3xl"
        />

        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <span className="flex min-w-0 flex-col leading-none">
            <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
              {t('app.name')}
            </span>
            <span className="mt-1 truncate text-[11.5px] text-ink-subtle">{t('app.tagline')}</span>
          </span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
          className="hidden max-w-md py-14 lg:block"
        >
          <h1 className="text-[34px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {t('planner.heading')}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">{t('ask.subtitle')}</p>
        </motion.div>

        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-ink-subtle lg:mt-0">
          <School size={14} aria-hidden className="shrink-0" />
          <span className="truncate font-medium text-ink-muted">{text(school.name)}</span>
        </p>
      </section>

      {/* ---- form side -------------------------------------------------- */}
      <section className="flex min-w-0 flex-1 flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <div className="flex items-center justify-end gap-1.5">
          <div
            role="group"
            aria-label={t('a11y.changeLanguage')}
            className="flex items-center rounded-md border border-line bg-surface p-0.5"
          >
            {locales.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLocale(value)}
                aria-pressed={value === locale}
                className={cn(
                  'rounded px-2 py-1 text-[11.5px] font-semibold transition-colors',
                  value === locale ? 'bg-surface-muted text-ink' : 'text-ink-subtle hover:text-ink',
                )}
              >
                {localeLabels[value]}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={t('a11y.toggleTheme')}
            title={isDark ? t('settings.light') : t('settings.dark')}
          >
            {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
            className="w-full max-w-[22rem]"
          >
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
              {t('auth.welcome')}
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">{t('auth.subtitle')}</p>

            <form onSubmit={submit} className="mt-7 flex flex-col gap-4" noValidate>
              <Field label={t('auth.login')} htmlFor="auth-login">
                <TextInput
                  id="auth-login"
                  ref={loginRef}
                  name="username"
                  value={login}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={busy}
                  aria-invalid={status === 'error'}
                  placeholder={t('auth.loginPlaceholder')}
                  onChange={(e) => {
                    setLogin(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  className="h-10"
                />
              </Field>

              <Field label={t('auth.password')} htmlFor="auth-password">
                <div className="relative">
                  <TextInput
                    id="auth-password"
                    name="password"
                    type={reveal ? 'text' : 'password'}
                    value={password}
                    autoComplete="current-password"
                    disabled={busy}
                    aria-invalid={status === 'error'}
                    placeholder={t('auth.passwordPlaceholder')}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (status === 'error') setStatus('idle');
                    }}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-ink-subtle transition-colors hover:text-ink"
                  >
                    {reveal ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                </div>
              </Field>

              {/* Reserved space, so the form does not jump when it fails. */}
              <div className="min-h-[20px]" role="alert" aria-live="polite">
                {errorKey ? (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-1.5 text-[12.5px] font-medium text-danger-text"
                  >
                    <AlertCircle size={13} aria-hidden className="shrink-0" />
                    {t(errorKey)}
                  </motion.p>
                ) : null}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={busy}
                className="w-full"
                iconLeft={busy ? <Loader2 size={15} aria-hidden className="animate-spin" /> : null}
              >
                {busy ? t('auth.submitting') : t('auth.submit')}
              </Button>
            </form>

            <p className="mt-6 border-t border-line pt-4 text-[11.5px] leading-relaxed text-ink-subtle">
              {t('auth.demoNote')}
            </p>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
