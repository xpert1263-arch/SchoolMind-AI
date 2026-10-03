import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AppMode } from '@/data/types';
import { useSession } from '@/auth/AuthProvider';
import { defaultRouteFor } from './navigation';

/* ------------------------------------------------------------------
   Route access.

   Two rules, applied in one place:
     - no session            -> /login
     - session, wrong role   -> that role's own workspace

   Both redirects always land somewhere the rule allows, so there is
   no path that can bounce between guards.
   ------------------------------------------------------------------ */

/** Everything below the shell requires a session. */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (!session) {
    /* Remember where they were headed so the login can return them. */
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** A workspace only its own role may enter. */
export function RequireRole({ role }: { role: AppMode }) {
  const session = useSession();

  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== role) return <Navigate to={defaultRouteFor(session.role)} replace />;
  return <Outlet />;
}

/** `/` and `/login` both resolve through here. */
export function SessionRedirect() {
  const session = useSession();
  return <Navigate to={session ? defaultRouteFor(session.role) : '/login'} replace />;
}
