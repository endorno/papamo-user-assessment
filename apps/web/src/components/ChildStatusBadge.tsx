import type { ChildListState } from '@papamo/shared';

import styles from './ui.module.css';

const STATE_ICON: Record<ChildListState['key'], string> = {
  draft: '●',
  due: '!',
  first: '○',
  ok: '✓',
};

export function ChildStatusBadge({ state }: { state: ChildListState | null }) {
  if (!state) return <span className={`${styles.statusBadge} ${styles.statusArchived}`}>保管中</span>;
  return (
    <span className={`${styles.statusBadge} ${styles[`status${state.key}`]}`}>
      <span aria-hidden="true">{STATE_ICON[state.key]}</span>
      {state.label}
    </span>
  );
}
