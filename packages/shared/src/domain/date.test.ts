import { describe, expect, it } from 'vitest';

import {
  addMonthsClamped,
  daysBetween,
  isValidDateString,
  firstDayOfMonth,
  isValidMonthString,
  monthOfDate,
  monthOrdinalSince,
  nextDueDate,
  schoolYear,
  todayInJst,
} from './date';

describe('日付計算', () => {
  it('JST の日付を返す', () => {
    expect(todayInJst(new Date('2026-03-31T15:00:00.000Z'))).toBe('2026-04-01');
  });

  it('月末を繰り上げずに3か月後を求める', () => {
    expect(addMonthsClamped('2025-11-30', 3)).toBe('2026-02-28');
    expect(addMonthsClamped('2026-05-31', 3)).toBe('2026-08-31');
    expect(nextDueDate('2026-08-31')).toBe('2026-11-30');
  });

  it('日付だけの差分を求める', () => {
    expect(daysBetween('2026-09-01', '2026-09-15')).toBe(14);
  });

  it('入会月を1か月目として月単位で数える', () => {
    expect(monthOrdinalSince('2026-03', '2026-03-01')).toBe(1);
    expect(monthOrdinalSince('2026-03', '2026-08-31')).toBe(6);
    expect(monthOrdinalSince('2025-11', '2026-02-01')).toBe(4);
    expect(monthOrdinalSince('2026-10', '2026-09-28')).toBe(1);
  });

  it('入会月の形式を検証する', () => {
    expect(isValidMonthString('2026-09')).toBe(true);
    expect(isValidMonthString('2026-13')).toBe(false);
    expect(isValidMonthString('2026-00')).toBe(false);
    expect(isValidMonthString('2026-09-01')).toBe(false);
    expect(monthOfDate('2026-09-28')).toBe('2026-09');
    expect(firstDayOfMonth('2026-09')).toBe('2026-09-01');
  });

  it('年度は4月始まり', () => {
    expect(schoolYear('2026-03-31')).toBe(2025);
    expect(schoolYear('2026-04-01')).toBe(2026);
    expect(schoolYear('2026-12-31')).toBe(2026);
  });

  it('暦に存在しない日付と形式違いを弾く', () => {
    expect(isValidDateString('2026-02-28')).toBe(true);
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2026-02-29')).toBe(false);
    expect(isValidDateString('2026-04-31')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-00-10')).toBe(false);
    expect(isValidDateString('2026/09/01')).toBe(false);
    expect(isValidDateString('')).toBe(false);
  });
});
