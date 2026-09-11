import { z } from 'zod';

import { gradeCodeSchema, honorificSchema } from './assessment';
import { reportContentSchema } from './report';

export const childViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  honorific: honorificSchema,
  gradeCode: gradeCodeSchema,
  gradeBaseYear: z.number().int(),
  grade: z.object({ code: z.string(), name: z.string(), ageHint: z.string(), ageGroup: z.enum(['pre', 'sch']), graduated: z.boolean() }),
  joinedOn: z.string(),
  extUnlocked: z.boolean(),
  goals: z.array(z.string()),
  archivedAt: z.string().nullable(),
  shareCode: z.string(),
  ownerShareCode: z.string().optional(),
  role: z.enum(['owner', 'member']),
  state: z.unknown().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const childrenResponseSchema = z.object({
  children: z.array(childViewSchema),
});

export const childAssessmentSummarySchema = z.object({
  id: z.string(),
  seqNo: z.number().int().positive(),
  status: z.enum(['draft', 'done']),
  assessedOn: z.string(),
  unlockExt: z.boolean(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  reportAvailable: z.boolean(),
});

export const childDetailSchema = childViewSchema.extend({
  assessments: z.array(childAssessmentSummarySchema),
  latestReport: reportContentSchema.nullable(),
});

export type ChildView = z.infer<typeof childViewSchema>;
export type ChildAssessmentSummary = z.infer<typeof childAssessmentSummarySchema>;
export type ChildDetail = z.infer<typeof childDetailSchema>;
