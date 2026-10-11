import { describe, expect, it } from 'vitest';

import { EXERCISES } from './exercises';
import { RETIRED_WANT_IDS, WANT_GROUPS, WANT_ITEMS, wantById, wantShortText, wantToGoalText } from './goals';

describe('できるようになりたいことマスタ', () => {
  it('事前アンケート項目一覧どおり24項目で、id が重ならない', () => {
    expect(WANT_ITEMS).toHaveLength(24);
    expect(new Set(WANT_ITEMS.map((item) => item.id)).size).toBe(WANT_ITEMS.length);
    for (const item of WANT_ITEMS) {
      expect(WANT_GROUPS, item.id).toContain(item.group);
      expect(EXERCISES.map((exercise) => exercise.key), item.id).toContain(item.axis);
    }
  });

  it('廃止した id は統合先が残っていて、選択肢には出さない', () => {
    for (const [retired, target] of Object.entries(RETIRED_WANT_IDS)) {
      expect(wantById(retired)).toBeNull();
      expect(wantById(target)).not.toBeNull();
    }
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
