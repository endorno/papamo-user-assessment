import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import {
  PPI_QUESTIONS,
  PPI_SCORE_MAX,
  REPORT_DISCLAIMER,
  RISK_DISCLAIMER,
  addMonthsClamped,
  exerciseByKey,
  firstDayOfMonth,
  reportResponseSchema,
  type TuningKey,
} from '@papamo/shared';
import { ApiClientError, apiRequest, apiRequestBlob } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { RadarChart } from '../components/RadarChart';
import { useToast } from '../components/Toast';
import { formatJapaneseDate, honorificLabel } from '../utils/display';
import { buildReportHtml, saveBlob } from '../utils/report-pdf';
import styles from '../styles/page.module.css';

type ParsedReport = ReturnType<typeof reportResponseSchema.parse>['report'];

/** 段が上へいくほど狭くなるようにして、見た目をピラミッドにする。 */
const PYRAMID_ROW_WIDTH: Record<number, string> = {
  5: styles.pyramidTier5!,
  4: styles.pyramidTier4!,
  3: styles.pyramidTier3!,
  2: styles.pyramidTier2!,
  1: styles.pyramidTier1!,
};

/** ルールが未確定のまま暫定で出している箇所につける目印。 */
function TuningTag({ report, section }: { report: ParsedReport; section: TuningKey }) {
  const note = report.tuning.find((item) => item.key === section);
  if (!note) return null;
  return <span className={styles.tuningTag} title={note.note}>アルゴリズム調整中：{note.label}</span>;
}

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

/** 見出しが1つしかないページで「1」だけ振ると続きがあるように見えるため、番号は省けるようにする。 */
function NumberedHeading({ number, children }: { number?: number | undefined; children: ReactNode }) {
  return <h2 className={styles.numberedHeading}>{number === undefined ? null : <span className={styles.headingNumber}>{number}</span>}{children}</h2>;
}

/** 番号つき見出しが2つ以上あるときだけ連番を振る。 */
function headingNumber(position: number, count: number) {
  return count >= 2 ? position : undefined;
}

function ReportFooter({ page }: { page: number }) {
  return <footer className={styles.reportFooter}><span>へやすぽ 育ちマップ</span><span>ご家庭説明用｜Page {page}</span></footer>;
}

