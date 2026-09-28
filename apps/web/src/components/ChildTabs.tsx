import { useRef, type KeyboardEvent } from 'react';

import styles from '../styles/page.module.css';

export const CHILD_TABS = [
  { key: 'overview', label: '概要' },
  { key: 'plan', label: '振り返りと計画' },
  { key: 'settings', label: '登録・共有' },
] as const;

export type ChildTabKey = (typeof CHILD_TABS)[number]['key'];

export function isChildTabKey(value: string | null): value is ChildTabKey {
  return CHILD_TABS.some((tab) => tab.key === value);
}

export function tabPanelProps(key: ChildTabKey) {
  return { role: 'tabpanel', id: `child-tabpanel-${key}`, 'aria-labelledby': `child-tab-${key}` } as const;
}

interface ChildTabsProps {
  current: ChildTabKey;
  onSelect: (key: ChildTabKey) => void;
}

/** 子どもページの切り替えタブ。矢印キーで隣のタブへ移れる（WAI-ARIA の tabs パターン）。 */
export function ChildTabs({ current, onSelect }: ChildTabsProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const index = CHILD_TABS.findIndex((tab) => tab.key === current);
    const last = CHILD_TABS.length - 1;
    const nextIndex = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    onSelect(CHILD_TABS[nextIndex]!.key);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div className={styles.childTabs} role="tablist" aria-label="お子さまのページ" onKeyDown={moveFocus}>
      {CHILD_TABS.map((tab, index) => {
        const selected = tab.key === current;
        return (
          <button
            key={tab.key}
            ref={(element) => { buttons.current[index] = element; }}
            id={`child-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`child-tabpanel-${tab.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
