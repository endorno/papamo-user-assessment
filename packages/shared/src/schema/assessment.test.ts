import { describe, expect, it } from 'vitest';

import {
  assessmentPatchRequestSchema,
  childCreateRequestSchema,
  parseStoredAssessmentData,
  withoutExtExerciseInput,
} from './assessment';

describe('アセスメント入力スキーマ', () => {
  it('子ども登録では性別を省くと「選ばない」になる', () => {
    expect(childCreateRequestSchema.parse({
      name: 'ひなた',
      honorific: 'san',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
    })).toMatchObject({ gender: 'unspecified' });
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

  it('4・5種目目を閉じるとLv・見えた動作・自由記入をまとめて落とす', () => {
    const data = parseStoredAssessmentData({
      lv: { post: 5, sacc: 7, inhi: 3 },
      observations: { post: ['体が左右や前後に大きく揺れる'], sacc: ['目だけでなく頭ごと動かして探す'] },
      observationNotes: { post: '後進で振り返る', inhi: '合図より早い' },
    });

    const closed = withoutExtExerciseInput(data, false);
    expect(closed.lv).toEqual({ post: 5 });
    expect(closed.observations).toEqual({ post: ['体が左右や前後に大きく揺れる'] });
    expect(closed.observationNotes).toEqual({ post: '後進で振り返る' });
    // 開放したままなら何も変えない（同じ参照をそのまま返す）。
    expect(withoutExtExerciseInput(data, true)).toBe(data);
    // 元のオブジェクトは書き換えない。
    expect(data.lv.sacc).toBe(7);
  });
});
