import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import styles from '../styles/page.module.css';

const MAX_GOALS = 5;
const MAX_GOAL_LENGTH = 100;

export function parseSpreadsheetGoals(value: string): string[] {
  return [...new Set(
    value
      .split(/[\t\r\n]+/)
      .map((goal) => goal.trim())
      .filter(Boolean),
  )];
}

export function SpreadsheetGoalImportDialog({
  open,
  onCancel,
  onImport,
}: {
  open: boolean;
  onCancel: () => void;
  onImport: (goals: string[]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPastedText('');
      setError(null);
      dialog.showModal();
      textareaRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function importGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const goals = parseSpreadsheetGoals(pastedText);
    if (!goals.length) {
      setError('取り込む目標を貼り付けてください。');
      return;
    }
    if (goals.length > MAX_GOALS) {
      setError(`目標は${MAX_GOALS}件までです。貼り付けるセルを確認してください。`);
      return;
    }
    if (goals.some((goal) => goal.length > MAX_GOAL_LENGTH)) {
      setError(`1件の目標は${MAX_GOAL_LENGTH}文字以内にしてください。`);
      return;
    }
    onImport(goals);
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.confirmDialog} ${styles.importDialog}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
    >
      <form onSubmit={importGoals}>
        <h2 id={titleId}>入会アンケートから目標を取り込む</h2>
        <p id={descriptionId}>
          Googleスプレッドシートで目標の回答セルを選んでコピーし、そのまま貼り付けてください。行または列に並んだ回答を最大5件まで取り込めます。
        </p>
        <div className={styles.formField}>
          <label htmlFor="spreadsheet-goals">コピーした目標</label>
          <textarea
            id="spreadsheet-goals"
            ref={textareaRef}
            className={styles.importTextarea}
            value={pastedText}
            onChange={(event) => {
              setPastedText(event.target.value);
              setError(null);
            }}
            rows={7}
            placeholder={'転びにくくなってほしい\t着替えを自分でできるようになりたい'}
          />
        </div>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <div className={styles.confirmActions}>
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
          <button className={styles.primaryButton} type="submit">目標欄に取り込む</button>
        </div>
      </form>
    </dialog>
  );
}
