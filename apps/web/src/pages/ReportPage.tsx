import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { exerciseByKey, reportContentSchema, type ReportContent } from '@papamo/shared';
import styles from '../styles/page.module.css';

export function ReportPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [report, setReport] = useState<ReportContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    void apiRequest<unknown>(`/assessments/${id}/report`, session)
      .then((response) => {
        const parsed = reportContentSchema.safeParse((response as { report?: unknown }).report);
        if (!parsed.success) throw new Error('レポートを読み込めませんでした。');
        setReport(parsed.data as ReportContent);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。'));
  }, [id, session]);

  if (error) return <main className={styles.page}><p className={styles.error} role="alert">{error}</p></main>;
  if (!report) return <main className={styles.page}><p>読み込み中…</p></main>;

  return (
    <main className={`${styles.page} ${styles.reportPage}`}>
      <div className={styles.pageInner}>
        <div className={styles.reportActions}>
          <Link to="/" className={styles.backLink}>← 一覧に戻る</Link>
          <button className={styles.primaryButton} type="button" onClick={() => window.print()}>印刷 / PDF</button>
        </div>
        <section className="sheet" aria-labelledby="report-page-one">
          <p className={styles.eyebrow}>へやすぽ 育ちマップ {report.header.seqNo}回目</p>
          <h1 id="report-page-one">{report.kind === 'comparison' ? `${report.header.childName}の3か月の変化` : `${report.header.childName}の現在地と強み`}</h1>
          <p className={styles.muted}>{report.header.grade}（{report.header.ageHint}）・{report.header.assessedOn}・担当 {report.header.coachName}</p>
          <p className={styles.lead}>{report.link.text}</p>
          <h2>到達レベル</h2>
          <ul>{report.levels.map((level) => <li key={level.key}>{exerciseByKey(level.key).name}：Lv{level.lv}・{level.band}（{level.ladderLabel}）{level.delta === undefined ? '' : ` ${level.delta >= 0 ? '▲' : '▼'}${Math.abs(level.delta)}`}</li>)}</ul>
          {report.changes3m?.length ? <><h2>3か月で変わったこと</h2><ul>{report.changes3m.map((change) => <li key={change}>{change}</li>)}</ul></> : null}
          {report.upcomingExercises.length ? <div className={styles.upcoming}><h2>これから加わる種目（半年目以降）</h2>{report.upcomingExercises.map((exercise) => <p key={exercise.key}><strong>{exercise.name}</strong>（{exercise.parentName}）<br />{exercise.teaser}</p>)}</div> : null}
          <h2>これから特に伸ばしたい力</h2>
          <ul>{report.priorities.map((priority) => <li key={priority.key}>{priority.parentName}（Lv{priority.lv}）</li>)}</ul>
          <h2>今できていること</h2>
          <ul>{report.strengths.map((strength) => <li key={strength.key}>{strength.parentName}（Lv{strength.lv}）</li>)}</ul>
        </section>
        <section className="sheet" aria-labelledby="report-page-two">
          <h1 id="report-page-two">{report.kind === 'comparison' ? '困りごとと、ご家庭の負担の変化' : '今のお困りごとと、その理由'}</h1>
          <h2>困りごと</h2>
          <ul>{report.troubles.current.map((trouble) => <li key={trouble}>{trouble}</li>)}</ul>
          {report.kind === 'comparison' ? <div className={styles.changeGrid}>
            {report.troubles.gone?.length ? <div><strong>なくなったこと</strong>{report.troubles.gone.map((trouble) => <span className={styles.pill} key={trouble}>{trouble}</span>)}</div> : null}
            {report.troubles.stayed?.length ? <div><strong>続いていること</strong>{report.troubles.stayed.map((trouble) => <span className={styles.pill} key={trouble}>{trouble}</span>)}</div> : null}
            {report.troubles.added?.length ? <div><strong>新しく出てきたこと</strong>{report.troubles.added.map((trouble) => <span className={styles.pill} key={trouble}>{trouble}</span>)}</div> : null}
          </div> : null}
          <p className={styles.lead}>{report.link.text}</p>
          <h2>ご家庭の負担度</h2>
          <ul>{Object.entries(report.ppi.current).map(([key, value]) => <li key={key}>{key}：{value} / 5</li>)}</ul>
          {report.ppi.previous ? <p className={styles.muted}>前回：{Object.values(report.ppi.previous).join(' / ')} / 5</p> : null}
          {report.ppi.note ? <p className={styles.lead}>「{report.ppi.note}」</p> : null}
        </section>
        <section className="sheet" aria-labelledby="report-page-three">
          <h1 id="report-page-three">これからの3か月</h1>
          {report.plan ? <><h2>{report.plan.name}（{report.plan.window}）</h2><ul>{report.plan.items.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
          <h2>レッスンで大切にすること</h2>
          <ul>{report.priorities.flatMap((priority) => priority.build.map((item) => ({ key: priority.key, item }))).map(({ key, item }) => <li key={`${key}-${item}`}>{item}</li>)}</ul>
          <h2>3か月後にこう変わるはず</h2>
          <ul>{report.outlook.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className={styles.lead}>次回の目安：{report.nextDue}</p>
          {report.upcomingExercises.length ? <p className={styles.upcoming}>🔓 半年目以降、4・5種目目を追加</p> : null}
        </section>
      </div>
    </main>
  );
}
