import { describe, expect, it } from 'vitest';

import { MASTER_VERSION } from '../master';
import { reportContentSchema } from '../schema';
import type { CompletedAssessmentData } from '../schema';
import { RuleBasedReportGenerator } from './rule';

const data: CompletedAssessmentData = {
  lv: { post: 5, eyeh: 5, hand: 5 },
  errs: { post: [], eyeh: [], hand: [] },
  troubles: ['姿勢がすぐ崩れる／机に伏せる'],
  ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
  ppiNote: '',
  plan: 'base',
  memo: '内部メモ',
  goals: ['姿勢を安定させたい'],
};

describe('RuleBasedReportGenerator', () => {
  it('同じLvでは種目定義順で優先テーマを決める', async () => {
    const report = await new RuleBasedReportGenerator().generate({
      child: {
        name: 'はると',
        honorific: 'kun',
        grade: '小学1年生',
        ageHint: '6〜7歳',
        ageGroup: 'sch',
        goals: [],
      },
      coach: { displayName: 'さとうコーチ' },
      assessment: { seqNo: 1, assessedOn: '2026-09-01', unlockExt: false, data },
      master: { version: MASTER_VERSION },
      generatedAt: '2026-09-01T00:00:00.000Z',
    });

    expect(report.kind).toBe('first');
    expect(report.priorities.map(({ key }) => key)).toEqual(['post', 'eyeh']);
    expect(report.strengths.map(({ key }) => key)).toEqual(['hand']);
    expect(report.upcomingExercises.map(({ key }) => key)).toEqual(['sacc', 'inhi']);
    expect(report.nextDue).toBe('2026-12-01');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });
});