export function ReportPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingPdf, setCreatingPdf] = useState(false);
  const documentRef = useRef<HTMLElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!session || !id) return;
    void apiRequest<unknown>(`/assessments/${id}/report`, session)
      .then((response) => {
        const parsed = reportResponseSchema.safeParse(response);
        if (!parsed.success) throw new Error('レポートを読み込めませんでした。');
        setReport(parsed.data.report);
        setChildId(parsed.data.childId);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。'));
  }, [id, session]);

  async function downloadPdf() {
    if (!session || !id || !report || !documentRef.current) return;
    const title = `育ちマップ_${report.header.childName}${honorificLabel(report.header.honorific)}_第${report.header.seqNo}回`;
    setCreatingPdf(true);
    try {
      const pdf = await apiRequestBlob(`/assessments/${id}/report/pdf`, session, {
        method: 'POST',
        body: JSON.stringify({ html: buildReportHtml(documentRef.current, title) }),
      });
      saveBlob(pdf, `${title}.pdf`);
    } catch (caught) {
      showToast(
        caught instanceof ApiClientError ? caught.message : 'PDFを作成できませんでした。通信状況を確認してもう一度お試しください。',
        { action: { label: 'もう一度', onClick: () => void downloadPdf() } },
      );
    } finally {
      setCreatingPdf(false);
    }
  }

  if (error) return <main className={styles.page}><div className={styles.errorPanel} role="alert"><p>{error}</p><Link className={styles.secondaryButton} to="/">一覧に戻る</Link></div></main>;
  if (!report) {
    return (
      <div className={styles.pageFrame}>
        <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: 'レポート' }]} />
        <main className={styles.page}><p className={styles.muted}>レポートを読み込み中…</p></main>
      </div>
    );
  }

  const childName = `${report.header.childName}${honorificLabel(report.header.honorific)}`;
  const ppiTotal = Object.values(report.ppi.current).reduce((sum, value) => sum + value, 0);
  const previousPpiTotal = report.ppi.previous ? Object.values(report.ppi.previous).reduce((sum, value) => sum + value, 0) : null;
  const showUnlockAtNextAssessment = Boolean(
    report.upcomingExercises.length
    && report.nextDue >= addMonthsClamped(firstDayOfMonth(report.header.joinedMonth), 6),
  );
  // 今回測れなかった種目と、半年目以降に加わる種目は同じ注記でまとめて触れる。
  const notMeasuredNow = report.unmeasured.filter((item) => !item.upcoming);
  const measuredLater = report.unmeasured.filter((item) => item.upcoming);
  const growNote = exerciseByKey(report.link.lowestKey).grow;
  // 総合点は実際に測れた種目だけで出す。未実施・実施不可を分母に入れると低く見えてしまうため。
  const measuredLevels = report.levels.filter((level) => level.measured);
  const measuredTotal = measuredLevels.reduce((sum, level) => sum + level.lv, 0);
  const measuredMax = measuredLevels.reduce((sum, level) => sum + level.maxLv, 0);
  const page1HeadingCount = [report.kind === 'comparison', report.engagement.length > 0].filter(Boolean).length;
  // 4枚目は「ご家庭のお困り度」が必ず入り、目標系は入力があったときだけ加わる。
  const page3HeadingCount = (report.copm.length > 0 ? 1 : 0) + 1;

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: childName, ...(childId ? { to: `/children/${childId}` } : {}) }, { label: `第${report.header.seqNo}回レポート` }]} />
      <main className={`${styles.page} ${styles.reportPage}`} ref={documentRef}>
        <div className={styles.reportWrap}>
          <div className={styles.reportActions} data-print-hidden>
            <div><strong>保護者向けレポート</strong><span>コーチ用の所見・つまずきは子どもページで確認できます。</span></div>
            <div>
              <Link className={styles.secondaryButton} to="/">一覧に戻る</Link>
              {childId ? <Link className={styles.secondaryButton} to={`/children/${childId}`}>{childName}のページへ</Link> : null}
              <button className={styles.primaryButton} type="button" onClick={() => void downloadPdf()} disabled={creatingPdf} aria-busy={creatingPdf}>
                {creatingPdf ? 'PDFを作成中…' : 'PDFをダウンロード'}
              </button>
            </div>
          </div>

          {/* Page 1：現在地と強み */}
          <section className="sheet" aria-label="レポート1ページ目">
            <ReportSheetHeader report={report} title={report.kind === 'comparison' ? `${childName}の3か月の変化` : `${childName}の現在地と強み`} />
            <section className={styles.reportHero} aria-label="育ちマップ">
              <strong className={styles.reportHeroTitle}>🧭 育ちマップ（5つの土台のレーダーチャート）</strong>
              <RadarChart report={report} extUnlocked={report.upcomingExercises.length === 0} showLevels />
              <p className={styles.radarScaleNote}>外側ほどLvが高い（Lv1＝入口 〜 Lv30＝最上位）{measuredLevels.length < report.levels.length + report.upcomingExercises.length ? '／白い点の軸は「未実施」で、まだ測っていません' : ''}</p>
              {measuredLevels.length ? (
                <p className={styles.reportTotal}>
                  今の到達 <strong>{measuredTotal}</strong> /{measuredMax}
                  <small>（実施した{measuredLevels.length}種目の合計）</small>
                </p>
              ) : null}
              <p className={styles.reportLead}>{report.kind === 'comparison' ? '色の濃い線が今回、点線が3か月前です。5つの力の育ち方を重ねて見ることで、変化を確認できます。' : <>できた・できなかったの採点ではなく、<strong>いまどの段にいるか</strong>を確かめた記録です。ここから3か月ごとに同じ課題で測り直します。</>}</p>
              <p>{growNote}</p>
            </section>
            {notMeasuredNow.length || report.upcomingExercises.length ? (
              <p className={styles.reportNote}>
                ※ {[...notMeasuredNow, ...measuredLater].map((item) => item.name).join('・')} は今回まだ測っていません。図では中心に近く描かれますが、
                {report.upcomingExercises.length ? `${report.upcomingExercises.map((item) => item.name).join('・')}は、からだの土台が安定してきた半年目以降にあらためて実施する種目です。` : ''}
                「できない」という意味ではありません。
              </p>
            ) : null}
            {report.conditionNotes.length ? (
              <p className={styles.reportNote}>
                ※ {report.conditionNotes.map((item) => item.name).join('・')} は当日の様子（{[...new Set(report.conditionNotes.flatMap((item) => item.notes))].join('・')}）の影響を受けている可能性があります。次回あらためて確認します。
              </p>
            ) : null}
            {report.kind === 'comparison' ? (
              <>
                <NumberedHeading number={headingNumber(1, page1HeadingCount)}>3か月でできるようになったこと<TuningTag report={report} section="comparison" /></NumberedHeading>
                <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
                  <ul>{(report.changes3m?.length ? report.changes3m : ['今回は大きなレベル変化はありません。同じ段で安定して取り組めています。']).map((change) => <li key={change}>{change}</li>)}</ul>
                </div>
              </>
            ) : null}
            <div className={styles.reportTwoColumns}>
              <div className={`${styles.reportBox} ${styles.reportBoxOrange}`}>
                <strong>これから特に伸ばしたい力（優先テーマ）<TuningTag report={report} section="priorityRule" /></strong>
                <ul>{report.priorities.map((priority) => <li key={priority.key}><b>{priority.parentName}</b><small>{exerciseByKey(priority.key).name}・Lv{priority.lv}/{priority.maxLv}</small></li>)}</ul>
              </div>
              <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
                <strong>強み（いま伸びているところ）</strong>
                <ul>{report.strengths.length ? report.strengths.map((strength) => <li key={strength.key}><b>{strength.parentName}</b><small>Lv{strength.lv}/{strength.maxLv}</small></li>) : <li>今回実施した種目では、まだはっきりした強みの差は出ていません。まずは土台を一段ずつ上げていきます。</li>}</ul>
              </div>
            </div>
            {report.engagement.length ? (
              <>
                <NumberedHeading number={headingNumber(report.kind === 'comparison' ? 2 : 1, page1HeadingCount)}>取り組みの様子<TuningTag report={report} section="engagementDelta" /></NumberedHeading>
                <p className={styles.reportNote}>運動そのものの段階とは別に、どう取り組めたかの記録です。</p>
                <div className={styles.engagementBars}>
                  {report.engagement.map((axis) => (
                    <div key={axis.key}>
                      <span>{axis.title}</span>
                      <span className={styles.engagementTrack}>
                        {Array.from({ length: axis.levelCount }, (_, index) => (
                          <i className={index <= axis.level ? styles.engagementFilled : undefined} key={index} />
                        ))}
                      </span>
                      <strong>{axis.level + 1}/{axis.levelCount}{axis.delta === undefined ? '' : axis.delta > 0 ? `（▲${axis.delta}）` : axis.delta < 0 ? `（▼${Math.abs(axis.delta)}）` : '（±0）'}</strong>
                      <em>{axis.label}</em>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <ReportFooter page={1} />
          </section>

          {/* Page 2：今のお困りごとと、その理由 */}
          <section className="sheet" aria-label="レポート2ページ目">
            <ReportSheetHeader report={report} title={report.kind === 'comparison' ? '困りごとと、ご家庭の負担の変化' : '今のお困りごとと、その理由'} />
            <NumberedHeading number={1}>今、特に気になっていること{report.kind === 'comparison' ? <small>{(report.troubles.gone?.length ?? 0) + (report.troubles.stayed?.length ?? 0)}件 → {report.troubles.current.length}件</small> : null}</NumberedHeading>
            {report.kind === 'comparison' ? (
              <div className={styles.troublePills}>
                {report.troubles.gone?.map((trouble) => <span className={styles.troubleGone} key={trouble}>{trouble}</span>)}
                {report.troubles.stayed?.map((trouble) => <span key={trouble}>{trouble}</span>)}
                {report.troubles.added?.map((trouble) => <span className={styles.troubleAdded} key={trouble}>{trouble}（今回から）</span>)}
                {!report.troubles.current.length && !report.troubles.gone?.length ? <p>今回はお困りごとのチェックがありませんでした。</p> : null}
              </div>
            ) : report.troubles.byCategory.length ? (
              <div className={styles.reportTwoColumns}>
                {report.troubles.byCategory.map((category) => <div className={styles.reportBox} key={category.id}><strong>{category.icon} {category.title}</strong><ul>{category.items.map((item) => <li key={item}>{item}</li>)}</ul></div>)}
              </div>
            ) : <p className={styles.muted}>今回はお困りごとのチェックがありませんでした。気になることが出てきたら、いつでもお知らせください。</p>}

            {report.domainHits.length ? (
              <>
                <NumberedHeading number={2}>困りごとの背景にありそうな力<TuningTag report={report} section="troubleDomainPre" /></NumberedHeading>
                <div className={styles.levelTableWrap}>
                  <table className={styles.levelTable}>
                    <thead><tr><th>表面に見える困りごと</th><th>背景にありそうな力</th><th>優先して見る土台</th></tr></thead>
                    <tbody>
                      {report.domainHits.map((hit) => (
                        <tr key={hit.id}>
                          <td>{hit.troubles.map((trouble) => <span className={styles.troubleLine} key={trouble}>{trouble}</span>)}</td>
                          <td>{hit.parentLabel}</td>
                          <td><strong>{hit.priorityParentName}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`${styles.reportBox} ${styles.reportBoxOrange}`}>
                  <strong>今の困りごとが続いた場合に起こりうること</strong>
                  <ul>{report.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
                  <small className={styles.riskDisclaimer}>※ {RISK_DISCLAIMER}</small>
                </div>
              </>
            ) : null}

            {report.rootDomain ? (
              <div className={styles.reportBox}>
                <strong>いちばん見ておきたい土台</strong>
                <p>今回チェックいただいた中で、最初に見ていきたいのは「{report.rootDomain.parentLabel}」です。{report.rootDomain.parentText}</p>
              </div>
            ) : null}

            <NumberedHeading number={report.domainHits.length ? 3 : 2}>育ちのピラミッド</NumberedHeading>
            <p className={styles.reportNote}>力は下の土台から上へ積み上がります。色のついたところが、これから育てていくところです。土台が細いままでも上の力は出せますが、そのぶん力を使い、崩れやすくなります。</p>
            <div className={styles.pyramid}>
              {[...report.pyramid.rows].reverse().map((row) => (
                <div className={`${styles.pyramidRow} ${PYRAMID_ROW_WIDTH[row.tier] ?? ''}`} key={row.tier}>
                  {row.items.map((item) => (
                    <span
                      className={`${styles.pyramidCell} ${report.pyramid.highlighted.includes(item) ? styles.pyramidHot : ''} ${item === report.pyramid.root ? styles.pyramidRoot : ''}`}
                      key={item}
                    >{item}</span>
                  ))}
                </div>
              ))}
              <p className={styles.pyramidBase}>▲ 上へ積み上がる ／ いちばん下＝感覚（根っこ）</p>
            </div>
            <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
              <strong>いま特に育てていきたいところ</strong>
              <p>
                ピラミッドの「{report.pyramid.root}」（{report.pyramid.rootTierLabel}）です。{exerciseByKey(report.pyramid.sourceKey).name}の結果（{exerciseByKey(report.pyramid.sourceKey).parentName}）が、いちばんここを示していました。
                「{report.pyramid.root}」が育つと、その上に乗っている{report.pyramid.related.map((item) => `「${item}」`).join('')}もいっしょに安定していきます。
              </p>
            </div>
            <ReportFooter page={2} />
          </section>

          {/* Page 3：これから一緒に見ていくこと */}
          <section className="sheet" aria-label="レポート3ページ目">
            <ReportSheetHeader report={report} title="これから一緒に見ていくこと" />
            {report.copm.length ? (
              <>
                <NumberedHeading number={headingNumber(1, page3HeadingCount)}>ご家族・本人の目標{report.copm.some((goal) => goal.previous) ? <TuningTag report={report} section="copmDelta" /> : null}</NumberedHeading>
                <p className={styles.reportNote}>「できるか」（遂行度）と「その状態に納得しているか」（満足度）を分けて記録しています。3か月後に同じ質問をして並べます。</p>
                <div className={styles.levelTableWrap}>
                  <table className={styles.levelTable}>
                    <thead><tr><th>目標</th><th>メモ</th><th>遂行度</th><th>満足度</th><th>重要度</th></tr></thead>
                    <tbody>
                      {report.copm.map((goal) => (
                        <tr key={goal.text}>
                          <td><strong>{goal.text}</strong></td>
                          <td><small>{goal.memo}</small></td>
                          <td className={styles.numberCell}>{goal.performance}{goal.previous ? <small>前回 {goal.previous.performance}</small> : null}</td>
                          <td className={styles.numberCell}>{goal.satisfaction}{goal.previous ? <small>前回 {goal.previous.satisfaction}</small> : null}</td>
                          <td className={styles.numberCell}>{goal.importance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={styles.reportNote}>※ 点数の高い低いを評価するものではありません。3か月後に同じ質問をしたときの動き方を見るための記録です。「できる」より先に「納得」が動くこともよくあります。</p>
              </>
            ) : null}

            <NumberedHeading number={headingNumber(page3HeadingCount, page3HeadingCount)}>ご家庭のお困り度{previousPpiTotal === null ? null : <small>{previousPpiTotal} → {ppiTotal}（{PPI_QUESTIONS.length * PPI_SCORE_MAX}点満点）</small>}</NumberedHeading>
            <div className={styles.reportPpi}>
              {PPI_QUESTIONS.map((question) => {
                const value = report.ppi.current[question.key];
                const previous = report.ppi.previous?.[question.key];
                return (
                  <div key={question.key}>
                    <span>{question.name}</span>
                    <span className={styles.reportPpiTrack}>{previous === undefined ? null : <i className={styles.reportPpiPrevious} style={{ width: `${(previous / PPI_SCORE_MAX) * 100}%` }} />}<i style={{ width: `${(value / PPI_SCORE_MAX) * 100}%` }} /></span>
                    <strong>{value}{previous === undefined ? '' : ` / ${previous}`}</strong>
                  </div>
                );
              })}
            </div>
            <p className={styles.ppiLegend}>{report.ppi.previous ? '今回 / 前回（各5点満点）' : '各5点満点'}・お子さまの育ちマップは外へ広がるほど、こちらの棒は短くなるほど良い状態です</p>
            {report.ppi.note ? <p className={styles.reportQuote}>いま一番負担に感じている場面：「{report.ppi.note}」</p> : null}

            <ReportFooter page={3} />
          </section>

          {/* Page 4：6か月成長ロードマップと次回の予定 */}
          <section className="sheet" aria-label="レポート4ページ目">
            <ReportSheetHeader report={report} title={`${childName}の6か月成長ロードマップ`} />
            <p className={styles.reportLead}>土台から順に力を育て、目標のスキルへつなげます。</p>
            <div className={styles.roadmap}>
              <section className={`${styles.roadmapColumn} ${styles.roadmapNow}`}>
                <h3>現在地<span>（今ここ）</span></h3>
                <div className={styles.roadmapBody}>
                  <p className={styles.roadmapLabel}>育ちマップの特徴</p>
                  <ul>{report.levels.filter((level) => level.measured).map((level) => <li key={level.key}>{level.parentName}{'\u3000'}Lv{level.lv}</li>)}</ul>
                  <div className={styles.roadmapSub}>
                    <p className={styles.roadmapLabel}>強み</p>
                    <ul>{report.strengths.length ? report.strengths.map((strength) => <li key={strength.key}>{strength.parentName}</li>) : <li>これから見つけていきます</li>}</ul>
                  </div>
                </div>
              </section>
              <b className={styles.roadmapArrow} aria-hidden="true">➡</b>
              <section className={`${styles.roadmapColumn} ${styles.roadmapMonth3}`}>
                <h3>3か月後の目安<span>（土台づくり）</span></h3>
                <div className={styles.roadmapBody}>
                  <p className={styles.roadmapLabel}>土台として育てる力</p>
                  <ul>{report.roadmap.month3Build.map((item) => <li key={item}>{item}</li>)}</ul>
                  <div className={styles.roadmapSub}>
                    <p className={styles.roadmapLabel}>期待する変化（例）</p>
                    <ul>{report.roadmap.month3Changes.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              </section>
              <b className={styles.roadmapArrow} aria-hidden="true">➡</b>
              <section className={`${styles.roadmapColumn} ${styles.roadmapMonth6}`}>
                <h3>6か月後の目安<span>（目標へつなげる）</span></h3>
                <div className={styles.roadmapBody}>
                  <p className={styles.roadmapLabel}>つなげていく力</p>
                  <ul>{report.roadmap.month6Links.map((item) => <li key={item}>{item}</li>)}</ul>
                  <div className={styles.roadmapSub}>
                    <p className={styles.roadmapLabel}>期待する変化（例）</p>
                    <ul>{report.roadmap.month6Changes.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              </section>
              <b className={styles.roadmapArrow} aria-hidden="true">➡</b>
              <section className={`${styles.roadmapColumn} ${styles.roadmapFuture}`}>
                <h3>目指す未来<span>（生活・学習の中で）</span></h3>
                <div className={styles.roadmapBody}>
                  <p className={styles.roadmapLabel}>叶えたい姿</p>
                  <ul>
                    {report.wants.map((want) => <li key={want.id}>{want.icon} {want.short}</li>)}
                    {[...report.copm].sort((a, b) => b.importance - a.importance).map((goal) => <li key={goal.text}>{goal.text}</li>)}
                    {!report.wants.length && !report.copm.length ? <li>目標はこれから一緒に決めていきます。</li> : null}
                  </ul>
                </div>
              </section>
            </div>
            <p className={styles.reportNote}>※ 伸びる速さは目標によって違います。姿勢や体の使い方は比較的早く、読み書きのように土台の上に乗るスキルは半年〜1年かけて育つこともあります。順番に積みます。</p>
            <div className={styles.miniTimeline}>
              {report.header.prevAssessedOn ? <><span>前回<br />{formatJapaneseDate(report.header.prevAssessedOn)}</span><b aria-hidden="true">→</b></> : null}
              <span className={styles.timelineCurrent}>今回<br />{formatJapaneseDate(report.header.assessedOn)}</span>
              <b aria-hidden="true">→</b>
              <span>3か月レビュー<br />{formatJapaneseDate(report.nextDue)}ごろ</span>
              <b aria-hidden="true">→</b>
              <span>6か月レビュー<br />{formatJapaneseDate(report.nextReview)}ごろ</span>
              {showUnlockAtNextAssessment ? <><b aria-hidden="true">→</b><span className={styles.timelineUnlock}>4・5種目目を追加<br /><small>半年目以降・コーチ判断</small></span></> : null}
            </div>
            <p className={styles.reportNote}>※ {REPORT_DISCLAIMER}</p>
            <ReportFooter page={4} />
          </section>
        </div>
      </main>
    </div>
  );
}
