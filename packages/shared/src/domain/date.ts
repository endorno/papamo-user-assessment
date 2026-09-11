const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const JST_TIME_ZONE = 'Asia/Tokyo';
const DAY_MS = 24 * 60 * 60 * 1000;

function dateParts(value: string): [number, number, number] {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    throw new Error(`日付の形式が不正です: ${value}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function todayInJst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return formatDate(Number(values.year), Number(values.month), Number(values.day));
}

export function schoolYear(date: string): number {
  const [year, month] = dateParts(date);
  return month >= 4 ? year : year - 1;
}

export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = dateParts(date);
  const zeroBasedMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return formatDate(targetYear, targetMonth, Math.min(day, lastDay));
}

export function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = dateParts(from);
  const [toYear, toMonth, toDay] = dateParts(to);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      DAY_MS,
  );
}

export function nextDueDate(assessedOn: string): string {
  return addMonthsClamped(assessedOn, 3);
}

export function isValidDateString(value: string): boolean {
  try {
    const [year, month, day] = dateParts(value);
    return (
      new Date(Date.UTC(year, month - 1, day)).getUTCFullYear() === year &&
      new Date(Date.UTC(year, month - 1, day)).getUTCMonth() === month - 1 &&
      new Date(Date.UTC(year, month - 1, day)).getUTCDate() === day
    );
  } catch {
    return false;
  }
}
