import { describe, expect, it } from 'vitest';

import { stateOf } from './status';

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
            plan: 'base',
          },
        ],
      },
      '2026-09-02',
    );

    expect(result).toMatchObject({ key: 'draft', filled: 6, total: 6 });
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
            plan: 'base',
          },
        ],
      },
      '2026-09-01',
    );

    expect(result).toMatchObject({ key: 'due', daysLeft: 0 });
  });
});
