import { exerciseByKey, goalsByImportance, type ReportContent } from '@papamo/shared';

import styles from '../styles/page.module.css';

// レポートの先頭に置くコーチ向けの紙面（コーチ用レポート v14。2026-10-19 の変更依頼）。
// 「方針とメニューの方向性」と「観察された様子・つまずき方」の2枚。保護者向けPDFには入れない。

/** 子どもページからコーチ向けの紙面へ直接飛ぶためのアンカー。 */
export const COACH_MENU_ANCHOR = 'coach-menu';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

/** 対応する目標の番号は、保護者向けの目標表（重要度順）の並びにそろえる。 */
function goalNumber(report: ReportContent, text: string) {
  const index = goalsByImportance(report.copm).findIndex((goal) => goal.text === text);
  return CIRCLED_NUMBERS[index] ?? '';
}

/** 目標と課題から導き出した領域ごとのメニュー。 */
export function AreaMenuPlan({ report }: { report: ReportContent }) {
  const { areaMenus } = report.coach;
  if (!areaMenus.length) {
    return <p className={styles.muted}>次の3か月の目標に「優先する領域」がまだないため、領域ごとのメニューを出せません。目標（COPM）を入力し、次の3か月の目標に選ぶと、ここに並びます。</p>;
  }
  return (
    <>
      <ol className={styles.areaMenus}>
        {areaMenus.map((area, index) => (
          <li key={area.item}>
            <p className={styles.areaMenuTitle}>
              <span className={styles.areaMenuNumber}>{index + 1}</span>
              <strong>{area.item}</strong>
              <span>対応する目標：{area.goals.map((goal) => `${goalNumber(report, goal)}${goal}`).join('／')}</span>
            </p>
            {area.aim ? <p className={styles.areaMenuAim}>{area.aim}</p> : null}
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
          </li>
        ))}
      </ol>
      <p className={styles.coachNote}>目標の「優先する領域」に挙がった領域を、ピラミッドの下の段から順に並べています。</p>
    </>
  );
}

/** 観察された様子・つまずき方。入力画面の「見えた動作」の選択と自由記入を、実施した種目ごとに出す。 */
export function ObservationNotes({ report }: { report: ReportContent }) {
  const notes = report.coach.exerciseNotes;
  if (!notes.some((note) => note.observations.length || note.note.trim())) {
    return <p className={styles.muted}>見えた動作のチェックも自由記入もありません。次回に向けて、崩れ方を1行でも残してください。</p>;
  }
  return (
    <div className={styles.observationCards}>
      {notes.map((note) => {
        const exercise = exerciseByKey(note.key);
        return (
          <section key={note.key} aria-label={exercise.name}>
            <p className={styles.observationTitle}><strong>{exercise.name}（{exercise.clinicalName}）</strong>／Lv{note.lv}/{exercise.maxLevel}</p>
            {note.observations.length
              ? <ul>{note.observations.map((observation) => <li key={observation}>{observation}</li>)}</ul>
              : <p className={styles.observationEmpty}>見えた動作の選択はありません。</p>}
            {note.note.trim() ? <p className={styles.observationFree}><span>自由記入</span>{note.note}</p> : null}
          </section>
        );
      })}
    </div>
  );
}
