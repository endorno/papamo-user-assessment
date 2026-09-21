import { describe, expect, it } from 'vitest';

import { MASTER_VERSION } from '../master';
import { reportContentSchema } from '../schema';
import type { CompletedAssessmentData } from '../schema';
import type { ReportInput } from './types';
import { RuleBasedReportGenerator } from './rule';

const data: CompletedAssessmentData = {
  lv: { post: 5, eyeh: 5, hand: 5 },
  observations: { post: [], eyeh: [], hand: [] },
  observationNotes: {},
  engagement: {},
  envSupports: [],
  troubles: ['姿勢がすぐ崩れる／机に伏せる'],
  wants: [],
  copm: [],
  ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
  ppiNote: '',
  memo: '内部メモ',
  goals: ['姿勢を安定させる'],
};

function inputFor(
  assessmentData: CompletedAssessmentData,
  options: { unlockExt?: boolean; previous?: ReportInput['previous']; seqNo?: number; ageGroup?: 'pre' | 'sch' } = {},
): ReportInput {
  return {
    child: {
      name: 'はると',
      honorific: 'kun',
      grade: '小学1年生',
      ageHint: '6〜7歳',
      ageGroup: options.ageGroup ?? 'sch',
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
    expect(report.nextReview).toBe('2027-03-01');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  it('5種目では優先テーマ3件・強み2件に分け、同Lvを定義順で並べる', async () => {
    const fiveExerciseData: CompletedAssessmentData = {
      ...data,
      lv: { post: 8, eyeh: 8, hand: 8, sacc: 8, inhi: 8 },
    };
    const report = await new RuleBasedReportGenerator().generate(
      inputFor(fiveExerciseData, { unlockExt: true }),
    );

    expect(report.priorities.map(({ key }) => key)).toEqual(['post', 'eyeh', 'hand']);
    expect(report.strengths.map(({ key }) => key)).toEqual(['sacc', 'inhi']);
    expect(report.levels).toHaveLength(5);
    expect(report.upcomingExercises).toEqual([]);
  });

  it('未実施・実施不可の種目は優先テーマにも強みにも入れず、注記に回す', async () => {
    const partialData: CompletedAssessmentData = {
      ...data,
      lv: { post: 6, eyeh: 0, hand: -1 },
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(partialData));

    expect(report.priorities.map(({ key }) => key)).toEqual(['post']);
    expect(report.strengths).toEqual([]);
    expect(report.levels.find(({ key }) => key === 'hand')).toMatchObject({
      lv: -1,
      measured: false,
      band: '実施不可',
      ladderLabel: '実施不可（取り組めなかった）',
    });
    expect(report.unmeasured).toEqual([
      { key: 'eyeh', name: 'お手玉キャッチ', upcoming: false, notPossible: false },
      { key: 'hand', name: 'グーパータッチ', upcoming: false, notPossible: true },
      { key: 'sacc', name: 'あしあとものまね', upcoming: true, notPossible: false },
      { key: 'inhi', name: '信号ゲーム', upcoming: true, notPossible: false },
    ]);
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  it('見えた動作から測定条件の注記と力加減の所見を出す', async () => {
    const observedData: CompletedAssessmentData = {
      ...data,
      observations: { post: ['指示理解の難しさ'], eyeh: ['投げる高さや方向がばらつく'], hand: [] },
      observationNotes: { post: '後進になると振り返る動作が出る。' },
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(observedData));

    expect(report.conditionNotes).toEqual([
      { key: 'post', name: 'ラインウォーク', notes: ['指示理解の難しさ'] },
    ]);
    expect(report.proprioceptionNote).toBe(true);
    expect(report.coach.strategies[0]).toMatchObject({
      key: 'post',
      observations: ['指示理解の難しさ'],
      note: '後進になると振り返る動作が出る。',
    });
  });

  it('困りごとを神経ドメインへ照合し、一致の強さで並べる', async () => {
    const hitData: CompletedAssessmentData = {
      ...data,
      // post が最下位かつ Lv6 以下なので、姿勢に紐づく困りごとは「強く一致」になる。
      lv: { post: 4, eyeh: 12, hand: 11 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる', '行を読み飛ばす／読むところを見失う'],
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(hitData));

    expect(report.domainHits.map(({ id, verdict }) => ({ id, verdict }))).toEqual([
      { id: 6, verdict: '強く一致' },
      { id: 4, verdict: '未測定' },
    ]);
    expect(report.rootDomain?.id).toBe(6);
    expect(report.pyramid.root).toBe('前庭覚');
    expect(report.pyramid.rootTierLabel).toBe('いちばん下の段');
    expect(report.pyramid.highlighted).toContain('ボディイメージ');
  });

  it('取り組みの発達と環境調整を前回と並べて返す', async () => {
    const current: CompletedAssessmentData = {
      ...data,
      engagement: { dur: 3, sup: 2 },
      envSupports: ['e-vis', 'e-cnt'],
    };
    const previous: CompletedAssessmentData = { ...data, engagement: { dur: 1, sup: 2 } };
    const report = await new RuleBasedReportGenerator().generate(inputFor(current, {
      seqNo: 2,
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: previous },
    }));

    expect(report.engagement).toEqual([
      { key: 'dur', title: '参加の持続', subtitle: 'どれくらい取り組めたか', level: 3, levelCount: 5, label: '複数の課題を続けて取り組める', prevLevel: 1, delta: 2 },
      { key: 'sup', title: '必要な支援', subtitle: 'どれくらい支えると取り組めるか', level: 2, levelCount: 5, label: '手本を見せると取り組める', prevLevel: 2, delta: 0 },
    ]);
    expect(report.envSupports).toEqual([
      { group: '情報の入り方', items: ['視覚（手本・図・写真を見せる）'] },
      { group: '見通しの立て方', items: ['回数（「あと3回」と数で示す）'] },
    ]);
    expect(report.tuning.map(({ key }) => key)).toContain('engagementDelta');
  });

  it('COPMの目標は同じ文言どうしを突き合わせて差分を出す', async () => {
    const current: CompletedAssessmentData = {
      ...data,
      wants: ['w18'],
      copm: [{ text: '授業中に座っていられるようになる', memo: '', performance: 6, satisfaction: 5, importance: 9 }],
    };
    const previous: CompletedAssessmentData = {
      ...data,
      copm: [{ text: '授業中に座っていられるようになる', memo: '', performance: 3, satisfaction: 2, importance: 9 }],
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(current, {
      seqNo: 2,
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: previous },
    }));

    expect(report.copm[0]).toMatchObject({ performanceDelta: 3, satisfactionDelta: 3 });
    expect(report.wants).toEqual([{
      id: 'w18',
      group: '学習',
      icon: '🪑',
      text: '授業中に座っていられるようになりたい',
      short: '授業中に座っていられる',
      menu: '体幹・全身／低緊張パッケージ',
    }]);
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
          "byCategory": [
            {
              "icon": "🧍",
              "id": "C",
              "items": [
                "姿勢がすぐ崩れる／机に伏せる",
              ],
              "title": "姿勢・身体の使い方",
            },
            {
              "icon": "🏠",
              "id": "E",
              "items": [
                "朝の支度や着替えに時間がかかる",
              ],
              "title": "日常生活・生活習慣",
            },
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
    expect(report.tuning.map(({ key }) => key)).toContain('comparison');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });
});
