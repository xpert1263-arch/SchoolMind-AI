import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useSession } from '@/auth/AuthProvider';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { BottomNav, MobileMenu } from '@/components/layout/MobileNav';
import { useApp } from '@/state/store';
import { modeOfPath } from './navigation';

const EASE = [0.32, 0.72, 0, 1] as const;

export function AppShell() {
  const { pathname } = useLocation();
  const session = useSession();
  const { state, setMode } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);

  /* Since v1.3 the workspace follows the signed-in role, not a switch
     in the interface. The path is only a fallback for the instant
     before a redirect settles. */
  const mode = session?.role ?? modeOfPath(pathname);

  useEffect(() => {
    if (state.mode !== mode) setMode(mode);
  }, [mode, state.mode, setMode]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-dvh bg-canvas">
      <Sidebar mode={mode} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar mode={mode} pathname={pathname} onOpenMenu={() => setMenuOpen(true)} />

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

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} mode={mode} />
    </div>
  );
}
