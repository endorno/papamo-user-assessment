import { describe, expect, it } from 'vitest';

import { formatShareCode, generateShareCode, isValidShareCode, normalizeShareCode } from './share-code';

describe('共有コード', () => {
  it('ハイフン・前後の空白・小文字を取り除いて突き合わせる', () => {
    expect(normalizeShareCode(' abcd-efgh ')).toBe('ABCDEFGH');
    expect(normalizeShareCode('ABCDEFGH')).toBe('ABCDEFGH');
  });

  it('8文字のときだけ4文字ずつに区切る', () => {
    expect(formatShareCode('ABCDEFGH')).toBe('ABCD-EFGH');
    expect(formatShareCode('abcd-efgh')).toBe('ABCD-EFGH');
    // 長さが違う値は入力途中とみなして、そのまま返す。
    expect(formatShareCode('ABCD')).toBe('ABCD');
  });

  it('見間違えやすい文字（I・O・0・1）を含むコードは受け付けない', () => {
    expect(isValidShareCode('ABCD-EFGH')).toBe(true);
    expect(isValidShareCode('abcdefgh')).toBe(true);
    expect(isValidShareCode('ABCD-EFG')).toBe(false);
    expect(isValidShareCode('ABCD-EFGHJ')).toBe(false);
    expect(isValidShareCode('ABCD-EFG0')).toBe(false);
    expect(isValidShareCode('ABCD-EFGI')).toBe(false);
  });

  it('乱数から作ったコードは必ず検証を通る', () => {
    const bytes = Uint8Array.from([0, 31, 32, 255, 7, 100, 200, 13]);
    const code = generateShareCode(bytes);
    expect(code).toHaveLength(8);
    expect(isValidShareCode(code)).toBe(true);
  });

  it('乱数が足りないときは黙って短いコードを作らない', () => {
    expect(() => generateShareCode(new Uint8Array(7))).toThrow();
  });
});
