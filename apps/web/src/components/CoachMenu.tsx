import { exerciseByKey, goalsByImportance, isNextCopmGoal, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

// レポートの先頭に置くコーチ向けの紙面（コーチ用レポート v14。2026-10-19 の変更依頼）。
// 「方針とメニューの方向性」（目標ごとの優先する領域と、領域ごとのメニュー）と「観察された様子・つまずき方」の2枚。保護者向けPDFには入れない。

/** 子どもページからコーチ向けの紙面へ直接飛ぶためのアンカー。 */
export const COACH_MENU_ANCHOR = 'coach-menu';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

/**
 * 領域ごとのメニューを1枚に載せる数。目標ブロックと課題ブロックは最大15あり、1枚に収めると縮小率の下限（0.55）でもはみ出すため、
 * 超えたら枚数を増やして均等に分ける（2026-10-28 実測：8つと目標表で縮小率 約0.7）。
 */
const AREA_MENUS_PER_SHEET = 8;

type AreaMenu = ReportContent['coach']['areaMenus'][number];

/** 領域ごとのメニューを紙面ごとに分ける。1枚目は目標ごとの優先する領域の表と並べる。領域が無くても1枚目は作る。 */
export function areaMenuSheets(areaMenus: readonly AreaMenu[]): { areas: AreaMenu[]; start: number }[] {
  const sheetCount = Math.max(1, Math.ceil(areaMenus.length / AREA_MENUS_PER_SHEET));
  const perSheet = Math.ceil(areaMenus.length / sheetCount);
  return Array.from({ length: sheetCount }, (_, index) => ({
    areas: areaMenus.slice(index * perSheet, (index + 1) * perSheet),
    start: index * perSheet,
  }));
}

/** 目標の番号は、保護者向けの目標表（次の目標を先にした重要度順）の並びにそろえる。 */
function goalNumber(report: ReportContent, text: string) {
  const index = goalsByImportance(report.copm).findIndex((goal) => goal.text === text);
  return CIRCLED_NUMBERS[index] ?? '';
}

/** 目標ごとの優先する領域（M5）。次の3か月の目標ごとに、支えるブロック3つを段の低い順に出す。保護者向けには出さない。 */
export function GoalAreaTable({ report }: { report: ReportContent }) {
  const goals = goalsByImportance(report.copm).filter(isNextCopmGoal);
  if (!goals.length) {
    return <p className={styles.muted}>次の3か月の目標がありません。目標（COPM）を入力し、次の3か月の目標に選ぶと、ここに優先する領域が並びます。</p>;
  }
  return (
    <div className={styles.levelTableWrap}>
      <table className={`${styles.levelTable} ${styles.goalAreaTable}`}>
        <thead><tr><th>次の3か月の目標</th><th>優先する領域</th></tr></thead>
        <tbody>
          {goals.map((goal, index) => (
            <tr key={goal.id ?? index}>
              <td>{goalNumber(report, goal.text)}{goal.text}</td>
              <td>
                {goal.areas.length
                  ? <ol className={styles.goalAreas}>{goal.areas.map((area, areaIndex) => <li key={area}>{CIRCLED_NUMBERS[areaIndex]}{area}</li>)}</ol>
                  : <span className={styles.muted}>—（語彙表に当たる語がありません）</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 目標と課題から導き出した領域ごとのメニュー。紙面を分けたときは、その紙面に載せる領域（areas）と通し番号の始まり（start）を渡す。
 * 並べ方の説明は最後の紙面にだけ出す。
 */
export function AreaMenuPlan({ report, areas, start, last }: { report: ReportContent; areas: readonly AreaMenu[]; start: number; last: boolean }) {
  if (!report.coach.areaMenus.length) {
    return <p className={styles.muted}>目標の優先する領域も、アセスメント・お困りごとから挙がった課題もないため、領域ごとのメニューを出せません。</p>;
  }
  return (
    <>
      <ol className={styles.areaMenus} start={start + 1}>
        {areas.map((area, index) => (
          <li key={area.block}>
            <p className={styles.areaMenuTitle}>
              <span className={styles.areaMenuNumber}>{start + index + 1}</span>
              <strong>{area.block}</strong>
              <span>
                対応する目標：
                {area.goals.length
                  ? area.goals.map((goal) => `${goalNumber(report, goal)}${goal}`).join('／')
                  : 'なし（アセスメント・お困りごとから挙がった課題）'}
              </span>
            </p>
            {area.aim ? <p className={styles.areaMenuAim}>{area.aim}</p> : null}
            {area.menus.length ? (
              <ul>
                {area.menus.map((menu) => (
                  <li key={menu.name}>
                    <span>{menu.name}</span>
                    {menu.difficulty ? <span className={styles.menuTag} data-kind="difficulty">{menu.difficulty}</span> : null}
                    {menu.form ? <span className={styles.menuTag} data-kind={menu.form === '親子で' ? 'withParent' : 'alone'}>{menu.form}</span> : null}
                    {menu.equipment ? <span className={styles.menuTag} data-kind="equipment">{menu.equipment}</span> : null}
                    {menu.parentBurden ? <span className={styles.menuTag} data-kind="burden">親の負担:{menu.parentBurden}</span> : null}
                    {menu.category ? <small>{menu.category}</small> : null}
                  </li>
                ))}
              </ul>
            ) : <p className={styles.muted}>仮のメニュー表に、この領域に当てるメニューがありません。</p>}
          </li>
        ))}
      </ol>
      {last ? <p className={styles.coachNote}>目標から必要になる領域と、アセスメント・お困りごとから課題が見えている領域を、両方に当たるもの → 目標だけ → 課題だけの順に、それぞれ下の段から並べています。</p> : null}
    </>
  );
}

/** 観察された様子・つまずき方。入力画面の「見えた動作」の選択と自由記入を、記録のある種目だけ出す。 */
export function ObservationNotes({ report }: { report: ReportContent }) {
  const notes = report.coach.exerciseNotes;
  if (!notes.length) {
    return <p className={styles.muted}>見えた動作のチェックも自由記入もありません。次回に向けて、崩れ方を1行でも残してください。</p>;
  }
  return (
    <div className={styles.observationCards}>
      {notes.map((note) => {
        const exercise = exerciseByKey(note.key);
        return (
          <section key={note.key} aria-label={exercise.name}>
            <p className={styles.observationTitle}><strong>{exercise.name}（{exercise.clinicalName}）</strong>／Lv{note.lv}/{exercise.maxLevel}</p>
            {note.observations.length ? <ul>{note.observations.map((observation) => <li key={observation}>{observation}</li>)}</ul> : null}
            {note.note ? <p className={styles.observationFree}><span>自由記入</span>{note.note}</p> : null}
          </section>
        );
      })}
    </div>
  );
}
