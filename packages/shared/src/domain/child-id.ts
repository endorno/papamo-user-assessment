/** 同じお名前のお子さまを見分けるために、画面とPDFのファイル名に出すIDの文字数。 */
export const SHORT_CHILD_ID_LENGTH = 4;

/**
 * IDの末尾だけを返す。ULID や UUID v7 は先頭が作成時刻で、同じ時期に登録した子どもでそろってしまうため、
 * 乱数の入る末尾を使う。ID の方式が変わっても同じ規則で出せるよう、形式には依存しない。
 */
export function shortChildId(id: string): string {
  return id.slice(-SHORT_CHILD_ID_LENGTH).toUpperCase();
}
