import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';

import {
  REPORT_DISCLAIMER,
  RISK_DISCLAIMER,
  goalsByImportance,
  isNextCopmGoal,
  COPM_MAX,
  pyramidSourceOf,
  reportFileTitle,
  reportResponseSchema,
  troubleProfileOf,
  type PyramidSource,
  type ReportAudience,
  type ReportDrive,
  type TuningKey,
} from '@papamo/shared';
import { ApiClientError, apiRequest, apiRequestBlob } from '../api/client';
import { useDriveSave, type DriveSaveTask } from '../app/DriveSaveContext';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { AreaMenuPlan, areaMenuSheets, COACH_MENU_ANCHOR, GoalAreaTable, ObservationNotes } from '../components/CoachMenu';
import { DriveSaveDoneMark, DriveSaveFailedMark, DriveSaveProgress, DriveSaveSpinner } from '../components/DriveSaveProgress';
import { RadarChart } from '../components/RadarChart';
import { useToast } from '../components/Toast';
import { formatJapaneseDate, formatJapaneseDateTime, honorificLabel } from '../utils/display';
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

/** ピラミッドの色の付け方（目標ブロックは赤い塗り、課題ブロックは青い太枠）。凡例と同じ順に並べる。 */
const PYRAMID_LEGEND: { source: PyramidSource | 'none'; label: string }[] = [
  { source: 'none', label: 'いまは該当なし' },
  { source: 'goal', label: '目標から必要になる力' },
  { source: 'issue', label: 'アセスメント結果・お困りごとから出ている課題' },
  { source: 'both', label: '両方に当たる' },
];

const PYRAMID_SOURCE_CLASS: Record<PyramidSource | 'none', string> = {
  none: styles.pyramidNone!,
  goal: styles.pyramidGoal!,
  issue: styles.pyramidIssue!,
  both: styles.pyramidBoth!,
};

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤'];

function circled(index: number) {
  return CIRCLED_NUMBERS[index] ?? `${index + 1}.`;
}

/**
 * ルールや文言が未確定のまま暫定で出している箇所につける目印。
 * コーチが画面で気づけるようにし、保護者に渡すPDFには出さない。
 */
function TuningTag({ report, section }: { report: ParsedReport; section: TuningKey }) {
  const note = report.tuning.find((item) => item.key === section);
  if (!note) return null;
  return <span className={styles.tuningTag} title={note.note} data-print-hidden>アルゴリズム調整中：{note.label}</span>;
}

/** 保護者向けの紙面の左上のタブ。PDFだけを見ても、どの紙面の何枚目かが分かるようにする。 */
function SheetTab({ page }: { page: number }) {
  return <p className={styles.sheetTab}>本体（ご家庭説明用）<span>｜</span>Page {page}</p>;
}

/**
 * コーチ向けの紙面の見出しバー。誤って家庭に渡さないよう、右端に「コーチ用」の小ラベルを残す
 * （変更依頼の要確認②の暫定。2026-10-21）。
 */
