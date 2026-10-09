import { PPI_QUESTIONS, PPI_SCORE_MAX, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

interface TroubleSummaryPanelProps {
  report: ReportContent;
  /** 見出し横に出す「第N回で記録」などの出典。 */
  source: string;
}

/** 子どもページの概要に、困りごとの件数とご家庭のお困り度だけを出す。照合の詳細はレポートで見る。 */
export function TroubleSummaryPanel({ report, source }: TroubleSummaryPanelProps) {
  const ppiTotal = Object.values(report.ppi.current).reduce((sum, value) => sum + value, 0);
  return (
    <section className={styles.panel} aria-labelledby="trouble-summary-title">
      <div className={styles.sectionHeader}><div><h2 id="trouble-summary-title">おうちでの困りごと・ご家庭の負担</h2><p className={styles.muted}>{source}・保護者ヒアリング</p></div></div>
      <div className={styles.summaryMetrics}>
        <div><span>チェックされた困りごと</span><strong>{report.troubles.current.length}件</strong></div>
        <div><span>ご家庭の負担度 合計</span><strong>{ppiTotal}<small> / {PPI_QUESTIONS.length * PPI_SCORE_MAX}</small></strong></div>
      </div>
      <div className={styles.ppiBars}>
        {PPI_QUESTIONS.map((question) => {
          const value = report.ppi.current[question.key];
          return <div key={question.key}><span>{question.name}</span><span className={styles.ppiTrack}><i style={{ width: `${(value / PPI_SCORE_MAX) * 100}%` }} /></span><strong>{value}</strong></div>;
        })}
      </div>
      {report.ppi.note ? <p className={styles.memo}>最も負担の場面：「{report.ppi.note}」</p> : null}
    </section>
  );
}
