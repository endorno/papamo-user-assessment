import { useEffect, useId, useRef } from 'react';

import { WANT_GROUPS, WANT_ITEMS, wantToGoalText, type WantId } from '@papamo/shared';
import styles from '../styles/page.module.css';

/**
 * 「目標を追加」で開く候補。選ぶと仮の文言と候補の id、「候補を使わずに書く」なら空の文言だけで onPick を呼ぶ。
 * 選んだ候補は目標の行に持たせ、入力画面で薄く見せて優先する領域の判定に使う（2026-11-10）。
 */
export function GoalCandidateDialog({
  open,
  onCancel,
  onPick,
}: {
  open: boolean;
  onCancel: () => void;
  onPick: (text: string, wantId?: WantId) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.confirmDialog} ${styles.goalCandidateDialog}`}
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
      <h2 id={titleId}>目標を追加</h2>
      <p id={descriptionId}>
        お困りごと（いま困っていること）とは別に、達成したい具体的なことを目標にします。候補を選ぶと仮の文言が入るので、ご家族の言葉に書き換えてください。選んだ候補は目標の上に薄く残ります。別の目標に書き換えたときは「外す」を押してください。
      </p>
      <button className={`${styles.secondaryButton} ${styles.goalFreeButton}`} type="button" onClick={() => onPick('')}>
        候補を使わずに書く
      </button>
      {WANT_GROUPS.map((group) => (
        <section className={styles.goalCandidateGroup} key={group} aria-label={`候補：${group}`}>
          <h3>{group}</h3>
          <div className={styles.goalCandidateList}>
            {WANT_ITEMS.filter((item) => item.group === group).map((item) => {
              const text = wantToGoalText(item.text);
              return (
                <button className={styles.goalCandidate} type="button" key={item.id} onClick={() => onPick(text, item.id)}>
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{text}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div className={styles.confirmActions}>
        <button className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
      </div>
    </dialog>
  );
}
