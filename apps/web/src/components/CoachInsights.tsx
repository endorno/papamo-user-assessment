import {
  COACH_COPY,
  exerciseByKey,
  NEURO_DOMAINS,
  PPI_QUESTIONS,
  PPI_SCORE_MAX,
  type CoachFocusRole,
  type ExerciseKey,
  type ReportContent,
  type WantPackageStatus,
} from '@papamo/shared';

import styles from '../styles/page.module.css';

// 子どもページに出すコーチ向けの見立て。design-mock-v2 の「コーチ用」レポートを分解して載せる。
// 保護者向けレポートには出さない内容なので、ReportPage からは使わない。

const ROLE_LABEL: Record<CoachFocusRole, string> = { main: '主軸', next: '次点', keep: '維持' };

const WANT_STATUS_LABEL: Record<WantPackageStatus, string> = {
  ready: '着手できる',
  foundationFirst: '先に土台',
  unmeasured: '見通し未定',
};

/** 未開放の4・5種目目は到達の記録がないため、Lv の代わりに出す。 */
const UPCOMING_LEVEL_TEXT = '半年目以降';

function levelText(lv: number, maxLv?: number) {
  return maxLv ? `Lv${lv}/${maxLv}` : `Lv${lv}`;
}

function deltaText(delta: number | undefined) {
  if (delta === undefined) return null;
  if (delta > 0) return `▲${delta}`;
  if (delta < 0) return `▼${Math.abs(delta)}`;
  return '±0';
}

function exerciseNames(keys: ExerciseKey[]) {
  return keys.map((key) => exerciseByKey(key).name).join('・');
}

interface SectionProps {
  report: ReportContent;
  /** 見出し横に出す「第N回で記録」などの出典。 */
  source: string;
}

