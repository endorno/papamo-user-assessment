import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, type LinkProps } from 'react-router';

import { ConfirmDialog } from '../components/ConfirmDialog';

export interface UnsavedChangesGuard {
  /** 保存されていない変更があるか。呼び出し時点の状態を返すこと。 */
  isDirty: () => boolean;
  /** 保存を即時実行する。成功したら true。 */
  save: () => Promise<boolean>;
  /** 保存せずに移動することをコーチが選んだとき。離脱時の自動送信を止める。 */
  discard?: () => void;
}

interface UnsavedChangesContextValue {
  registerGuard: (guard: UnsavedChangesGuard) => () => void;
  /** 未保存があれば確認してから proceed を実行する。 */
  confirmNavigation: (proceed: () => void) => void;
}

const fallback: UnsavedChangesContextValue = {
  registerGuard: () => () => undefined,
  confirmNavigation: (proceed) => proceed(),
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | undefined>(undefined);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<UnsavedChangesGuard | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerGuard = useCallback((guard: UnsavedChangesGuard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  const confirmNavigation = useCallback((proceed: () => void) => {
    if (!guardRef.current?.isDirty()) {
      proceed();
      return;
    }
    pendingRef.current = proceed;
    setError(null);
    setOpen(true);
  }, []);

  function close() {
    pendingRef.current = null;
    setOpen(false);
    setBusy(false);
    setError(null);
  }

  function proceedWithoutSaving() {
    const proceed = pendingRef.current;
    guardRef.current?.discard?.();
    close();
    proceed?.();
  }

  async function saveThenProceed() {
    const guard = guardRef.current;
    if (!guard) {
      proceedWithoutSaving();
      return;
    }
    setBusy(true);
    setError(null);
    const saved = await guard.save().catch(() => false);
    setBusy(false);
    if (!saved) {
      setError('保存できませんでした。通信を確認するか、保存せずに移動してください。');
      return;
    }
    const proceed = pendingRef.current;
    close();
    proceed?.();
  }

  const value = useMemo<UnsavedChangesContextValue>(
    () => ({ registerGuard, confirmNavigation }),
    [confirmNavigation, registerGuard],
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={open}
        tone="primary"
        title="保存が終わっていません"
        message="この画面を離れる前に、入力内容を保存しますか？"
        confirmLabel="保存して移動"
        cancelLabel="入力に戻る"
        secondary={{ label: '保存せずに移動', onClick: proceedWithoutSaving }}
        busy={busy}
        error={error}
        onCancel={close}
        onConfirm={() => void saveThenProceed()}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  return useContext(UnsavedChangesContext) ?? fallback;
}

/**
 * 未保存の入力がある画面から離れるリンク。
 * 既定の遷移を止めて確認ダイアログを挟むが、新しいタブで開く操作はそのまま通す。
 */
export function GuardedLink({ to, onClick, ...props }: LinkProps) {
  const navigate = useNavigate();
  const { confirmNavigation } = useUnsavedChanges();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    confirmNavigation(() => void navigate(to));
  }

  return <Link to={to} onClick={handleClick} {...props} />;
}
