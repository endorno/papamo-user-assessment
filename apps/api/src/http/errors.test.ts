import { DrizzleQueryError } from 'drizzle-orm';
import { assessmentDataDraftSchema } from '@papamo/shared';
import { describe, expect, it } from 'vitest';

import { describeError } from './errors';

describe('エラーログの内容', () => {
  it('クエリの失敗は SQL 文と原因だけを残し、バインド値（名前・入力本文）を出さない', () => {
    const cause = new Error('D1_ERROR: CHECK constraint failed: children_honorific: SQLITE_CONSTRAINT');
    const error = new DrizzleQueryError(
      'insert into "children" ("id", "name") values (?, ?)',
      ['child-1', 'ひなた', '{"memo":"家で転びやすい"}'],
      cause,
    );

    const described = describeError(error);
    const logged = JSON.stringify(described);

    expect(described.query).toBe('insert into "children" ("id", "name") values (?, ?)');
    expect(described.cause?.message).toContain('CHECK constraint failed');
    expect(logged).not.toContain('ひなた');
    expect(logged).not.toContain('転びやすい');
  });

  it('検証エラーは項目の位置だけを残し、受け取った値を出さない', () => {
    const result = assessmentDataDraftSchema.safeParse({ troubles: ['ひなたは家で転びやすい'] });
    expect(result.success).toBe(false);

    const logged = describeError(result.error);

    expect(logged.issues).toEqual([{ code: 'invalid_enum_value', path: 'troubles.0' }]);
    expect(JSON.stringify(logged)).not.toContain('ひなた');
  });

  it('JSON の解析エラーは元の文字列を含むため、メッセージを残さない', () => {
    let caught: unknown;
    try {
      JSON.parse('{"name":"ひなた", broken');
    } catch (error) {
      caught = error;
    }

    const logged = describeError(caught);

    expect(logged.name).toBe('SyntaxError');
    expect(JSON.stringify(logged)).not.toContain('ひなた');
  });

  it('それ以外のエラーはメッセージと呼び出し位置を残す', () => {
    const logged = describeError(new Error('レポート担当コーチが見つかりません: coach-1'));

    expect(logged.message).toBe('レポート担当コーチが見つかりません: coach-1');
    expect(logged.stack?.every((line) => line.startsWith('at '))).toBe(true);
  });
});
