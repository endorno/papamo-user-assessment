import { ENGAGEMENT_AXES } from '../master/engagement';
import { EXERCISES, type ExerciseKey } from '../master/exercises';
import { PPI_QUESTIONS } from '../master/ppi';
import type { AssessmentData } from '../schema/assessment';

/** 入力画面のセクション単位。レポートへ未反映の変更がどこにあるかを示すのに使う。 */
export type AssessmentSectionKey =
  | 'basic'
  | ExerciseKey
  | 'engagement'
  | 'troubles'
  | 'goals'
  | 'ppi'
  | 'memo';

interface AssessmentInputLike {
  assessedOn: string;
  unlockExt: boolean;
  data: AssessmentData;
}

// 選んだ順番は意味を持たないので、並べ替えてから比べる（外して付け直しただけで差分にしない）。
function sameSet(first: readonly string[] | undefined, second: readonly string[] | undefined): boolean {
  const left = [...new Set(first ?? [])].sort();
  const right = [...new Set(second ?? [])].sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCopm(first: AssessmentData['copm'], second: AssessmentData['copm']): boolean {
  return first.length === second.length && first.every((goal, index) => {
    const other = second[index];
    return other !== undefined
      && goal.text === other.text
      && goal.memo === other.memo
      && goal.performance === other.performance
      && goal.satisfaction === other.satisfaction
      && goal.importance === other.importance;
  });
}

/**
 * レポートを作ったときの入力と、いまの入力で違うセクションを返す（入力画面の並び順）。
 * 空なら、いまの入力はレポートにすべて反映されている。
 */
export function changedAssessmentSections(
  reported: AssessmentInputLike,
  current: AssessmentInputLike,
): AssessmentSectionKey[] {
  const before = reported.data;
  const after = current.data;
  const changed: AssessmentSectionKey[] = [];

  if (reported.assessedOn !== current.assessedOn || reported.unlockExt !== current.unlockExt) {
    changed.push('basic');
  }
  for (const { key } of EXERCISES) {
    if (
      before.lv[key] !== after.lv[key]
      || !sameSet(before.observations[key], after.observations[key])
      || (before.observationNotes[key] ?? '') !== (after.observationNotes[key] ?? '')
    ) {
      changed.push(key);
    }
  }
  if (
    ENGAGEMENT_AXES.some(({ key }) => before.engagement[key] !== after.engagement[key])
    || !sameSet(before.envSupports, after.envSupports)
  ) {
    changed.push('engagement');
  }
  if (!sameSet(before.troubles, after.troubles)) changed.push('troubles');
  if (!sameSet(before.wants, after.wants) || !sameCopm(before.copm, after.copm)) changed.push('goals');
  if (
    PPI_QUESTIONS.some(({ key }) => before.ppi[key] !== after.ppi[key])
    || before.ppiNote !== after.ppiNote
  ) {
    changed.push('ppi');
  }
  if (before.memo !== after.memo) changed.push('memo');

  return changed;
}
