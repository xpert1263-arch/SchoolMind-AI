import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppMode } from '@/data/types';
import { defaultRouteFor, modeOfPath } from './navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { BottomNav, MobileMenu } from '@/components/layout/MobileNav';
import { useApp } from '@/state/store';

const EASE = [0.32, 0.72, 0, 1] as const;

export function AppShell() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { state, setMode } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  const mode = modeOfPath(pathname);

  /** Returning to a workspace reopens the screen you left it on. */
  const lastRoute = useRef<Record<AppMode, string>>({
    student: defaultRouteFor('student'),
    teacher: defaultRouteFor('teacher'),
  });

  useEffect(() => {
    lastRoute.current[mode] = pathname;
    if (state.mode !== mode) setMode(mode);
  }, [pathname, mode, state.mode, setMode]);

  /* The workspace changes, the application does not reload. */
  const changeMode = useCallback(
    (next: AppMode) => {
      if (next === mode) return;
      setMode(next);
      navigate(lastRoute.current[next] ?? defaultRouteFor(next));
      setMenuOpen(false);
    },
    [mode, navigate, setMode],
  );

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar mode={mode} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          mode={mode}
          pathname={pathname}
          onChangeMode={changeMode}
          onOpenMenu={() => setMenuOpen(true)}
        />

        <main ref={mainRef} className="flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav mode={mode} />
      </div>

      <MobileMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        mode={mode}
        onChangeMode={changeMode}
      />
    </div>
  );
}
