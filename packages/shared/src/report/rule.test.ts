import { describe, expect, it } from 'vitest';

import { MASTER_VERSION } from '../master';
import { reportContentSchema } from '../schema';
import type { CompletedAssessmentData } from '../schema';
import type { ReportInput } from './types';
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

function inputFor(
  assessmentData: CompletedAssessmentData,
  options: { unlockExt?: boolean; previous?: ReportInput['previous']; seqNo?: number } = {},
): ReportInput {
  return {
    child: {
      name: 'はると',
      honorific: 'kun',
      grade: '小学1年生',
      ageHint: '6〜7歳',
      ageGroup: 'sch',
      goals: [],
    },
    coach: { displayName: 'さとうコーチ' },
    assessment: {
      seqNo: options.seqNo ?? 1,
      assessedOn: '2026-09-01',
      unlockExt: options.unlockExt ?? false,
      data: assessmentData,
    },
    ...(options.previous ? { previous: options.previous } : {}),
    master: { version: MASTER_VERSION },
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('RuleBasedReportGenerator', () => {
  it('同じLvでは種目定義順で優先テーマを決める', async () => {
    const report = await new RuleBasedReportGenerator().generate(inputFor(data));

    expect(report.kind).toBe('first');
    expect(report.priorities.map(({ key }) => key)).toEqual(['post', 'eyeh']);
    expect(report.strengths.map(({ key }) => key)).toEqual(['hand']);
    expect(report.upcomingExercises.map(({ key }) => key)).toEqual(['sacc', 'inhi']);
    expect(report.nextDue).toBe('2026-12-01');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  it('5種目では優先テーマ3件・強み2件に分け、同Lvを定義順で並べる', async () => {
    const fiveExerciseData: CompletedAssessmentData = {
      ...data,
      lv: { post: 8, eyeh: 8, hand: 8, sacc: 8, inhi: 8 },
      errs: { post: [], eyeh: [], hand: [], sacc: [], inhi: [] },
    };
    const report = await new RuleBasedReportGenerator().generate(
      inputFor(fiveExerciseData, { unlockExt: true }),
    );

    expect(report.priorities.map(({ key }) => key)).toEqual(['post', 'eyeh', 'hand']);
    expect(report.strengths.map(({ key }) => key)).toEqual(['sacc', 'inhi']);
    expect(report.levels).toHaveLength(5);
    expect(report.upcomingExercises).toEqual([]);
  });

  it('比較回のLv・困りごと・PPIの差分を決定的に生成する', async () => {
    const previousData: CompletedAssessmentData = {
      ...data,
      lv: { post: 2, eyeh: 5, hand: 7 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる', '忘れ物・なくし物が多い'],
      ppi: { time: 5, emo: 4, soc: 3, fut: 2, nav: 1 },
    };
    const currentData: CompletedAssessmentData = {
      ...data,
      lv: { post: 5, eyeh: 6, hand: 7 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる', '朝の支度や着替えに時間がかかる'],
      ppi: { time: 3, emo: 2, soc: 1, fut: 2, nav: 0 },
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(currentData, {
      seqNo: 2,
      previous: {
        seqNo: 1,
        assessedOn: '2026-06-01',
        unlockExt: false,
        data: previousData,
      },
    }));

    expect({
      kind: report.kind,
      levelChanges: report.levels.map(({ key, prevLv, lv, delta }) => ({ key, prevLv, lv, delta })),
      troubles: report.troubles,
      ppi: report.ppi,
      nextDue: report.nextDue,
    }).toMatchInlineSnapshot(`
      {
        "kind": "comparison",
        "levelChanges": [
          {
            "delta": 3,
            "key": "post",
            "lv": 5,
            "prevLv": 2,
          },
          {
            "delta": 1,
            "key": "eyeh",
            "lv": 6,
            "prevLv": 5,
          },
          {
            "delta": 0,
            "key": "hand",
            "lv": 7,
            "prevLv": 7,
          },
        ],
        "nextDue": "2026-12-01",
        "ppi": {
          "current": {
            "emo": 2,
            "fut": 2,
            "nav": 0,
            "soc": 1,
            "time": 3,
          },
          "note": "",
          "previous": {
            "emo": 4,
            "fut": 2,
            "nav": 1,
            "soc": 3,
            "time": 5,
          },
        },
        "troubles": {
          "added": [
            "朝の支度や着替えに時間がかかる",
          ],
          "current": [
            "姿勢がすぐ崩れる／机に伏せる",
            "朝の支度や着替えに時間がかかる",
          ],
          "gone": [
            "忘れ物・なくし物が多い",
          ],
          "stayed": [
            "姿勢がすぐ崩れる／机に伏せる",
          ],
        },
      }
    `);
    expect(reportContentSchema.parse(report)).toEqual(report);
  });
});
