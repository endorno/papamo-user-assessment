import { describe, expect, it } from 'vitest';

import { gradeAt } from './grade';

describe('学年の自動進級', () => {
  it('4月1日を境に進級する', () => {
    const child = { gradeCode: 'e1' as const, gradeBaseYear: 2026 };
    expect(gradeAt(child, '2027-03-31').name).toBe('小学1年生');
    expect(gradeAt(child, '2027-04-01').name).toBe('小学2年生');
  });

  it('中学3年生を超えたら卒業以上で止める', () => {
    const child = { gradeCode: 'j3' as const, gradeBaseYear: 2026 };
    expect(gradeAt(child, '2026-04-01').name).toBe('中学3年生');
    expect(gradeAt(child, '2027-04-01')).toMatchObject({
      code: 'graduated',
      name: '中学卒業以上',
      graduated: true,
    });
  });
});
