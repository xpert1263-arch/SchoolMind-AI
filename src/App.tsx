import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/routes';
import { AppProvider } from '@/state/store';
import { ToastProvider } from '@/state/toast';

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AppProvider>
  );
}