function CoachSheetHeader({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <header className={styles.coachSheetHeader}>
      <h1>{icon}{children}</h1>
      <span>コーチ用・保護者には渡さない</span>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

function ReportFooter() {
  return <footer className={styles.reportFooter}>へやすぽアシスト</footer>;
}

function deltaLabel(delta: number | undefined) {
  if (delta === undefined) return '';
  return delta > 0 ? `（▲${delta}）` : delta < 0 ? `（▼${Math.abs(delta)}）` : '（±0）';
}

/** 目標の採点。前回から上がったときだけ赤い▲で差を添える（下がったときは「前回 N」で読める）。 */
function CopmScore({ score, previous, delta }: { score: number; previous: number | undefined; delta: number | undefined }) {
  return (
    <>
      {score}
      {delta !== undefined && delta > 0 ? <span className={styles.copmRise}>▲{delta}</span> : null}
      {previous === undefined ? null : <small>前回 {previous}</small>}
    </>
  );
}

/** 学年ラダーの「求められる力」を、「〜時期です。」で終わる一文にする。 */
function stageDemandSentence(demand: string) {
  return demand.endsWith('時期') ? `${demand}です。` : `${demand}が求められる時期です。`;
}

/**
 * Googleドライブへの保存状態。保存は画面を開いたときに自動で始まり、ほかの画面へ移っても続く（DriveSaveProvider）。
 * ここでは進み具合・結果・再試行を示す。保存し終えるのを見届けたときだけ、完了の印を動かす。
 */
function DriveStatus({ drive, task, onRetry }: { drive: ReportDrive; task: DriveSaveTask | undefined; onRetry: () => void }) {
  if (task?.status === 'failed') {
    return (
      <div className={`${styles.driveStatus} ${styles.driveStatusFailed}`} role="alert" data-print-hidden>
        <DriveSaveFailedMark />
        <p><strong>Googleドライブに保存できませんでした。</strong>{task.error?.message}</p>
        {/* レポートが別の画面で更新されていたら、送り直しても同じ結果になるため読み込み直してもらう。 */}
        {task.error?.conflict
          ? <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>読み込み直す</button>
          : <button className={styles.secondaryButton} type="button" onClick={onRetry}>もう一度保存する</button>}
      </div>
    );
  }
  if (task?.status === 'saving' || !drive.upToDate) {
    return (
      <div className={`${styles.driveStatus} ${styles.driveStatusSaving}`} role="status" data-print-hidden>
        <DriveSaveSpinner />
        <div className={styles.driveStatusBody}>
          <p>保護者向け・コーチ向けのPDFをGoogleドライブに保存しています…<small>ほかの画面に移っても保存は続きます。</small></p>
          <DriveSaveProgress step={task?.step ?? 'renderParent'} stepStartedAt={task?.stepStartedAt} />
        </div>
      </div>
    );
  }
  return (
    <div className={styles.driveStatus} role="status" data-print-hidden>
      <DriveSaveDoneMark animate={task?.status === 'saved'} />
      <p>保護者向け・コーチ向けのPDFをGoogleドライブに保存しました{drive.savedAt ? `（${formatJapaneseDateTime(drive.savedAt)}）` : ''}。</p>
      {drive.folderUrl ? <a className={styles.textLink} href={drive.folderUrl} target="_blank" rel="noopener noreferrer">フォルダを開く</a> : null}
    </div>
  );
}

export function ReportPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [hasUnreportedChanges, setHasUnreportedChanges] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingPdf, setCreatingPdf] = useState<ReportAudience | null>(null);
  const [drive, setDrive] = useState<ReportDrive | null>(null);
  const { tasks: driveTasks, startSave } = useDriveSave();
  // 自動保存は画面を開くたびに1回だけ。失敗しても、次に開いたときにやり直す（同じ版の二重送信はプロバイダが止める）。
  const autoSavedVersionRef = useRef<string | null>(null);
  const documentRef = useRef<HTMLElement>(null);
  const { showToast } = useToast();
  const { hash } = useLocation();

  useEffect(() => {
    if (!session || !id) return;
    void apiRequest<unknown>(`/assessments/${id}/report`, session)
      .then((response) => {
        const parsed = reportResponseSchema.safeParse(response);
        if (!parsed.success) throw new Error('レポートを読み込めませんでした。');
        setReport(parsed.data.report);
        setChildId(parsed.data.childId);
        setHasUnreportedChanges(parsed.data.hasUnreportedChanges);
        setReadOnly(parsed.data.readOnly);
        setDrive(parsed.data.drive);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。'));
  }, [id, session]);

  // 子どもページからメニューへ直接来たときは、読み込みを待ってからコーチ用の紙面まで送る。
  useEffect(() => {
    if (!report || hash !== `#${COACH_MENU_ANCHOR}`) return;
    document.getElementById(COACH_MENU_ANCHOR)?.scrollIntoView();
  }, [report, hash]);

  const fileTitle = useCallback((audience: ReportAudience) => {
    if (!report || !childId) return '';
    return reportFileTitle({ childId, childName: report.header.childName, honorific: report.header.honorific, seqNo: report.header.seqNo }, audience);
  }, [report, childId]);

  /**
   * 保護者向けとコーチ向けのPDFをGoogleドライブに保存する。SV や代行のコーチが Drive から見られるようにするため。
   * PDFにする紙面はこの画面で描いたものなので、保存はサーバーの完了処理ではなくこの画面から送る。
   */
  const saveToDrive = useCallback(() => {
    if (!session || !id || !report || !childId) return;
    startSave({
      assessmentId: id,
      childId,
      label: `${report.header.childName}${honorificLabel(report.header.honorific)} 第${report.header.seqNo}回`,
      generatedAt: report.generatedAt,
      buildHtml: () => {
        const sheets = documentRef.current;
        if (!sheets) throw new Error('レポートの紙面がありません。');
        return {
          parentHtml: buildReportHtml(sheets, fileTitle('parent'), 'parent'),
          coachHtml: buildReportHtml(sheets, fileTitle('coach'), 'coach'),
        };
      },
    }, session);
  }, [session, id, report, childId, fileTitle, startSave]);

  // 保存した版より新しいレポートを開いたら、自動で保存し直す。「レポートを作る／更新」のあとはこの画面に来るので、実質その直後に保存される。
  useEffect(() => {
    if (!report || !drive || drive.upToDate) return;
    if (autoSavedVersionRef.current === report.generatedAt) return;
    autoSavedVersionRef.current = report.generatedAt;
    saveToDrive();
  }, [report, drive, saveToDrive]);

  async function downloadPdf(audience: ReportAudience) {
    if (!session || !id || !report || !childId || !documentRef.current) return;
    const title = fileTitle(audience);
    setCreatingPdf(audience);
    try {
      const pdf = await apiRequestBlob(`/assessments/${id}/report/pdf`, session, {
        method: 'POST',
        body: JSON.stringify({ html: buildReportHtml(documentRef.current, title, audience) }),
      });
      saveBlob(pdf, `${title}.pdf`);
    } catch (caught) {
      showToast(
        caught instanceof ApiClientError ? caught.message : 'PDFを作成できませんでした。通信状況を確認してもう一度お試しください。',
        { action: { label: 'もう一度', onClick: () => void downloadPdf(audience) } },
      );
    } finally {
      setCreatingPdf(null);
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
  // この版の保存だけを見る（前の版の保存の結果は、いまのレポートには当てはまらない）。
  const driveTask = id && driveTasks[id]?.generatedAt === report.generatedAt ? driveTasks[id] : undefined;
  const currentDrive = driveTask?.status === 'saved' && driveTask.drive ? driveTask.drive : drive;
  // 総合点はその回に記録した種目（Lv0 を含む）だけで出す。未開放の種目を分母に入れると低く見えてしまうため。
  const levelTotal = report.levels.reduce((sum, level) => sum + level.lv, 0);
  const levelMax = report.levels.reduce((sum, level) => sum + level.maxLv, 0);
  // 次の3か月の目標を先にし、それぞれ重要度順に並べる。コーチ向けの目標の番号もこの順。
  const copmByImportance = goalsByImportance(report.copm);

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: childName, ...(childId ? { to: `/children/${childId}` } : {}) }, { label: `第${report.header.seqNo}回レポート` }]} />
      <main className={`${styles.page} ${styles.reportPage}`} ref={documentRef}>
        <div className={styles.reportWrap}>
          <div className={styles.reportActions} data-print-hidden>
            <div>
              <strong>レポート</strong>
              <span>{currentDrive
                ? '先頭の2枚はコーチ用です。保護者向けPDFはその後ろの本体2枚だけで、コーチ向け（全4枚）は保護者向けと一緒にGoogleドライブへ自動で保存します。'
                : '先頭の2枚はコーチ用です。保護者向けPDFはその後ろの本体2枚だけ、コーチ向けPDFは全4枚を含みます。'}</span>
            </div>
            <div>
              {/* 一覧へはロゴとパンくずで戻れる。子どもページはスマホでパンくずが隠れるため、ボタンでも置く。 */}
              {childId ? <Link className={styles.secondaryButton} to={`/children/${childId}`}>{childName}のページへ</Link> : null}
              {/* 出力後に間違いに気づいたとき、子どもページを経由せず直せるようにする。直せない回では出さない。 */}
              {readOnly ? null : <Link className={styles.secondaryButton} to={`/assessments/${id}`}>入力を修正する</Link>}
              <button className={styles.primaryButton} type="button" onClick={() => void downloadPdf('parent')} disabled={creatingPdf !== null} aria-busy={creatingPdf === 'parent'}>
                {creatingPdf === 'parent' ? 'PDFを作成中…' : '保護者向けPDF'}
              </button>
              {/* コーチ向けはその場で画面を見ればよいので、ダウンロードは置かずGoogleドライブで共有する。保存しない環境（ローカル）だけ紙面の確認用に残す。 */}
              {currentDrive ? (
                currentDrive.coachFileUrl ? <a className={styles.secondaryButton} href={currentDrive.coachFileUrl} target="_blank" rel="noopener noreferrer">コーチ向けPDF（Googleドライブ）</a> : null
              ) : (
                <button className={styles.secondaryButton} type="button" onClick={() => void downloadPdf('coach')} disabled={creatingPdf !== null} aria-busy={creatingPdf === 'coach'}>
                  {creatingPdf === 'coach' ? 'PDFを作成中…' : 'コーチ向けPDF'}
                </button>
              )}
            </div>
          </div>
          {currentDrive ? <DriveStatus drive={currentDrive} task={driveTask} onRetry={saveToDrive} /> : null}
          {hasUnreportedChanges ? (
            <div className={styles.unreportedNotice} role="status" data-print-hidden>
              <div>
                <strong>このレポートを作ったあとに、入力が変更されています</strong>
                <p>変更はまだこのレポートに反映されていません。反映するには、入力画面で「レポートを更新」を押してください。</p>
              </div>
              <Link className={styles.secondaryButton} to={`/assessments/${id}`}>入力画面を開く</Link>
            </div>
          ) : null}

          {/* コーチ向けの紙面は先頭に置く（コーチ用レポート v14）。保護者向けPDFからは外す（data-coach-only）。
              領域が多い回は「方針とメニューの方向性」を複数枚に分ける。 */}
          {areaMenuSheets(report.coach.areaMenus).map(({ areas, start }, index, sheets) => (
            <section
              className={`sheet ${styles.coachSheet}`}
              id={index === 0 ? COACH_MENU_ANCHOR : undefined}
              aria-label={index === 0 ? 'コーチ向け 方針とメニューの方向性' : `コーチ向け 方針とメニューの方向性（つづき${index + 1}/${sheets.length}）`}
              data-coach-only
              key={start}
            >
              <div className={`${styles.sheetCard} ${styles.coachCard}`}>
                <CoachSheetHeader icon={<span aria-hidden="true">◎</span>}>方針とメニューの方向性{index === 0 ? null : <small>（つづき）</small>}</CoachSheetHeader>
                <div className={styles.coachCardBody}>
                  {index === 0 ? (
                    <>
                      <h2 className={styles.areaMenuHeading}>◆ 目標ごとの優先する領域</h2>
                      <GoalAreaTable report={report} />
                    </>
                  ) : null}
                  <h2 className={styles.areaMenuHeading}>◆ 目標と課題から導き出した領域ごとのメニュー{index === 0 ? <TuningTag report={report} section="areaMenus" /> : <small>（つづき）</small>}</h2>
                  <AreaMenuPlan report={report} areas={areas} start={start} last={index === sheets.length - 1} />
                </div>
              </div>
            </section>
          ))}
          <section className={`sheet ${styles.coachSheet} ${styles.observationSheet}`} aria-label="コーチ向け 観察された様子・つまずき方" data-coach-only>
            <div className={`${styles.sheetCard} ${styles.coachCard}`}>
              <CoachSheetHeader icon={<SearchIcon />}>観察された様子・つまずき方</CoachSheetHeader>
              <div className={styles.coachCardBody}>
                <ObservationNotes report={report} />
              </div>
            </div>
          </section>
          {/* ここから本体。切れ目は画面だけに出す。 */}
          <div className={styles.audienceDivider} data-print-hidden>
            <p><strong>ここからは本体（ご家庭説明用）</strong><small>保護者向けPDFは、ここから下の2枚です</small></p>
          </div>

          {/* Page 1：スコア（育ちマップと、種目ごとのできている力／次に高めたい力） */}
          <section className={`sheet ${styles.parentSheet}`} aria-label="レポート1ページ目">
            <SheetTab page={1} />
            <div className={styles.sheetCard}>
              <header className={styles.reportSheetHeader}>
                <div>
                  <h1>{childName}のスコア</h1>
                  <p>アセスメント日：{formatJapaneseDate(report.header.assessedOn)}{report.header.prevAssessedOn ? `（前回 ${formatJapaneseDate(report.header.prevAssessedOn)}）` : ''}</p>
                </div>
                {/* 年齢は保存しないため、学年から引いた目安を出す。 */}
                <p>{childName}（{report.header.ageHint}）<br />{report.header.grade}</p>
              </header>
              <section className={styles.reportHero} aria-label="育ちマップ">
                <strong className={styles.reportHeroTitle}>育ちマップ（5つの土台のレーダーチャート）</strong>
                <p className={styles.reportHeroAside}>{report.kind === 'comparison' ? '色の濃い線が今回、点線が3か月前です。5つの力の育ち方を重ねて見ることで、変化を確認できます。' : <>できた・できなかったの採点ではなく、<strong>いまどの段にいるか</strong>を確かめた記録です。ここから3か月ごとに同じ課題で測り直します。</>}</p>
                <RadarChart report={report} extUnlocked={report.upcomingExercises.length === 0} showLevels />
                <p className={styles.reportTotal}>
                  今の到達 <strong>{levelTotal}</strong> /{levelMax}
                  <small>（実施した{report.levels.length}種目の合計）</small>
                </p>
                <section className={styles.abilityList} aria-labelledby="ability-title">
                  <h2 id="ability-title">実施した種目ごとの、できている力／次に高めたい力</h2>
                  {report.abilities.map((ability) => {
                    const level = report.levels.find((candidate) => candidate.key === ability.key);
                    const conditions = report.conditionNotes.find((note) => note.key === ability.key)?.notes ?? [];
                    return (
                      <div className={styles.abilityItem} key={ability.key}>
                        <p className={styles.abilityName}><strong>{level?.name}</strong>Lv{level?.lv}/{level?.maxLv}{deltaLabel(level?.delta)}</p>
                        {/* Lv0 など通過した段階がなければ「できている力」を、上限まで届いていれば「次に高めたい力」を出さない。 */}
                        {ability.can ? <p><span className={styles.abilityCan}>できている力</span>{ability.can}</p> : null}
                        {ability.next ? <p><span className={styles.abilityNext}>次に高めたい力</span>{ability.next}</p> : null}
                        {ability.blocks.length ? (
                          <p className={styles.foundationChips} aria-label="つながる土台">
                            {ability.blocks.map((block, index) => <span key={block}>{circled(index)}{block}</span>)}
                          </p>
                        ) : null}
                        {conditions.length ? <small className={styles.abilityCondition}>※ 当日の様子（{conditions.join('・')}）の影響を受けている可能性があります。次回あらためて確認します。</small> : null}
                      </div>
                    );
                  })}
                </section>
              </section>
              {report.kind === 'comparison' ? (
                <>
                  <h2 className={styles.reportHeading}>3か月でできるようになったこと<TuningTag report={report} section="comparison" /></h2>
                  <div className={`${styles.reportBox} ${styles.reportBoxGreen}`}>
                    <ul>{(report.changes3m?.length ? report.changes3m : ['今回は大きなレベル変化はありません。同じ段で安定して取り組めています。']).map((change) => <li key={change}>{change}</li>)}</ul>
                  </div>
                </>
              ) : null}
              {report.engagement.length ? (
                <>
                  <h2 className={styles.reportHeading}>取り組みの様子<TuningTag report={report} section="engagementDelta" /></h2>
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
                        <strong>{axis.level + 1}/{axis.levelCount}{deltaLabel(axis.delta)}</strong>
                        <em>{axis.label}</em>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <ReportFooter />
            </div>
          </section>

          {/* Page 2：発達ピラミッドから見る、育てるべき領域 */}
          <section className={`sheet ${styles.parentSheet} ${report.copm.length > COPM_MAX ? styles.expandedGoalsSheet : ''}`} aria-label="レポート2ページ目">
            <SheetTab page={2} />
            <div className={styles.sheetCard}>
              <header className={styles.reportSheetHeader}>
                <h1>発達ピラミッドから見る、育てるべき領域</h1>
              </header>
              {report.focusAreas.length ? (
                <section className={styles.focusAreas} aria-labelledby="focus-areas-title">
                  <h2 id="focus-areas-title" className={styles.reportHeading}>最重要にすべき領域</h2>
                  <p className={styles.reportNote}>目標とアセスメント・お困りごとの両方に当たるものを優先して、いま取り組むと効果が大きい{report.focusAreas.length}つを選びました。下の土台にあたるものから順に並べています。</p>
                  <ol>
                    {report.focusAreas.map((area, index) => (
                      <li key={area.block}>
                        <p><span className={styles.focusNumber}>{index + 1}</span><strong>{area.block}</strong><small>{area.definition}</small></p>
                        <p>
                          {area.goals.length
                            ? <>ここが育つと{area.effect}ため、目標{area.goals.map((goal) => <span key={goal}>「<strong>{goal}</strong>」</span>)}の達成に近づきます。</>
                            : <>ここが育つと、{area.effect}ことが期待できます。</>}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              <div className={styles.pyramidLegend}>
                {PYRAMID_LEGEND.map(({ source, label }) => <span key={source}><i className={PYRAMID_SOURCE_CLASS[source]} aria-hidden="true" />{label}</span>)}
              </div>
              <div className={styles.pyramid} aria-label="育ちのピラミッド">
                {[...report.pyramid.rows].reverse().map((row) => (
                  <div className={`${styles.pyramidRow} ${PYRAMID_ROW_WIDTH[row.tier] ?? ''}`} key={row.tier}>
                    {row.items.map((item) => {
                      const source = pyramidSourceOf(item, report.pyramid.goalBlocks, report.pyramid.issueBlocks) ?? 'none';
                      const legend = PYRAMID_LEGEND.find((entry) => entry.source === source);
                      return (
                        <span className={`${styles.pyramidCell} ${PYRAMID_SOURCE_CLASS[source]}`} key={item}>
                          {item}
                          {/* 色と枠だけで伝えないよう、読み上げには由来を添える。 */}
                          {source === 'none' ? null : <span className={styles.visuallyHidden}>（{legend?.label}）</span>}
                        </span>
                      );
                    })}
                  </div>
                ))}
              </div>

              {report.copm.length ? (
                <>
                  <h2 className={styles.reportHeading}>
                    ご家族・本人の目標
                    {report.copm.some((goal) => goal.previous) ? <TuningTag report={report} section="copmDelta" /> : null}
                  </h2>
                  <div className={styles.levelTableWrap}>
                    <table className={`${styles.levelTable} ${styles.goalTable}`}>
                      <thead>
                        <tr>
                          <th rowSpan={2}>目標</th>
                          <th rowSpan={2}>メモ</th>
                          <th rowSpan={2}>ご家庭の重要度<small>（10段階）</small></th>
                          <th colSpan={2}>現在の状態<small>（10段階）</small></th>
                        </tr>
                        <tr><th>遂行度</th><th>満足度</th></tr>
                      </thead>
                      <tbody>
                        {copmByImportance.map((goal, index) => (
                          <tr key={goal.id ?? index}>
                            <td>{isNextCopmGoal(goal) ? <span className={styles.nextGoalTag}>次の3か月の目標</span> : null}<strong>{goal.text}</strong></td>
                            <td><small>{goal.memo}</small></td>
                            <td className={styles.numberCell}>{goal.importance}</td>
                            <td className={styles.numberCell}><CopmScore score={goal.performance} previous={goal.previous?.performance} delta={goal.performanceDelta} /></td>
                            <td className={styles.numberCell}><CopmScore score={goal.satisfaction} previous={goal.previous?.satisfaction} delta={goal.satisfactionDelta} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {report.troubleBackgrounds.length ? (
                <>
                  <h2 className={styles.reportHeading}>困りごとの背景にありそうな力</h2>
                  <div className={styles.levelTableWrap}>
                    <table className={`${styles.levelTable} ${styles.backgroundTable}`}>
                      <thead><tr><th>表面に見える困りごと</th><th>背景にありそうな力</th><th>優先して見る土台</th></tr></thead>
                      <tbody>
                        {report.troubleBackgrounds.map((row) => (
                          <tr key={row.id}>
                            <td>
                              {row.troubles.map((trouble, index) => (
                                <span key={trouble}>
                                  {index ? '／' : null}
                                  <span className={styles.troubleIcon} title={troubleProfileOf(trouble)?.category.title} aria-hidden="true">{troubleProfileOf(trouble)?.category.icon}</span>
                                  {trouble}
                                </span>
                              ))}
                            </td>
                            <td>{row.parentLabel}</td>
                            <td><strong>{row.block}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              {report.risks ? (
                <section className={styles.riskCard} aria-labelledby="risk-title">
                  <h2 id="risk-title">今の困りごとが続いた場合に起こりうること</h2>
                  {report.risks.evidence.length ? (
                    <div className={styles.riskEvidence}>
                      <h3>測定の裏づけ</h3>
                      {/* 種目が多くても2枚目に収まるよう、1段落にまとめる。 */}
                      <p>
                        {report.header.grade}の目安と比べて、到達が低めの種目があります：
                        {report.risks.evidence.map((item, index) => (
                          <span key={item.key}>{index ? '／' : null}<strong>{item.name}</strong> Lv{item.lv}/{item.maxLv}（目安 Lv{item.expectedLv}ごろ）</span>
                        ))}
                      </p>
                    </div>
                  ) : null}
                  {report.risks.stages.length ? (
                    <div className={styles.gradeOutlook}>
                      <h3>学年が上がると、こう変わっていきます</h3>
                      <ul>
                        {report.risks.stages.map((stage) => (
                          <li key={stage.label}>
                            <strong>{stage.label}ごろ</strong><span className={styles.gradeBadge}>約{stage.gradesAhead}学年先</span>（{stage.theme}）
                            <p>{stageDemandSentence(stage.demand)}このまま土台が細いままだと、{stage.concerns.join('、')}といったことが起きやすくなります。</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <small className={styles.riskDisclaimer}>※ {RISK_DISCLAIMER}</small>
                </section>
              ) : null}

              {/* 日付は実施日から3か月・6か月後の目安。予定を決めたものではないので「ごろ」と書き、曜日は付けない。 */}
              <section className={styles.scheduleBox} aria-labelledby="schedule-title">
                <h2 id="schedule-title">次回の振り返りスケジュール</h2>
                <div>
                  <p><strong>3か月レビュー</strong><span>{formatJapaneseDate(report.nextDue)}ごろ</span><small>現在地を再評価・目標更新</small></p>
                  <p><strong>6か月レビュー</strong><span>{formatJapaneseDate(report.nextReview)}ごろ</span><small>生活目標までの変化を確認</small></p>
                </div>
                <p>進み方や担当との相性に迷いが出たときは、いつでも一度ご相談ください。</p>
              </section>
              <p className={styles.reportNote}>※ {REPORT_DISCLAIMER}</p>
              <ReportFooter />
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
