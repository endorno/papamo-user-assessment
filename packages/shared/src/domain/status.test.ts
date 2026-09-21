import { describe, expect, it } from 'vitest';

import { assessmentProgress, stateOf } from './status';

describe('一覧の状態判定', () => {
  it('PPI 0 を未回答として扱わず、5問そろえば1項目と数える', () => {
    const result = stateOf(
      {
        archivedAt: null,
        assessments: [
          {
            status: 'draft',
            assessedOn: '2026-09-01',
            unlockExt: false,
            lv: { post: 1, eyeh: 1, hand: 1 },
            troubles: ['困りごと'],
            ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
          },
        ],
      },
      '2026-09-02',
    );

    expect(result).toMatchObject({ key: 'draft', filled: 5, total: 5 });
  });

  it('完了アセスメントから次回予定日を判定する', () => {
    const result = stateOf(
      {
        archivedAt: null,
        assessments: [
          {
            status: 'done',
            assessedOn: '2026-06-01',
            unlockExt: false,
            lv: { post: 1, eyeh: 1, hand: 1 },
            troubles: [],
            ppi: {},
          },
        ],
      },
      '2026-09-01',
    );

    expect(result).toMatchObject({ key: 'due', daysLeft: 0 });
  });

  it('4・5種目目を開放した回は必要な項目数が増える', () => {
    const base = {
      status: 'draft' as const,
      assessedOn: '2026-09-01',
      troubles: [],
      ppi: {},
    };
    expect(assessmentProgress({ ...base, unlockExt: false, lv: {} })).toEqual({ filled: 0, total: 5 });
    expect(assessmentProgress({ ...base, unlockExt: true, lv: {} })).toEqual({ filled: 0, total: 7 });
    expect(assessmentProgress({
      ...base,
      unlockExt: true,
      lv: { post: 3, eyeh: 0, hand: -1, sacc: 2, inhi: 1 },
      troubles: ['転びやすい・つまずきやすい'],
    })).toEqual({ filled: 6, total: 7 });
  });

  it('アーカイブ中の子どもは状態を持たない', () => {
    expect(stateOf({ archivedAt: '2026-09-01T00:00:00.000Z', assessments: [] })).toBeNull();
  });

  it('アセスメントがなければ初回未実施として扱う', () => {
    expect(stateOf({ archivedAt: null, assessments: [] }, '2026-09-01'))
      .toMatchObject({ key: 'first', order: 1 });
  });

  it('予定日を過ぎた回は超過日数つきで返す', () => {
    const result = stateOf(
      {
        archivedAt: null,
        assessments: [
          {
            status: 'done',
            assessedOn: '2026-01-10',
            unlockExt: false,
            lv: { post: 1, eyeh: 1, hand: 1 },
            troubles: [],
            ppi: {},
          },
        ],
      },
      '2026-05-10',
    );

    expect(result).toMatchObject({ key: 'due', daysLeft: -30 });
    expect(result?.label).toBe('予定日を30日過ぎています');
  });

  it('完了回が複数あるときは実施日がいちばん新しい回を見る', () => {
    const done = (assessedOn: string) => ({
      status: 'done' as const,
      assessedOn,
      unlockExt: false,
      lv: {},
      troubles: [],
      ppi: {},
    });
    const result = stateOf(
      { archivedAt: null, assessments: [done('2026-06-01'), done('2026-03-01')] },
      '2026-06-02',
    );

    expect(result).toMatchObject({ key: 'ok', dueDate: '2026-09-01' });
  });
});
