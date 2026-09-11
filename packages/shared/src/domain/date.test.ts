import { describe, expect, it } from 'vitest';

import { addMonthsClamped, daysBetween, nextDueDate, todayInJst } from './date';

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
});
