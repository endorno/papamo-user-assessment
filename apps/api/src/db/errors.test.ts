import { describe, expect, it } from 'vitest';

import { isForeignKeyConstraintError, isUniqueConstraintError } from './errors';

describe('D1制約エラーの判定', () => {
  it('一意制約を、メッセージと SQLITE のコードのどちらでも拾う', () => {
    expect(isUniqueConstraintError(new Error('D1_ERROR: UNIQUE constraint failed: children.share_code'))).toBe(true);
    expect(isUniqueConstraintError(new Error('SQLITE_CONSTRAINT_UNIQUE'))).toBe(true);
    expect(isUniqueConstraintError(new Error('SQLITE_CONSTRAINT_PRIMARYKEY'))).toBe(true);
    expect(isUniqueConstraintError(new Error('FOREIGN KEY constraint failed'))).toBe(false);
  });

  it('外部キー制約を、メッセージと SQLITE のコードのどちらでも拾う', () => {
    expect(isForeignKeyConstraintError(new Error('D1_ERROR: FOREIGN KEY constraint failed'))).toBe(true);
    expect(isForeignKeyConstraintError(new Error('SQLITE_CONSTRAINT_FOREIGNKEY'))).toBe(true);
    expect(isForeignKeyConstraintError(new Error('UNIQUE constraint failed'))).toBe(false);
  });

  it('drizzle が包んだ原因側のメッセージまで辿る', () => {
    const wrapped = new Error('Failed query', {
      cause: new Error('D1_ERROR', { cause: new Error('UNIQUE constraint failed: children.share_code') }),
    });
    expect(isUniqueConstraintError(wrapped)).toBe(true);
  });

  it('Error 以外や無関係な失敗は制約エラーにしない', () => {
    expect(isUniqueConstraintError('UNIQUE constraint failed')).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError(new Error('Network error'))).toBe(false);
    expect(isForeignKeyConstraintError(undefined)).toBe(false);
  });
});
