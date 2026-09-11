import { z } from 'zod';

import { PPI_QUESTIONS } from '../master/ppi';
import { PLANS, type PlanKey } from '../master/plans';
import { EXERCISES, type ExerciseKey } from '../master/exercises';

export const exerciseKeySchema = z.enum(
  EXERCISES.map((exercise) => exercise.key) as [ExerciseKey, ...ExerciseKey[]],
);
export const planKeySchema = z.enum(
  Object.keys(PLANS) as [PlanKey, ...PlanKey[]],
);
export const honorificSchema = z.enum(['kun', 'chan', 'san']);
export const gradeCodeSchema = z.enum([
  'k0',
  'k1',
  'k2',
  'k3',
  'e1',
  'e2',
  'e3',
  'e4',
  'e5',
  'e6',
  'j1',
  'j2',
  'j3',
]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください。');
const levelSchema = z.number().int().min(0).max(20);
const ppiValueSchema = z.number().int().min(0).max(5);
const lvFields = Object.fromEntries(EXERCISES.map((exercise) => [exercise.key, levelSchema.optional()]));
const ppiFields = Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema.optional()]));

export const assessmentDataDraftSchema = z.object({
  lv: z.object(lvFields).default({}),
  errs: z.record(z.string(), z.array(z.string())).default({}),
  troubles: z.array(z.string()).default([]),
  ppi: z.object(ppiFields).default({}),
  ppiNote: z.string().default(''),
  plan: planKeySchema.nullable().default(null),
  memo: z.string().default(''),
  goals: z.array(z.string()).default([]),
});

export const assessmentDataPatchSchema = z.object({
  lv: z.object(lvFields).optional(),
  errs: z.record(z.string(), z.array(z.string())).optional(),
  troubles: z.array(z.string()).optional(),
  ppi: z.object(ppiFields).optional(),
  ppiNote: z.string().optional(),
  plan: planKeySchema.nullable().optional(),
  memo: z.string().optional(),
});

export const assessmentDataCompletedSchema = z.object({
  lv: z.object(lvFields),
  errs: z.record(z.string(), z.array(z.string())),
  troubles: z.array(z.string()),
  ppi: z.object(Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema]))),
  ppiNote: z.string(),
  plan: planKeySchema,
  memo: z.string(),
  goals: z.array(z.string()),
});

export const childCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  honorific: honorificSchema,
  gradeCode: gradeCodeSchema,
  joinedOn: dateSchema,
  goals: z.array(z.string().trim().min(1).max(100)).max(5),
});

export const childPatchRequestSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  honorific: honorificSchema.optional(),
  gradeCode: gradeCodeSchema.optional(),
  joinedOn: dateSchema.optional(),
  goals: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
});

export const childImportRequestSchema = z.object({
  code: z.string().min(8).max(9),
});

export const assessmentCreateRequestSchema = z.object({
  unlockExt: z.boolean(),
});

export const assessmentPatchRequestSchema = z.object({
  assessedOn: dateSchema.optional(),
  unlockExt: z.boolean().optional(),
  data: assessmentDataPatchSchema,
  updatedAt: z.string().datetime(),
});

export const assessmentCompleteRequestSchema = z.object({
  updatedAt: z.string().datetime().optional(),
});

export type AssessmentData = z.infer<typeof assessmentDataDraftSchema>;
export type AssessmentDataPatch = z.infer<typeof assessmentDataPatchSchema>;
export type CompletedAssessmentData = z.infer<typeof assessmentDataCompletedSchema>;
export type Honorific = z.infer<typeof honorificSchema>;
export type ChildCreateRequest = z.infer<typeof childCreateRequestSchema>;
export type ChildPatchRequest = z.infer<typeof childPatchRequestSchema>;
export type ChildImportRequest = z.infer<typeof childImportRequestSchema>;
export type AssessmentCreateRequest = z.infer<typeof assessmentCreateRequestSchema>;
export type AssessmentPatchRequest = z.infer<typeof assessmentPatchRequestSchema>;
