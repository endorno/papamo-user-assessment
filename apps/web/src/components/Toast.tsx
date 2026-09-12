import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import styles from './ui.module.css';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, options?: { action?: ToastAction }) => void;
}

// 読むだけの通知は4秒。操作つきは押す時間がいるので長めに出す。
const DISMISS_MS = 4000;
const DISMISS_WITH_ACTION_MS = 8000;

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, options?: { action?: ToastAction }) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, action: options?.action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast((current) => (current?.id === toast.id ? null : current)),
      toast.action ? DISMISS_WITH_ACTION_MS : DISMISS_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);

  const value = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastArea} role="status" aria-live="polite" data-print-hidden>
        {toast ? (
          <div className={styles.toast} key={toast.id}>
            <span>{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button className={styles.toastClose} type="button" aria-label="通知を閉じる" onClick={() => setToast(null)}>
              ×
            </button>
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}

// プロバイダ外（テストで画面単体を描くときなど）では通知を出さずに無視する。
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? { showToast: () => undefined };
}
