import type { ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

interface TroubleSummaryPanelProps {
  report: ReportContent;
  /** 見出し横に出す「第N回で記録」などの出典。 */
  source: string;
}

/** 子どもページの概要に、チェックされた困りごとをカテゴリごとに出す。背景の照合はレポートで見る。 */
export function TroubleSummaryPanel({ report, source }: TroubleSummaryPanelProps) {
  const { current, byCategory } = report.troubles;
  return (
    <section className={styles.panel} aria-labelledby="trouble-summary-title">
      <div className={styles.sectionHeader}><div><h2 id="trouble-summary-title">おうちでの困りごと</h2><p className={styles.muted}>{source}・保護者ヒアリング・{current.length}件</p></div></div>
      {byCategory.length ? (
        <ul className={styles.troubleSummary}>
          {byCategory.map((category) => (
            <li key={category.id}>
              <strong><span aria-hidden="true">{category.icon}</span> {category.title}</strong>
              <span>{category.items.join('、')}</span>
            </li>
          ))}
        </ul>
      ) : <p className={styles.muted}>チェックされた困りごとはありません。</p>}
    </section>
  );
}
