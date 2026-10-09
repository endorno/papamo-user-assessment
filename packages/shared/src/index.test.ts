import { describe, expect, it } from 'vitest';

import { apiHealthResponseSchema, displayNameSchema, formatCoachName } from './index';

describe('apiHealthResponseSchema', () => {
  it('正常な API ヘルスレスポンスを受け入れる', () => {
    expect(
      apiHealthResponseSchema.parse({ status: 'ok', service: 'api' }),
    ).toEqual({ status: 'ok', service: 'api' });
  });
});

describe('コーチの表示名', () => {
  it('名前の部分だけを持ち、表示するときに「コーチ」を付ける', () => {
    expect(displayNameSchema.parse(' さとう ')).toBe('さとう');
    expect(formatCoachName('さとう')).toBe('さとうコーチ');
  });

  it('名前の後ろに入力された「コーチ」は落とす', () => {
    expect(displayNameSchema.parse('さとうコーチ')).toBe('さとう');
    expect(displayNameSchema.parse('さとう　コーチ')).toBe('さとう');
  });

  it('「コーチ」だけや空欄は受け付けない', () => {
    expect(displayNameSchema.safeParse('コーチ').success).toBe(false);
    expect(displayNameSchema.safeParse('  ').success).toBe(false);
  });

  it('31文字以上は受け付けない', () => {
    expect(displayNameSchema.safeParse('あ'.repeat(30)).success).toBe(true);
    expect(displayNameSchema.safeParse('あ'.repeat(31)).success).toBe(false);
  });
});
