import type { Honorific } from '@papamo/shared';

export function honorificLabel(honorific: Honorific) {
  if (honorific === 'kun') return 'くん';
  if (honorific === 'chan') return 'ちゃん';
  if (honorific === 'san') return 'さん';
  return '';
}

export function formatJapaneseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日`;
}

// 一覧の状態バッジ用。次回予定は3か月以内なので、モックにならって年を省く。
export function formatJapaneseMonthDay(date: string) {
  const [, month, day] = date.split('-').map(Number);
  if (!month || !day) return date;
  return `${month}月${day}日`;
}

export function coachInitial(displayName: string | null | undefined) {
  return displayName?.trim().charAt(0) || 'コ';
}
