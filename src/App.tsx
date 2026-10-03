import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/routes';
import { AuthProvider } from '@/auth/AuthProvider';
import { AppProvider } from '@/state/store';
import { ToastProvider } from '@/state/toast';

/* Auth sits outermost: the store attributes records to whoever is
   signed in, so it needs the session to already exist. */
export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </AppProvider>
    </AuthProvider>
  );
}
