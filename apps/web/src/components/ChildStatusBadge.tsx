import type { ChildListState } from '@papamo/shared';

import { formatJapaneseMonthDay } from '../utils/display';
import styles from './ui.module.css';

const STATE_ICON: Record<ChildListState['key'], string> = {
  draft: '●',
  due: '!',
  first: '○',
  ok: '✓',
};

// 日付は画面のほかの表記にそろえる（status.ts の label は ISO のまま）。
function stateLabel(state: ChildListState): string {
  return state.key === 'ok' ? `次回 ${formatJapaneseMonthDay(state.dueDate)} 予定` : state.label;
}

export function ChildStatusBadge({ state }: { state: ChildListState | null }) {
  if (!state) return <span className={`${styles.statusBadge} ${styles.statusArchived}`}>保管中</span>;
  return (
    <span className={`${styles.statusBadge} ${styles[`status${state.key}`]}`}>
      <span aria-hidden="true">{STATE_ICON[state.key]}</span>
      {stateLabel(state)}
    </span>
  );
}
