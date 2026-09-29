import { describe, expect, it } from 'vitest';

import { parseStoredAssessmentData } from '../schema/assessment';
import { changedAssessmentSections } from './assessment-diff';

const reported = {
  assessedOn: '2026-09-01',
  unlockExt: false,
  data: parseStoredAssessmentData({
    lv: { post: 3, eyeh: 4, hand: 5 },
    observations: { post: ['体が左右や前後に大きく揺れる'] },
    envSupports: ['e-vis', 'e-cnt'],
    troubles: ['姿勢がすぐ崩れる／机に伏せる', '忘れ物・なくし物が多い'],
    wants: ['w18'],
    copm: [{ text: '授業中に座っていられる', memo: '', performance: 5, satisfaction: 5, importance: 8 }],
    ppi: { time: 1, emo: 2, soc: 3, fut: 4, nav: 5 },
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
    reordered.data.envSupports.reverse();
    expect(changedAssessmentSections(reported, reordered)).toEqual([]);
  });

  it('変わったセクションを入力画面の並び順で返す', () => {
    const current = clone(reported);
    current.assessedOn = '2026-09-02';
    current.data.lv.eyeh = 6;
    current.data.observationNotes.hand = '左右の取り違えが多い';
    current.data.copm[0]!.satisfaction = 7;
    current.data.ppiNote = '宿題の声かけ';
    current.data.memo = '所見';

    expect(changedAssessmentSections(reported, current)).toEqual(['basic', 'eyeh', 'hand', 'goals', 'ppi', 'memo']);
  });

  it('自由記入の空欄と未記入は同じとみなす', () => {
    const current = clone(reported);
    current.data.observationNotes.post = '';
    current.data.observations.eyeh = [];
    expect(changedAssessmentSections(reported, current)).toEqual([]);
  });
});
