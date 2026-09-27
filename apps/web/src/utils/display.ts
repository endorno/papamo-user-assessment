import type { Gender, Honorific } from '@papamo/shared';

const HONORIFIC_LABELS: Record<Honorific, string> = {
  kun: 'くん',
  chan: 'ちゃん',
  san: 'さん',
};

// 呼び方は敬称で決まるため、性別とは連動させない。
const GENDER_LABELS: Record<Gender, string> = {
  boy: '男の子',
  girl: '女の子',
  unspecified: '選ばない',
};

export function honorificLabel(honorific: Honorific) {
  return HONORIFIC_LABELS[honorific] ?? '';
}

export function genderLabel(gender: Gender) {
  return GENDER_LABELS[gender] ?? '';
}

export function formatJapaneseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日`;
}

export function formatJapaneseMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  if (!year || !monthNumber) return month;
  return `${year}年${monthNumber}月`;
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
