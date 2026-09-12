import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  EXERCISES,
  PPI_QUESTIONS,
  TROUBLE_CATEGORIES,
  addMonthsClamped,
  exerciseByKey,
  reportContentSchema,
} from '@papamo/shared';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { RadarChart } from '../components/RadarChart';
import { formatJapaneseDate, honorificLabel } from '../utils/display';
import styles from '../styles/page.module.css';

type ParsedReport = ReturnType<typeof reportContentSchema.parse>;

function ReportSheetHeader({ report, title }: { report: ParsedReport; title: string }) {
  const childName = `${report.header.childName}${honorificLabel(report.header.honorific)}`;
  return (
    <header className={styles.reportSheetHeader}>
      <div>
        <h1>{title}</h1>
        <p>へやすぽ 育ちマップ・第{report.header.seqNo}回{report.header.prevAssessedOn ? `（${formatJapaneseDate(report.header.prevAssessedOn)}との比較）` : '（初回）'}</p>
      </div>
      <p>{childName}<br />{report.header.grade}（{report.header.ageHint}）<br />{formatJapaneseDate(report.header.assessedOn)}・担当 {report.header.coachName}</p>
    </header>
  );
}

function NumberedHeading({ number, children }: { number: number; children: ReactNode }) {
  return <h2 className={styles.numberedHeading}><span>{number}</span>{children}</h2>;
}

