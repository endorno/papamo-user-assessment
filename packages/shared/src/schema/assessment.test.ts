import { describe, expect, it } from 'vitest';
import { ALL_TROUBLE_ITEMS } from '../master/troubles';
import { ENVIRONMENT_SUPPORT_ITEMS, EXERCISES, WANT_ITEMS } from '../master';

import {
  assessmentDataCompletedSchema,
  assessmentPatchRequestSchema,
  childCreateRequestSchema,
  TEXT_LIMITS,
  parseStoredAssessmentData,
  withoutExtExerciseInput,
} from './assessment';

describe('アセスメント入力スキーマ', () => {
  it('子ども登録では性別を省くと「選ばない」になる', () => {
    expect(childCreateRequestSchema.parse({
      name: 'ひなた',
      honorific: 'san',
      gradeCode: 'e1',
      joinedMonth: '2026-09',
    })).toMatchObject({ gender: 'unspecified' });
  });

  it('敬称は3種類だけを受け付け、性別とは独立して選べる', () => {
    expect(childCreateRequestSchema.safeParse({
      name: 'ひなた',
      honorific: 'none',
      gradeCode: 'e1',
      joinedMonth: '2026-09',
    }).success).toBe(false);

    expect(childCreateRequestSchema.parse({
      name: 'ひなた',
      honorific: 'kun',
      gender: 'girl',
      gradeCode: 'e1',
      joinedMonth: '2026-09',
    })).toMatchObject({ honorific: 'kun', gender: 'girl' });
  });

  it('暦に存在しない年月・日付を拒否する', () => {
    expect(childCreateRequestSchema.safeParse({
      name: 'ゆい',
      honorific: 'chan',
      gradeCode: 'e1',
      joinedMonth: '2026-13',
    }).success).toBe(false);

    expect(childCreateRequestSchema.safeParse({
      name: 'ゆい',
      honorific: 'chan',
      gradeCode: 'e1',
      joinedMonth: '2026-09-01',
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

  it('種目ごとのLv上限を超える値と、Lv0 未満の値を拒否する', () => {
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    // 上限は種目ごとに持つが、現在はどの種目も30まで。
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: 30 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: 31 } } }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { sacc: 30 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { sacc: 31 } } }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: 0 } } }).success).toBe(true);
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { lv: { post: -1 } } }).success).toBe(false);
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

  it('文言が空の目標は下書きには保存でき、完了では前後の空白を落として1文字以上を求める', () => {
    const goal = { memo: '', performance: 5, satisfaction: 5, importance: 5 };
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    expect(assessmentPatchRequestSchema.safeParse({ ...base, data: { copm: [{ ...goal, text: '' }] } }).success).toBe(true);

    const completed = {
      lv: { post: 1, eyeh: 1, hand: 1 },
      observations: {},
      observationNotes: {},
      engagement: {},
      envSupports: [],
      troubles: [],
      wants: [],
      ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
      ppiNote: '',
      memo: '',
    };
    expect(assessmentDataCompletedSchema.safeParse({ ...completed, copm: [{ ...goal, text: '　' }] }).success).toBe(false);
    expect(assessmentDataCompletedSchema.parse({ ...completed, copm: [{ ...goal, text: ' 縄跳びを跳べる　' }] }).copm[0]?.text)
      .toBe('縄跳びを跳べる');
  });

  it('自由記入欄は入力欄と同じ上限で検証する', () => {
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    const within = (data: Record<string, unknown>) => assessmentPatchRequestSchema.safeParse({ ...base, data }).success;
    expect(within({ memo: 'あ'.repeat(TEXT_LIMITS.memo) })).toBe(true);
    expect(within({ memo: 'あ'.repeat(TEXT_LIMITS.memo + 1) })).toBe(false);
    expect(within({ ppiNote: 'あ'.repeat(TEXT_LIMITS.ppiNote + 1) })).toBe(false);
    expect(within({ observationNotes: { post: 'あ'.repeat(TEXT_LIMITS.observationNote + 1) } })).toBe(false);
  });

  it('選択式の配列に同じ値が重複していると拒否する', () => {
    const base = { updatedAt: '2026-09-12T00:00:00.000Z' };
    const accepts = (data: Record<string, unknown>) => assessmentPatchRequestSchema.safeParse({ ...base, data }).success;
    const envKey = ENVIRONMENT_SUPPORT_ITEMS[0]!.key;
    expect(accepts({ envSupports: [envKey] })).toBe(true);
    expect(accepts({ envSupports: [envKey, envKey] })).toBe(false);
    expect(accepts({ wants: [WANT_ITEMS[0]!.id, WANT_ITEMS[0]!.id] })).toBe(false);
    expect(accepts({ troubles: [ALL_TROUBLE_ITEMS[0]!, ALL_TROUBLE_ITEMS[0]!] })).toBe(false);
    const observation = EXERCISES[0]!.observations[0]!.text;
    expect(accepts({ observations: { [EXERCISES[0]!.key]: [observation, observation] } })).toBe(false);
  });
});
