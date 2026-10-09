import {
  COACH_COPY,
  exerciseByKey,
  type CoachFocusRole,
  type ReportContent,
  type WantPackageStatus,
} from '@papamo/shared';

import styles from '../styles/page.module.css';

// レポート末尾のコーチ向け紙面（メニュー提案）。design-mock-v2 のコーチ用レポートの「3か月・6か月に当てるメニュー」を移植。
// 保護者向けPDFには入れない。

/** 子どもページからコーチ向け紙面へ直接飛ぶためのアンカー。 */
export const COACH_MENU_ANCHOR = 'coach-menu';

const ROLE_LABEL: Record<CoachFocusRole, string> = { main: '主軸', next: '次点', keep: '維持' };

const WANT_STATUS_LABEL: Record<WantPackageStatus, string> = {
  ready: '着手できる',
  foundationFirst: '先に土台',
  unmeasured: '見通し未定',
};

/** 未開放の4・5種目目は到達の記録がないため、Lv の代わりに出す。 */
const UPCOMING_LEVEL_TEXT = '半年目以降';

function levelText(lv: number, maxLv: number) {
  return `Lv${lv}/${maxLv}`;
}

export function LessonMenuPlan({ report }: { report: ReportContent }) {
  const { focus, domainMenus } = report.coach.plan;
  if (!focus.length) {
    return <p className={styles.muted}>測れた種目がないため、当てるメニューを決められません。次回、到達を測ってから決めます。</p>;
  }
  return (
    <>
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
    </>
  );
}

/** 目標（COPM）か、できるようになりたいことの入力があるときだけ「目標への当て方」を出す。 */
export function hasGoalFocus(report: ReportContent) {
  return report.coach.wantPackages.length > 0 || report.coach.copmFocus.mostImportant !== null;
}

export function GoalFocus({ report }: { report: ReportContent }) {
  const { wantPackages, copmFocus } = report.coach;
  const foundationFirst = wantPackages.filter((want) => want.status === 'foundationFirst');
  const unmeasured = wantPackages.filter((want) => want.status === 'unmeasured');
  return (
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
          <div className={styles.levelTableWrap}>
            <table className={`${styles.levelTable} ${styles.wantTable}`}>
              <thead><tr><th>できるようになりたいこと</th><th>対応するメニューパッケージ</th><th>主に支える種目</th><th>見通し</th></tr></thead>
              <tbody>
                {wantPackages.map((want) => (
                  <tr key={want.id}>
                    <td><strong>{want.icon} {want.short}</strong></td>
                    <td>{want.menu}</td>
                    <td>{exerciseByKey(want.axisKey).name}<small>{want.status === 'unmeasured' ? UPCOMING_LEVEL_TEXT : levelText(want.axisLv, want.axisMaxLv)}</small></td>
                    <td><span className={styles.wantStatus} data-status={want.status}>{WANT_STATUS_LABEL[want.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {foundationFirst.length ? (
            <p className={styles.wantWarning}><b>⚑ 先に土台：{foundationFirst.map((want) => want.short).join('／')}</b>{'\u3000'}{COACH_COPY.wantFoundationFirst}</p>
          ) : null}
          {unmeasured.length ? (
            <p className={styles.wantWarning}><b>⚑ 見通し未定：{unmeasured.map((want) => want.short).join('／')}</b>{'\u3000'}{COACH_COPY.wantUnmeasured}</p>
          ) : null}
          <p className={styles.coachNote}>{COACH_COPY.wantPackageNote}</p>
        </>
      ) : null}
    </div>
  );
}
