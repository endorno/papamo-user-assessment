import { describe, expect, it } from 'vitest';

import {
  assessmentPatchRequestSchema,
  childCreateRequestSchema,
} from './assessment';

describe('アセスメント入力スキーマ', () => {
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

  it('種目に存在しないつまずきと未知の種目キーを拒否する', () => {
    const base = {
      updatedAt: '2026-09-12T00:00:00.000Z',
    };
    expect(assessmentPatchRequestSchema.safeParse({
      ...base,
      data: { errs: { post: ['存在しないつまずき'] } },
    }).success).toBe(false);
    expect(assessmentPatchRequestSchema.safeParse({
      ...base,
      data: { errs: { unknown: ['幅からはみ出す'] } },
    }).success).toBe(false);
  });
});
