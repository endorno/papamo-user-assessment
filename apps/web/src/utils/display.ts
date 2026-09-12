import type { Honorific } from '@papamo/shared';

export function honorificLabel(honorific: Honorific) {
  if (honorific === 'kun') return 'くん';
  if (honorific === 'chan') return 'ちゃん';
  return 'さん';
}

export function formatJapaneseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日`;
}

export function coachInitial(displayName: string | null | undefined) {
  return displayName?.trim().charAt(0) || 'コ';
}
