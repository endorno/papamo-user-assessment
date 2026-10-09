import { SHORT_CHILD_ID_LENGTH, shortChildId } from '@papamo/shared';

import styles from './ui.module.css';
import { useClipboardCopy } from './useClipboardCopy';

/**
 * 同じお名前のお子さまを見分けるための短縮ID。コーチ同士で伝え合えるよう、同名がいなくても常に出す。
 * 全体はマウスを重ねると見られる（ホバーのないスマホでは「登録・共有」タブの ChildFullId で見る）。
 */
export function ChildShortId({ id, className }: { id: string; className?: string | undefined }) {
  return (
    <span className={[styles.childShortId, className].filter(Boolean).join(' ')} title={`ID：${id}`}>
      #{shortChildId(id)}
    </span>
  );
}

/** IDの全体。問い合わせで伝えられるようコピーでき、一覧の「#」と同じ末尾を太字にする。 */
export function ChildFullId({ id }: { id: string }) {
  const { message, copy } = useClipboardCopy(id, 'コピーできませんでした。IDを選択してコピーしてください。');
  return (
    <span className={styles.childFullId}>
      <code>{id.slice(0, -SHORT_CHILD_ID_LENGTH)}<strong>{id.slice(-SHORT_CHILD_ID_LENGTH)}</strong></code>
      <button type="button" onClick={() => void copy()} aria-label="IDをコピー">コピー</button>
      <span className={styles.childFullIdStatus} role="status" aria-live="polite">{message}</span>
    </span>
  );
}
