import { useEffect, useRef } from 'react';

import styles from '../styles/page.module.css';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, open]);

  if (!open) return null;
  return (
    <div className={styles.confirmBackdrop}>
      <div className={styles.confirmDialog} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className={styles.inlineActions}>
          <button ref={cancelButtonRef} className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
          <button className={styles.dangerButton} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
