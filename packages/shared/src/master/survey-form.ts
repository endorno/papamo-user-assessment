/**
 * 事前アンケート（Googleフォーム）の回答シートの1行目（列名）。左の列から順に並べる。
 * コーチは回答シートからお子さまの行をまるごとコピーして貼り付け、取り込みはこの並びから列の位置を求めて読む。
 * フォームの設問を変えたら、回答シートの1行目をそのままここへ写す（設問が未確定のため仮の内容。2026-10-11）。
 *
 * 選択式の設問の選択肢は、お困りごと・できるようになりたいことのマスタの文言とそろえる（文言で照合するため）。
 * ご家庭のお困り度の設問は、ツールの入力から廃止したため外した（2026-10-21）。
 */
export const SURVEY_SHEET_HEADER = [
  'タイムスタンプ',
  'お子さまのお名前',
  'お子さまのお困りごと（当てはまるものをすべて選んでください）',
  'できるようになりたいこと（4つまで選んでください）',
  'そのほかに、できるようになりたいこと（1）',
  'そのほかに、できるようになりたいこと（2）',
] as const;

export type SurveySheetHeader = (typeof SURVEY_SHEET_HEADER)[number];

/**
 * 取り込みで読む列（値は SURVEY_SHEET_HEADER の列名）。列名を書き間違えると型エラーになる。
 * - answeredAt：回答シートの先頭列。行の一部だけをコピーした貼り付けを見分けるのに使う
 * - childName：取り込む前に、どのお子さまの回答かをコーチに見せる
 * - troubles / wants：チェックボックス（複数の回答は「, 」区切り）
 * - freeWants：できるようになりたいことの自由記載。目標（COPM）の文言として入れる
 */
export const SURVEY_SHEET_COLUMNS = {
  answeredAt: 'タイムスタンプ',
  childName: 'お子さまのお名前',
  troubles: 'お子さまのお困りごと（当てはまるものをすべて選んでください）',
  wants: 'できるようになりたいこと（4つまで選んでください）',
  freeWants: ['そのほかに、できるようになりたいこと（1）', 'そのほかに、できるようになりたいこと（2）'],
} as const satisfies {
  answeredAt: SurveySheetHeader;
  childName: SurveySheetHeader;
  troubles: SurveySheetHeader;
  wants: SurveySheetHeader;
  freeWants: readonly SurveySheetHeader[];
};