function LevelTable({ report }: { report: ParsedReport }) {
  return (
    <div className={styles.levelTableWrap}>
      <table className={styles.levelTable}>
        <thead>
          <tr><th>種目</th>{report.kind === 'comparison' ? <><th>前回</th><th aria-label="変化" /></> : null}<th>今回</th><th>いまの帯・課題</th></tr>
        </thead>
        <tbody>
          {EXERCISES.map((exercise) => {
            const level = report.levels.find((item) => item.key === exercise.key);
            if (!level) return (
              <tr className={styles.lockedRow} key={exercise.key}>
                <td><strong>{exercise.icon} {exercise.name}</strong><small>{exercise.parentName}</small></td>
                {report.kind === 'comparison' ? <><td /><td /></> : null}
                <td>半年目以降</td><td>土台が安定してから追加</td>
              </tr>
            );
            const delta = level.delta;
            return (
              <tr key={exercise.key}>
                <td><strong>{exercise.icon} {exercise.name}</strong><small>{exercise.parentName}</small></td>
                {report.kind === 'comparison' ? <><td className={styles.numberCell}>{level.prevLv === undefined ? '—' : `Lv${level.prevLv}`}</td><td className={styles.arrowCell}>→</td></> : null}
                <td className={styles.numberCell}>Lv{level.lv}{delta === undefined ? null : <small className={delta < 0 ? styles.deltaDown : styles.deltaUp}>{delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '±0'}</small>}</td>
                <td><strong>{level.lv === 0 ? '導入前' : level.band}</strong><small>{level.ladderLabel}</small></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ReportFooter({ page }: { page: number }) {
  return <footer className={styles.reportFooter}><span>へやすぽ 育ちマップ</span><span>ご家庭説明用｜Page {page}</span></footer>;
}

export function ReportPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    void apiRequest<unknown>(`/assessments/${id}/report`, session)
      .then((response) => {
        const parsed = reportContentSchema.safeParse((response as { report?: unknown }).report);
        if (!parsed.success) throw new Error('レポートを読み込めませんでした。');
        setReport(parsed.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。'));
  }, [id, session]);

  if (error) return <main className={styles.page}><div className={styles.errorPanel} role="alert"><p>{error}</p><Link className={styles.secondaryButton} to="/">一覧に戻る</Link></div></main>;
  if (!report) return <main className={styles.page}><p className={styles.muted}>レポートを読み込み中…</p></main>;

  const childName = `${report.header.childName}${honorificLabel(report.header.honorific)}`;
  const currentTroubles = new Set(report.troubles.current);
  const troubleGroups = [...TROUBLE_CATEGORIES.pre, ...TROUBLE_CATEGORIES.sch]
    .map((category) => ({ ...category, items: category.items.filter((item) => currentTroubles.has(item)) }))
    .filter((category, index, categories) => category.items.length && categories.findIndex((candidate) => candidate.title === category.title && candidate.items.join() === category.items.join()) === index);
  const ppiTotal = Object.values(report.ppi.current).reduce((sum, value) => sum + value, 0);
  const previousPpiTotal = report.ppi.previous ? Object.values(report.ppi.previous).reduce((sum, value) => sum + value, 0) : null;
  const showUnlockAtNextAssessment = Boolean(
    report.upcomingExercises.length
    && report.header.joinedOn
    && report.nextDue >= addMonthsClamped(report.header.joinedOn, 6),
  );

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: childName }, { label: `第${report.header.seqNo}回レポート` }]} />
      <main className={`${styles.page} ${styles.reportPage} report-document`}>
        <div className={styles.reportWrap}>
          <div className={styles.reportActions} data-print-hidden>
            <div><strong>保護者向けレポート</strong><span>コーチ用の所見・つまずきは子どもページで確認できます。</span></div>
            <div><Link className={styles.secondaryButton} to="/">一覧に戻る</Link><button className={styles.primaryButton} type="button" onClick={() => window.print()}>印刷 / PDF</button></div>
          </div>

          <section className="sheet" aria-label="レポート1ページ目">
            <ReportSheetHeader report={report} title={report.kind === 'comparison' ? `${childName}の3か月の変化` : `${childName}の現在地と強み`} />
            <div className={styles.reportHero}>
              <RadarChart report={report} extUnlocked={report.upcomingExercises.length === 0} />
              <div>
                <p className={styles.reportLead}>{report.kind === 'comparison' ? '色の濃い線が今回、点線が3か月前です。5つの力の育ち方を重ねて見ることで、変化を確認できます。' : 'できた・できなかったの採点ではなく、いまどの段にいるかを確かめた記録です。ここから3か月ごとに同じ課題で測り直します。'}</p>
                <p>{exerciseByKey(report.link.lowestKey).grow}</p>
              </div>
            </div>
            <LevelTable report={report} />
            {report.kind === 'comparison' ? (
              <>
                <NumberedHeading number={1}>3か月でできるようになったこと</NumberedHeading>
                <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
                  <ul>{(report.changes3m?.length ? report.changes3m : ['今回は大きなレベル変化はありません。同じ段で安定して取り組めています。']).map((change) => <li key={change}>{change}</li>)}</ul>
                </div>
              </>
            ) : null}
            <div className={styles.reportTwoColumns}>
              <div className={`${styles.reportBox} ${styles.reportBoxOrange}`}>
                <strong>これから特に伸ばしたい力</strong>
                <ul>{report.priorities.map((priority) => <li key={priority.key}><b>{priority.parentName}</b><small>{exerciseByKey(priority.key).name}・Lv{priority.lv}</small></li>)}</ul>
              </div>
              <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
                <strong>強み（いま伸びているところ）</strong>
                <ul>{report.strengths.length ? report.strengths.map((strength) => <li key={strength.key}><b>{strength.parentName}</b><small>Lv{strength.lv}</small></li>) : <li>今回の種目では、これから強みを見つけていきます。</li>}</ul>
              </div>
            </div>
            {report.upcomingExercises.length ? (
              <div className={`${styles.reportBox} ${styles.reportBoxViolet} ${styles.upcomingBox}`}>
                <strong>これから加わる種目（半年目以降）</strong>
                <p>からだの土台が安定してきたら、次の2つを加えて「5つの土台」で見ていきます。</p>
                <div className={styles.reportTwoColumns}>{report.upcomingExercises.map((exercise) => <div key={exercise.key}><b>{exercise.name}</b><small>{exercise.parentName}</small><p>{exercise.teaser}</p></div>)}</div>
              </div>
            ) : null}
            <ReportFooter page={1} />
          </section>

          <section className="sheet" aria-label="レポート2ページ目">
            <ReportSheetHeader report={report} title={report.kind === 'comparison' ? '困りごとと、ご家庭の負担の変化' : '今のお困りごとと、その理由'} />
            <NumberedHeading number={1}>おうちでの困りごと{report.kind === 'comparison' ? <small>{(report.troubles.gone?.length ?? 0) + (report.troubles.stayed?.length ?? 0)}件 → {report.troubles.current.length}件</small> : null}</NumberedHeading>
            {report.kind === 'comparison' ? (
              <div className={styles.troublePills}>
                {report.troubles.gone?.map((trouble) => <span className={styles.troubleGone} key={trouble}>{trouble}</span>)}
                {report.troubles.stayed?.map((trouble) => <span key={trouble}>{trouble}</span>)}
                {report.troubles.added?.map((trouble) => <span className={styles.troubleAdded} key={trouble}>{trouble}（今回から）</span>)}
                {!report.troubles.current.length && !report.troubles.gone?.length ? <p>今回はお困りごとのチェックがありませんでした。</p> : null}
              </div>
            ) : troubleGroups.length ? (
              <div className={styles.reportTwoColumns}>
                {troubleGroups.map((category) => <div className={styles.reportBox} key={`${category.id}-${category.title}`}><strong>{category.icon} {category.title}</strong><ul>{category.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
              </div>
            ) : <p className={styles.muted}>今回はお困りごとのチェックがありませんでした。</p>}

            <NumberedHeading number={2}>困りごとと運動の見立てのつながり</NumberedHeading>
            <div className={styles.reportBox}><p>{report.link.text}</p></div>

            <NumberedHeading number={3}>ご家庭の負担度{previousPpiTotal === null ? null : <small>{previousPpiTotal} → {ppiTotal}（25点満点）</small>}</NumberedHeading>
            <div className={styles.reportPpi}>
              {PPI_QUESTIONS.map((question) => {
                const value = report.ppi.current[question.key];
                const previous = report.ppi.previous?.[question.key];
                return (
                  <div key={question.key}>
                    <span>{question.name}</span>
                    <span className={styles.reportPpiTrack}>{previous === undefined ? null : <i className={styles.reportPpiPrevious} style={{ width: `${previous * 20}%` }} />}<i style={{ width: `${value * 20}%` }} /></span>
                    <strong>{value}{previous === undefined ? '' : ` / ${previous}`}</strong>
                  </div>
                );
              })}
            </div>
            <p className={styles.ppiLegend}>{report.ppi.previous ? '今回 / 前回（各5点満点）' : '各5点満点'}</p>
            {report.ppi.note ? <p className={styles.reportQuote}>いちばん負担に感じている場面：「{report.ppi.note}」</p> : null}
            <ReportFooter page={2} />
          </section>

          <section className="sheet" aria-label="レポート3ページ目">
            <ReportSheetHeader report={report} title="これからの3か月" />
            {report.plan ? <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}><strong>{report.plan.name}（{report.plan.window}）</strong><ul>{report.plan.items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            <NumberedHeading number={1}>レッスンで育てること</NumberedHeading>
            <div className={styles.reportTwoColumns}>{report.priorities.map((priority) => <div className={styles.reportBox} key={priority.key}><strong>{exerciseByKey(priority.key).icon} {priority.parentName}</strong><ul>{priority.build.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
            <NumberedHeading number={2}>3か月後にこう変わるはず</NumberedHeading>
            <div className={`${styles.reportBox} ${styles.reportBoxOrange}`}><ul>{report.outlook.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div className={styles.miniTimeline}>
              {report.header.prevAssessedOn ? <><span>前回<br />{formatJapaneseDate(report.header.prevAssessedOn)}</span><b aria-hidden="true">→</b></> : null}
              <span className={styles.timelineCurrent}>今回<br />{formatJapaneseDate(report.header.assessedOn)}</span>
              <b aria-hidden="true">→</b>
              <span>次回<br />{formatJapaneseDate(report.nextDue)}ごろ</span>
              {showUnlockAtNextAssessment ? <><b aria-hidden="true">→</b><span className={styles.timelineUnlock}>4・5種目目を追加<br /><small>半年目以降・コーチ判断</small></span></> : null}
            </div>
            <ReportFooter page={3} />
          </section>
        </div>
      </main>
    </div>
  );
}
