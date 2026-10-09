import styles from './ui.module.css';
import { useClipboardCopy } from './useClipboardCopy';

export function CopyCode({
  code,
  label,
  description,
  sensitive = false,
}: {
  code: string;
  label: string;
  description: string;
  sensitive?: boolean;
}) {
  const { message, copy } = useClipboardCopy(code, 'コピーできませんでした。コードを選択してコピーしてください。');

  return (
    <div className={`${styles.codeCard} ${sensitive ? styles.codeCardSensitive : ''}`}>
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <div className={styles.codeValueRow}>
        <code>{code}</code>
        <button type="button" onClick={() => void copy()}>コピー</button>
      </div>
      <span className={styles.srStatus} role="status" aria-live="polite">{message}</span>
    </div>
  );
}
