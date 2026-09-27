import { todayInJst } from '@papamo/shared';

import styles from './ui.module.css';

// 入会月は数年前までさかのぼれれば足りる。範囲外の既存値は選択肢に足して消さない。
const YEARS_BEFORE_CURRENT = 5;
const YEARS_AFTER_CURRENT = 1;
const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'));

function yearOptions(selectedYear: number): number[] {
  const currentYear = Number(todayInJst().slice(0, 4));
  const years = new Set<number>();
  for (let year = currentYear - YEARS_BEFORE_CURRENT; year <= currentYear + YEARS_AFTER_CURRENT; year += 1) {
    years.add(year);
  }
  if (Number.isInteger(selectedYear)) years.add(selectedYear);
  return [...years].sort((left, right) => right - left);
}

/**
 * YYYY-MM を年と月の2つのセレクトで選ばせる。
 * `<input type="month">` は Safari・Firefox のPC版でただの文字入力になるため使わない。
 */
export function MonthSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [year = '', month = ''] = value.split('-');

  return (
    <div className={styles.monthSelect}>
      <select id={id} value={year} required onChange={(event) => onChange(`${event.target.value}-${month}`)}>
        {yearOptions(Number(year)).map((option) => <option key={option} value={String(option)}>{option}年</option>)}
      </select>
      <select aria-label={`${label}の月`} value={month} required onChange={(event) => onChange(`${year}-${event.target.value}`)}>
        {MONTHS.map((option) => <option key={option} value={option}>{Number(option)}月</option>)}
      </select>
    </div>
  );
}
