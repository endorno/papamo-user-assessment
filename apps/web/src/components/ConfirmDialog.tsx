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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.confirmDialog}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <form method="dialog">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        <div className={styles.inlineActions}>
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
          <button className={styles.dangerButton} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