export function CoachCautionsPanel({ report, source }: SectionProps) {
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="cautions-title">
      <div className={styles.sectionHeader}>
        <div><h2 id="cautions-title">レッスン前の注意点</h2><p className={styles.muted}>{source}・保護者レポートには載せない</p></div>
      </div>
      <ul className={styles.cautionList}>
        {report.coach.cautions.map((caution) => (
          <li key={caution.key} className={caution.key === 'parentBelief' ? styles.cautionInfo : undefined}>
            <strong>{caution.key === 'parentBelief' ? '🔄' : '⚑'} {caution.title}{caution.exercises.length ? `：${exerciseNames(caution.exercises)}` : ''}</strong>
            <p>{caution.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function EngagementPanel({ report, source }: SectionProps) {
  const hasEngagement = report.engagement.length > 0;
  const hasSupports = report.envSupports.length > 0;
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="engagement-title">
      <div className={styles.sectionHeader}>
        <div><h2 id="engagement-title">取り組みの様子と効いた条件</h2><p className={styles.muted}>{source}・次のコーチへの引き継ぎ</p></div>
      </div>
      {hasEngagement ? (
        <div className={styles.hubEngagement}>
          {report.engagement.map((axis) => {
            const delta = deltaText(axis.delta);
            return (
              <div key={axis.key}>
                <span className={styles.hubEngagementTitle}>{axis.title}</span>
                <span className={styles.engagementTrack} aria-hidden="true">
                  {Array.from({ length: axis.levelCount }, (_, index) => (
                    <i className={index <= axis.level ? styles.engagementFilled : undefined} key={index} />
                  ))}
                </span>
                <strong>{axis.level + 1}/{axis.levelCount}{delta ? <small>{delta}</small> : null}</strong>
                <em>{axis.label}</em>
              </div>
            );
          })}
        </div>
      ) : <p className={styles.muted}>取り組みの発達は未評価です。次回は4つの軸を記録してください。</p>}
      {hasEngagement ? <p className={styles.coachNote}>{COACH_COPY.engagementNote}</p> : null}
      <h3 className={styles.coachSubheading}>取り組みやすくなった条件</h3>
      {hasSupports ? (
        <dl className={styles.supportGroups}>
          {report.envSupports.map((group) => (
            <div key={group.group}>
              <dt>{group.group}</dt>
              <dd>{group.items.map((item) => <span key={item}>{item.split('（')[0]}</span>)}</dd>
            </div>
          ))}
        </dl>
      ) : <p className={styles.muted}>記録された条件はありません。</p>}
      <p className={styles.coachNote}>{COACH_COPY.envSupportNote}</p>
    </section>
  );
}

export function StrategyPanel({ report }: { report: ReportContent }) {
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="strategy-title">
      <div className={styles.sectionHeader}><div><h2 id="strategy-title">今期のレッスン戦略</h2><p className={styles.muted}>優先テーマと次に狙うLv</p></div></div>
      <div className={styles.strategyList}>
        {report.coach.strategies.map((strategy, index) => {
          const exercise = exerciseByKey(strategy.key);
          return (
            <article className={styles.strategyCard} key={strategy.key}>
              <span className={styles.strategyNumber}>{index + 1}</span>
              <div>
                <strong>{exercise.parentName}<small>{exercise.name}・Lv{strategy.lv}/{exercise.maxLevel}</small></strong>
                <p>次は <b>Lv{strategy.nextLv}</b>：{strategy.nextLabel}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function LessonMenuPanel({ report, source }: SectionProps) {
  const { focus, domainMenus } = report.coach.plan;
  if (!focus.length) {
    return (
      <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="menu-title">
        <div className={styles.sectionHeader}><div><h2 id="menu-title">3か月・6か月に当てるメニュー</h2><p className={styles.muted}>{source}</p></div></div>
        <p className={styles.muted}>測れた種目がないため、当てるメニューを決められません。次回、到達を測ってから決めます。</p>
      </section>
    );
  }
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="menu-title">
      <div className={styles.sectionHeader}><div><h2 id="menu-title">3か月・6か月に当てるメニュー</h2><p className={styles.muted}>{source}</p></div></div>
      <p className={styles.focusSummary}>
        {focus.map((item) => (
          <span key={item.key}><b>{ROLE_LABEL[item.role]}</b>{exerciseByKey(item.key).parentName}（{exerciseByKey(item.key).name} {levelText(item.lv, item.maxLv)}）</span>
        ))}
      </p>
      <div className={styles.cautionBox}><strong>⚑ 測定と訓練を混ぜない</strong><p>{COACH_COPY.measureVsTrain}</p></div>
      <div className={styles.menuPlan}>
        <div className={styles.menuPlan3}>
          <h3>▶ 3か月：土台をつくる</h3>
          <p className={styles.coachNote}>{COACH_COPY.month3Lead}</p>
          {focus.map((item) => (
            <div className={styles.menuGroup} key={item.key}>
              <strong><span className={styles.roleBadge} data-role={item.role}>{ROLE_LABEL[item.role]}</span>{exerciseByKey(item.key).parentName}</strong>
              <ul>{item.month3.map((menu) => <li key={menu}>{menu}</li>)}</ul>
            </div>
          ))}
          {domainMenus.length ? (
            <div className={styles.menuGroupDomain}>
              <strong>◆ 照合で上位に来た領域に直接あてる</strong>
              {domainMenus.map((domain) => (
                <div key={domain.id}>
                  <small>{domain.title}（{domain.region}）</small>
                  <ul>{domain.menus.map((menu) => <li key={menu}>{menu}</li>)}</ul>
                </div>
              ))}
              <p className={styles.coachNote}>{COACH_COPY.domainMenuNote}</p>
            </div>
          ) : null}
        </div>
        <div className={styles.menuPlan6}>
          <h3>▶ 6か月：土台の上に目標を乗せる</h3>
          <p className={styles.coachNote}>{COACH_COPY.month6Lead}</p>
          {focus.map((item) => (
            <div className={styles.menuGroup} key={item.key}>
              <strong><span className={styles.roleBadge} data-role={item.role}>{ROLE_LABEL[item.role]}</span>{exerciseByKey(item.key).parentName}</strong>
              <ul>{item.month6.map((menu) => <li key={menu}>{menu}</li>)}</ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ExerciseNotesPanel({ report, source }: SectionProps) {
  const notes = report.coach.exerciseNotes;
  const hasAny = notes.some((note) => note.observations.length || note.note);
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="exercise-notes-title">
      <div className={styles.sectionHeader}><div><h2 id="exercise-notes-title">見えた動作・つまずき方</h2><p className={styles.muted}>{source}・種目ごと</p></div></div>
      {hasAny ? (
        <div className={styles.exerciseNotes}>
          {notes.map((note) => {
            const exercise = exerciseByKey(note.key);
            const plain = note.observations.filter((observation) => !note.conditions.includes(observation));
            return (
              <article key={note.key}>
                <header><strong>{exercise.name}</strong><small>{exercise.parentName}</small><span>{levelText(note.lv, exercise.maxLevel)}</span></header>
                {plain.length || note.conditions.length ? (
                  <div className={styles.observationTags}>
                    {plain.map((observation) => <span key={observation}>{observation}</span>)}
                    {note.conditions.map((condition) => <span className={styles.conditionTag} key={condition}>⚑ 測定条件：{condition}</span>)}
                  </div>
                ) : null}
                {note.note ? <p>{note.note}</p> : null}
                {!plain.length && !note.conditions.length && !note.note ? <p className={styles.muted}>記入なし</p> : null}
              </article>
            );
          })}
        </div>
      ) : <p className={styles.muted}>記入がありません。次回に向けて、崩れ方を1行でも残してください。</p>}
      {report.coach.memo ? <div className={styles.coachMemo}><strong>コーチ所見（内部用）</strong><p>{report.coach.memo}</p></div> : null}
    </section>
  );
}

/** 概要タブ用。困りごとの件数とご家庭のお困り度だけを出し、照合の詳細は「振り返りと計画」に回す。 */
export function TroubleSummaryPanel({ report, source }: SectionProps) {
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

export function TroubleMatchPanel({ report, source }: SectionProps) {
  const rootRegion = report.rootDomain ? NEURO_DOMAINS.find((domain) => domain.id === report.rootDomain?.id)?.region : undefined;
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="trouble-title">
      <div className={styles.sectionHeader}><div><h2 id="trouble-title">お困りごと × アセスメント照合</h2><p className={styles.muted}>{source}・困りごとの背景にある力の見立て</p></div></div>
      {report.domainHits.length ? (
        <div className={styles.domainMatches}>
          {report.domainHits.map((hit) => (
            <article key={hit.id}>
              <header>
                <strong>{hit.id}. {hit.title}</strong>
                <span className={styles.verdictBadge} data-verdict={hit.verdict}>{hit.verdict}</span>
              </header>
              <small>{NEURO_DOMAINS.find((domain) => domain.id === hit.id)?.region}・主軸：{hit.priorityParentName}（{hit.priorityName} {hit.priorityMeasured ? levelText(hit.priorityLv, hit.priorityMaxLv) : UPCOMING_LEVEL_TEXT}）</small>
              <ul>{hit.troubles.map((trouble) => <li key={trouble}>{trouble}</li>)}</ul>
            </article>
          ))}
        </div>
      ) : <p className={styles.muted}>チェックされた困りごとはありません。</p>}
      {report.rootDomain ? (
        <div className={styles.rootCandidate}>
          <strong>🔍 根本原因の第一候補</strong>
          <p><b>{rootRegion}</b>（{report.rootDomain.title}）。保護者には「{report.rootDomain.parentLabel}」という身体語で説明する。</p>
          <small>※ {COACH_COPY.rootDomainNote}</small>
        </div>
      ) : null}
    </section>
  );
}

export function GoalFocusPanel({ report, source }: SectionProps) {
  const { wantPackages, copmFocus } = report.coach;
  const empty = !wantPackages.length && !copmFocus.mostImportant;
  return (
    <section className={`${styles.panel} ${styles.coachPanel}`} aria-labelledby="goal-focus-title">
      <div className={styles.sectionHeader}><div><h2 id="goal-focus-title">目標への当て方</h2><p className={styles.muted}>{source}・ご家族・本人の目標から</p></div></div>
      {empty ? <p className={styles.muted}>目標（COPM）とできるようになりたいことが未入力です。</p> : null}
      <div className={styles.goalFocus}>
        {copmFocus.mostImportant ? (
          <p>重要度が最も高いのは<b>「{copmFocus.mostImportant.text}」</b>（{copmFocus.mostImportant.importance}／10）。3か月の当てどころはここに寄せる。</p>
        ) : null}
        {copmFocus.lowSatisfaction.length ? (
          <div className={styles.cautionBox}><strong>⚑ 遂行は高いが満足が低い：{copmFocus.lowSatisfaction.join('／')}</strong><p>{COACH_COPY.copmLowSatisfaction}</p></div>
        ) : null}
        {copmFocus.mostImportant ? <p className={styles.coachNote}>{COACH_COPY.copmNote}</p> : null}
        {wantPackages.length ? (
          <>
            <h3 className={styles.coachSubheading}>できるようになりたいこと → 対応パッケージ</h3>
            <ul className={styles.wantPackages}>
              {wantPackages.map((want) => (
                <li key={want.id}>
                  <div>
                    <strong>{want.icon} {want.short}</strong>
                    <span className={styles.wantStatus} data-status={want.status}>{WANT_STATUS_LABEL[want.status]}</span>
                  </div>
                  <small>{want.menu}・支える種目：{exerciseByKey(want.axisKey).name} {want.status === 'unmeasured' ? UPCOMING_LEVEL_TEXT : levelText(want.axisLv, want.axisMaxLv)}</small>
                  {want.status === 'foundationFirst' ? <small className={styles.wantWarning}>{COACH_COPY.wantFoundationFirst}</small> : null}
                  {want.status === 'unmeasured' ? <small className={styles.wantWarning}>{COACH_COPY.wantUnmeasured}</small> : null}
                </li>
              ))}
            </ul>
            <p className={styles.coachNote}>{COACH_COPY.wantPackageNote}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}

/** 概要タブの入口。「振り返りと計画」タブの要点だけを見せ、詳細はタブへ送る。 */
export function NextLessonCard({ report, onOpenPlan }: { report: ReportContent; onOpenPlan: () => void }) {
  const main = report.coach.strategies[0];
  const cautions = report.coach.cautions.filter((caution) => caution.key !== 'parentBelief');
  return (
    <section className={`${styles.panel} ${styles.nextLessonCard}`} aria-labelledby="next-lesson-title">
      <h2 id="next-lesson-title">次のレッスンに向けて</h2>
      {main ? (
        <p>
          いちばんの狙い：<b>{exerciseByKey(main.key).parentName}</b>（{exerciseByKey(main.key).name}）を <b>Lv{main.nextLv}</b> へ
        </p>
      ) : null}
      {cautions.length ? (
        <p className={styles.nextLessonCautions}>⚑ 注意点 {cautions.length}件：{cautions.map((caution) => caution.title).join('／')}</p>
      ) : null}
      <button className={styles.secondaryButton} type="button" onClick={onOpenPlan}>振り返りと計画を見る</button>
    </section>
  );
}
