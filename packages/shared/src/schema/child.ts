import { z } from 'zod';

import { exerciseKeySchema, genderSchema, gradeCodeSchema, honorificSchema, storedLevelSchema } from './assessment';
import { reportContentSchema } from './report';

export const childListStateSchema = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('draft'),
    label: z.string(),
    filled: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    order: z.literal(0),
  }),
  z.object({
    key: z.literal('due'),
    label: z.string(),
    daysLeft: z.number().int(),
    order: z.literal(0.5),
  }),
  z.object({
    key: z.literal('first'),
    label: z.string(),
    order: z.literal(1),
  }),
  z.object({
    key: z.literal('ok'),
    label: z.string(),
    dueDate: z.string(),
    order: z.literal(2),
  }),
]);

export const latestAssessmentViewSchema = z.object({
  id: z.string(),
  seqNo: z.number().int().positive(),
  status: z.enum(['draft', 'done']),
  assessedOn: z.string(),
  unlockExt: z.boolean(),
  lv: z.record(exerciseKeySchema, storedLevelSchema.optional()),
});

export const childViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  honorific: honorificSchema,
  gender: genderSchema,
  gradeCode: gradeCodeSchema,
  gradeBaseYear: z.number().int(),
  grade: z.object({ code: z.string(), name: z.string(), ageHint: z.string(), ageGroup: z.enum(['pre', 'sch']), graduated: z.boolean() }),
  joinedMonth: z.string(),
  extUnlocked: z.boolean(),
  archivedAt: z.string().nullable(),
  shareCode: z.string(),
  ownerShareCode: z.string().optional(),
  role: z.enum(['owner', 'member']),
  state: childListStateSchema.nullable(),
  latestAssessment: latestAssessmentViewSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const childrenResponseSchema = z.object({
  children: z.array(childViewSchema),
});

export const childResponseSchema = z.object({
  child: childViewSchema,
});

/**
 * 1人のコーチが担当できるお子さま（アーカイブ中を除く）の上限。
 * 一覧はページングせずに全員を描くため、これを超える運用になったらページングを入れる。
 */
export const MAX_ACTIVE_CHILDREN_PER_COACH = 100;

export const childAssessmentSummarySchema = z.object({
  id: z.string(),
  seqNo: z.number().int().positive(),
  status: z.enum(['draft', 'done']),
  assessedOn: z.string(),
  unlockExt: z.boolean(),
  goals: z.array(z.string()),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  reportAvailable: z.boolean(),
  /** 完了後に編集し、まだレポートへ反映していない変更があるか。 */
  hasUnreportedChanges: z.boolean(),
});

export const childDetailSchema = childViewSchema.extend({
  assessments: z.array(childAssessmentSummarySchema),
  latestReport: reportContentSchema.nullable(),
});

export const childDetailResponseSchema = z.object({
  child: childDetailSchema,
});

export const childImportResponseSchema = childDetailResponseSchema.extend({
  ownershipTransferred: z.boolean(),
});

export type ChildView = z.infer<typeof childViewSchema>;
export type ChildDetail = z.infer<typeof childDetailSchema>;
