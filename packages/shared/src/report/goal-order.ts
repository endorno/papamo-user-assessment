/**
 * 目標（COPM）を、親御さんにとっての重要度が高い順に並べる（同じ重要度なら入力順）。
 * 保護者向けレポートの目標表の並びと、コーチ向けの「対応する目標」の番号（①②…）はこの順にそろえる。
 */
export function goalsByImportance<T extends { importance: number }>(goals: readonly T[]): T[] {
  return [...goals].sort((first, second) => second.importance - first.importance);
}
