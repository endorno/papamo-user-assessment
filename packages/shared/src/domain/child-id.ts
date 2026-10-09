/** 同じお名前のお子さまを見分けるために、画面とPDFのファイル名に出すIDの文字数。 */
export const SHORT_CHILD_ID_LENGTH = 4;

/**
 * IDの末尾だけを返す。ULID や UUID v7 は先頭が作成時刻で、同じ時期に登録した子どもでそろってしまうため、
 * 乱数の入る末尾を使う。ID の方式が変わっても同じ規則で出せるよう、形式には依存しない。
 */
export function shortChildId(id: string): string {
  return id.slice(-SHORT_CHILD_ID_LENGTH).toUpperCase();
}

/**
 * しぼり込みの入力がこのIDを指しているか。「#」の有無と大文字・小文字は問わない。
 * 打ちながら絞れるよう短縮IDは一部一致で探し、IDの全体は貼り付けたときだけ一致させる
 * （全体を一部一致にすると、時刻の入る先頭で同じ時期の子どもがまとめて当たるため）。
 */
export function matchesChildId(id: string, query: string): boolean {
  const normalized = query.trim().replace(/^#/, '').toUpperCase();
  if (!normalized) return false;
  return shortChildId(id).includes(normalized) || id.toUpperCase() === normalized;
}
