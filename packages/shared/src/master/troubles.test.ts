import { describe, expect, it } from 'vitest';

import { NEURO_DOMAINS } from './domains';
import { TROUBLE_CATEGORIES, TROUBLE_ITEMS, troubleDomainOf, troubleProfileOf } from './troubles';

describe('お困りごとマスタ', () => {
  it('事前アンケート項目一覧どおり 5カテゴリ × 6項目で、文言が重ならない', () => {
    expect(TROUBLE_CATEGORIES.map((category) => `${category.icon} ${category.id}. ${category.title}`)).toEqual([
      '📖 A. 学習・見る・手を使う',
      '🔄 B. 落ち着き・切り替え',
      '🧍 C. 姿勢・身体の使い方',
      '🤸 D. 運動・手先の不器用さ',
      '🏠 E. 日常生活・生活習慣',
    ]);
    for (const category of TROUBLE_CATEGORIES) expect(category.items, category.id).toHaveLength(6);
    // 保存値が文言そのものなので、重なると別の項目と区別できなくなる。
    expect(new Set(TROUBLE_ITEMS).size).toBe(30);
  });

  it('すべての項目が神経ドメインに紐づく', () => {
    const domainIds = NEURO_DOMAINS.map((domain) => domain.id);
    for (const text of TROUBLE_ITEMS) expect(domainIds, text).toContain(troubleDomainOf(text));
  });

  it('項目からカテゴリ・発達ピラミッド・育てたい力・主に支える種目を引ける', () => {
    const profile = troubleProfileOf('ざわざわした場所が苦手');
    expect(profile?.category).toEqual({ id: 'B', icon: '🔄', title: '落ち着き・切り替え' });
    expect(profile?.domain).toMatchObject({
      id: 5,
      pyramid: '身体の位置',
      parentLabel: 'まわりとの位置関係をつかむ力',
      priorityKey: 'eyeh',
    });
    expect(troubleProfileOf('マスタにない困りごと')).toBeNull();
  });
});
