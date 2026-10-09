import { describe, expect, it } from 'vitest';

import { shortChildId } from './child-id';

describe('子どもの短縮ID', () => {
  it('ULID は時刻の入る先頭ではなく末尾4文字を返す', () => {
    // 同じ日に登録すると先頭がそろうが、末尾は乱数なので見分けられる。
    expect(shortChildId('01K7A3B4C5D6E7F8G9HJKM7K3Q')).toBe('7K3Q');
    expect(shortChildId('01K7A3B4C5XYZW8G9HJKMNPRST')).toBe('PRST');
  });

  it('UUID でも末尾4文字を大文字で返す', () => {
    expect(shortChildId('0192f3a4-5b6c-7d8e-9f0a-1b2c3d4e5f6a')).toBe('5F6A');
  });
});
