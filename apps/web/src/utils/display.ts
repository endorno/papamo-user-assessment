import type { Gender } from '@papamo/shared';

// 敬称の表記は Googleドライブのフォルダ名・ファイル名にも使うため shared に置く。
export { honorificLabel } from '@papamo/shared';

// 呼び方は敬称で決まるため、性別とは連動させない。
const GENDER_LABELS: Record<Gender, string> = {
  boy: '男の子',
  girl: '女の子',
  unspecified: '選ばない',
};

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

const JST_DATE_TIME = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 保存日時など（UTC の ISO 文字列）を「10月11日 14:32」の形で、日本時間で出す。 */
export function formatJapaneseDateTime(isoDateTime: string) {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) return isoDateTime;
  const part = (type: Intl.DateTimeFormatPartTypes) => JST_DATE_TIME.formatToParts(date).find((item) => item.type === type)?.value ?? '';
  return `${part('month')}月${part('day')}日 ${part('hour')}:${part('minute')}`;
}

export function coachInitial(displayName: string | null | undefined) {
  return displayName?.trim().charAt(0) || 'コ';
}

/**
 * レポートの自由記入（目標のメモ・見えた動作の自由記入）で残す改行の数。
 * 改行は読みやすさのために残すが、1文字ずつ改行されると上限の文字数でも紙面を何ページも占めるため、これを超えた分は1行につなげる。
 */
export const REPORT_TEXT_MAX_LINES = 8;

/** レポートに出す自由記入。行ごとの前後の空白と空行を詰め、REPORT_TEXT_MAX_LINES を超えた行は最後の行に空白でつなげる。 */
export function reportMultilineText(text: string, maxLines = REPORT_TEXT_MAX_LINES) {
  const lines = text.split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= maxLines) return lines.join('\n');
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')].join('\n');
}
