import { describe, expect, it } from 'vitest';

import { matchesChildId, shortChildId } from './child-id';

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

describe('IDでのしぼり込み', () => {
  const id = '01K7A3B4C5D6E7F8G9HJKM7K3Q';

  it('「#」の有無や大文字・小文字を問わず、短縮IDの一部で当たる', () => {
    expect(matchesChildId(id, '#7K3Q')).toBe(true);
    expect(matchesChildId(id, '7k3q')).toBe(true);
    expect(matchesChildId(id, ' 7K ')).toBe(true);
    expect(matchesChildId(id, '#7K3R')).toBe(false);
  });

  it('IDの全体は貼り付けたときだけ当て、時刻の入る先頭の一部では当てない', () => {
    expect(matchesChildId(id, id.toLowerCase())).toBe(true);
    expect(matchesChildId(id, '01K7')).toBe(false);
  });

  it('空の入力や「#」だけでは当てない', () => {
    expect(matchesChildId(id, '')).toBe(false);
    expect(matchesChildId(id, '#')).toBe(false);
  });
});
