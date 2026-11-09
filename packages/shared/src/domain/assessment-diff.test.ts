import { describe, expect, it } from 'vitest';

import { parseStoredAssessmentData } from '../schema/assessment';
import { changedAssessmentSections } from './assessment-diff';

const reported = {
  assessedOn: '2026-09-01',
  unlockExt: false,
  data: parseStoredAssessmentData({
    lv: { post: 3, eyeh: 4, hand: 5 },
    observations: { post: ['体が左右や前後に大きく揺れる'] },
    troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる', '忘れ物・なくし物が多い'],
    copm: [{ text: '授業中に座っていられる', memo: '', performance: 5, satisfaction: 5, importance: 8 }],
  }),
};

// shared は DOM・Node の型を持たないため、structuredClone の代わりに JSON で複製する。
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('レポートへ未反映の変更', () => {
  it('同じ入力なら差分はない', () => {
    expect(changedAssessmentSections(reported, clone(reported))).toEqual([]);
  });

  it('選んだ順番だけが違う場合は差分にしない', () => {
    const reordered = clone(reported);
    reordered.data.troubles.reverse();
    expect(changedAssessmentSections(reported, reordered)).toEqual([]);
  });

  it('変わったセクションを入力画面の並び順で返す', () => {
    const current = clone(reported);
    current.assessedOn = '2026-09-02';
    current.data.lv.eyeh = 6;
    current.data.observationNotes.hand = '左右の取り違えが多い';
    current.data.copm[0]!.satisfaction = 7;
    current.data.troubles.pop();

    expect(changedAssessmentSections(reported, current)).toEqual(['basic', 'eyeh', 'hand', 'troubles', 'goals']);
  });

  it('目標の前回の点数（ツール導入前）を変えたら目標の差分にする', () => {
    const current = clone(reported);
    current.data.copm[0]!.baseline = { performance: 3, satisfaction: 2 };
    expect(changedAssessmentSections(reported, current)).toEqual(['goals']);
  });

  it('目標の候補を外したり付けたりしたら目標の差分にする（優先する領域が変わりうるため）', () => {
    const current = clone(reported);
    current.data.copm[0]!.wantId = 'w18';
    expect(changedAssessmentSections(reported, current)).toEqual(['goals']);
  });

  it('自由記入の空欄と未記入は同じとみなす', () => {
    const current = clone(reported);
    current.data.observationNotes.post = '';
    current.data.observations.eyeh = [];
    expect(changedAssessmentSections(reported, current)).toEqual([]);
  });

  it('次の目標のチェック変更は未反映として扱い、旧データの未指定とチェックありは同じとみなす', () => {
    const current = clone(reported);
    current.data.copm[0]!.continueNext = true;
    expect(changedAssessmentSections(reported, current)).toEqual([]);
    current.data.copm[0]!.continueNext = false;
    expect(changedAssessmentSections(reported, current)).toEqual(['goals']);
  });
});
