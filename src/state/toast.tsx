import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Toast, type ToastMessage } from '@/components/ui/Feedback';

/** Transient confirmations. Deliberately not part of persisted state. */
const ToastContext = createContext<(text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  const show = useCallback((text: string) => {
    setMessage({ id: `${Date.now()}`, text });
  }, []);

  const dismiss = useCallback(() => setMessage(null), []);
  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toast message={message} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): (text: string) => void {
  return useContext(ToastContext);
}
