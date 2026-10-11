import { describe, expect, it } from 'vitest';

import { EXERCISES } from './exercises';
import { WANT_GROUPS, WANT_ITEMS, wantById, wantShortText, wantToGoalText } from './goals';

describe('できるようになりたいことマスタ', () => {
  it('事前アンケート項目一覧どおり24項目で、id が重ならない', () => {
    expect(WANT_ITEMS).toHaveLength(24);
    expect(new Set(WANT_ITEMS.map((item) => item.id)).size).toBe(WANT_ITEMS.length);
    for (const item of WANT_ITEMS) {
      expect(WANT_GROUPS, item.id).toContain(item.group);
      expect(EXERCISES.map((exercise) => exercise.key), item.id).toContain(item.axis);
    }
  });

  it('統合して廃止した w10 は選択肢に出さない', () => {
    expect(wantById('w10')).toBeNull();
    expect(wantById('w9')).not.toBeNull();
  });

  it('目標欄の仮の文言と短い表記は、願いの言い回しを残さない', () => {
    for (const item of WANT_ITEMS) {
      expect(wantToGoalText(item.text), item.id).not.toMatch(/(たい|ほしい)$/);
      expect(wantShortText(item.text), item.id).not.toMatch(/(たい|ほしい)$/);
      expect(wantShortText(item.text), item.id).not.toBe('');
    }
    expect(wantToGoalText('自分に自信を持っていろんな事に挑戦してほしい')).toBe('自分に自信を持っていろんな事に挑戦する');
    expect(wantShortText('自分に自信を持っていろんな事に挑戦してほしい')).toBe('自分に自信を持っていろんな事に挑戦');
    expect(wantShortText('球技が上手になりたい')).toBe('球技が上手');
  });
});
