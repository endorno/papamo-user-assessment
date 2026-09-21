import { describe, expect, it } from 'vitest';

import {
  assessmentPatchRequestSchema,
  childCreateRequestSchema,
  parseStoredAssessmentData,
  parseStoredCompletedData,
} from './assessment';

describe('アセスメント入力スキーマ', () => {
  it('子ども登録では性別を省くと「選ばない」になり、目標を空で初期化する', () => {
    expect(childCreateRequestSchema.parse({
      name: 'ひなた',
      honorific: 'san',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
    })).toMatchObject({ gender: 'unspecified', goals: [] });
  });

  it('敬称は3種類だけを受け付け、性別とは独立して選べる', () => {
    expect(childCreateRequestSchema.safeParse({
      name: 'ひなた',
      honorific: 'none',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
    }).success).toBe(false);

    expect(childCreateRequestSchema.parse({
      name: 'ひなた',
      honorific: 'kun',
      gender: 'girl',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
    })).toMatchObject({ honorific: 'kun', gender: 'girl' });
  });

  it('暦に存在しない日付を拒否する', () => {
    expect(childCreateRequestSchema.safeParse({
      name: 'ゆい',
      honorific: 'chan',
      gradeCode: 'e1',
      joinedOn: '2026-02-30',
      goals: [],
    }).success).toBe(false);

    expect(assessmentPatchRequestSchema.safeParse({
      assessedOn: '2026-13-01',
      data: {},
      updatedAt: '2026-09-12T00:00:00.000Z',
    }).success).toBe(false);
  });

  it('種目に存在しない見えた動作と未知の種目キーを拒否する', () => {
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    expect(assessmentPatchRequestSchema.safeParse({
      ...base,
      data: { observations: { post: ['存在しない動作'] } },
    }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({
      ...base,
      data: { observations: { unknown: ['体が左右や前後に大きく揺れる'] } },
    }).success).toBe(false);
  });

  it('種目ごとのLv上限を超える値と、未実施・実施不可の外の値を拒否する', () => {
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    // 上限は種目ごとに持つが、現在はどの種目も30まで。
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: 30 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: 31 } } }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { sacc: 30 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { sacc: 31 } } }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: -1 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: -2 } } }).success).toBe(false);
  });

  it('旧版で保存された記録を読み直せる（つまずき・計画は捨て、目標はCOPM行に起こす）', () => {
    const legacy = {
      lv: { post: 5, eyeh: 4, hand: 6 },
      errs: { post: ['幅からはみ出す', '頭上物を落とす'] },
      plan: 'base',
      troubles: ['姿勢がすぐ崩れる／机に伏せる'],
      ppi: { time: 4, emo: 3, soc: 2, fut: 4, nav: 4 },
      ppiNote: '朝の支度に時間がかかる',
      memo: '初回。',
      goals: ['板書を写すのが間に合うようになる'],
    };

    const draft = parseStoredAssessmentData(legacy);
    expect(draft.lv).toEqual({ post: 5, eyeh: 4, hand: 6 });
    expect(draft.observations).toEqual({});
    expect('plan' in draft).toBe(false);
    expect(draft.observationNotes).toEqual({});
    expect(draft.engagement).toEqual({});
    expect(draft.envSupports).toEqual([]);
    expect(draft.wants).toEqual([]);
    expect(draft.copm).toEqual([
      { text: '板書を写すのが間に合うようになる', memo: '', performance: 5, satisfaction: 5, importance: 5 },
    ]);
    expect(draft.memo).toBe('初回。');

    // 完了済みの回も同じ形に寄せて読める。
    expect(parseStoredCompletedData(legacy).goals).toEqual(['板書を写すのが間に合うようになる']);
  });
});
