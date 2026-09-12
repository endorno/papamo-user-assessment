import { useEffect, useId, useRef, type ReactNode } from 'react';

import styles from '../styles/page.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** danger は取り消せない操作。既定のフォーカスはキャンセル側に置く。 */
  tone?: 'danger' | 'primary';
  cancelLabel?: string;
  /** 3つ目の選択肢（例：新規作成ではなく前回を編集する）。 */
  secondary?: { label: string; onClick: () => void };
  /** 判断材料になる補足（前回の実施日など）。 */
  detail?: ReactNode;
  busy?: boolean;
  error?: string | null;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onCancel,
  onConfirm,
  tone = 'danger',
  cancelLabel = 'キャンセル',
  secondary,
  detail,
  busy = false,
  error = null,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // 取り消せない操作は、誤ってEnterで確定しないようキャンセルから始める。
      (tone === 'danger' ? cancelRef : confirmRef).current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, tone]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.confirmDialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (!busy && event.target === dialogRef.current) onCancel();
      }}
    >
      <form method="dialog">
        <h2 id={titleId}>{title}</h2>
        <p>{message}</p>
        {detail ? <div className={styles.confirmDetail}>{detail}</div> : null}
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <div className={styles.confirmActions}>
          <button className={styles.secondaryButton} ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          {secondary ? (
            <button className={styles.secondaryButton} type="button" disabled={busy} onClick={secondary.onClick}>
              {secondary.label}
            </button>
          ) : null}
          <button
            className={tone === 'danger' ? styles.dangerButton : styles.primaryButton}
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
