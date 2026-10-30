import { describe, expect, it } from 'vitest';

import { PYRAMID_BLOCKS } from './domains';
import { BLOCK_MENUS } from './menu-catalog';

describe('メニューのマスタ', () => {
  const menus = PYRAMID_BLOCKS.flatMap((block) => BLOCK_MENUS[block]);

  it('15ブロックすべてにメニューがあり、1つのメニューは1つのブロックにだけ置く', () => {
    expect(PYRAMID_BLOCKS.every((block) => BLOCK_MENUS[block].length > 0)).toBe(true);
    expect(new Set(menus.map(({ id }) => id)).size).toBe(menus.length);
  });

  it('メニュー構築サイトで検索できるよう、名前は前後に空白を持たない', () => {
    expect(menus.filter(({ name }) => name !== name.trim())).toEqual([]);
  });

  it('難易度はメニュー構築サイトの4つの値、対象区分は1つ以上', () => {
    expect(menus.filter(({ difficulty }) => !['初級', '中級', '上級', '筋トレ系'].includes(difficulty))).toEqual([]);
    expect(menus.filter(({ audiences }) => audiences.length === 0)).toEqual([]);
  });
});
