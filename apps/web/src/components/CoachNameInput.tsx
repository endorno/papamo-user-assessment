import { COACH_TITLE, DISPLAY_NAME_MAX_LENGTH } from '@papamo/shared';

import styles from './ui.module.css';

/**
 * 表示名の入力欄。「コーチ」は全コーチ共通で自動で付くため、名前の部分だけを入力させる。
 * 付け忘れも二重付けも起きないよう、「コーチ」は欄の外に固定で見せる。
 */
export function CoachNameInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hintId = `${id}-hint`;

  return (
    <>
      <div className={styles.coachNameInput}>
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          placeholder="さとう"
          aria-describedby={hintId}
          required
        />
        <span className={styles.coachTitle} aria-hidden="true">{COACH_TITLE}</span>
      </div>
      <small id={hintId} className={styles.coachNameHint}>
        名前だけを入力してください。「{COACH_TITLE}」は自動でつきます。
      </small>
    </>
  );
}
