import { z } from 'zod';

import { PPI_QUESTIONS } from '../master/ppi';
import { PLANS, type PlanKey } from '../master/plans';
import { EXERCISES, type ExerciseKey } from '../master/exercises';
import { TROUBLE_CATEGORIES } from '../master/troubles';
import { isValidDateString } from '../domain/date';

export const exerciseKeySchema = z.enum(
  EXERCISES.map((exercise) => exercise.key) as [ExerciseKey, ...ExerciseKey[]],
);
export const planKeySchema = z.enum(
  Object.keys(PLANS) as [PlanKey, ...PlanKey[]],
);
export const honorificSchema = z.enum(['kun', 'chan', 'san', 'none']);
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

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください。')
  .refine(isValidDateString, '存在する日付を入力してください。');
const levelSchema = z.number().int().min(0).max(20);
const ppiValueSchema = z.number().int().min(0).max(5);
const lvFields = Object.fromEntries(EXERCISES.map((exercise) => [exercise.key, levelSchema.optional()]));
const ppiFields = Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema.optional()]));
const errorFields = Object.fromEntries(EXERCISES.map((exercise) => [
  exercise.key,
  z.array(z.enum([...exercise.errors] as [string, ...string[]])).max(exercise.errors.length).optional(),
]));
const assessmentErrorsSchema = z.object(errorFields).strict();
const troubleItems = [...new Set(
  Object.values(TROUBLE_CATEGORIES).flatMap((categories) => (
    categories.flatMap((category) => category.items)
  )),
)] as [string, ...string[]];
const troubleSchema = z.enum(troubleItems);

export const assessmentDataDraftSchema = z.object({
  lv: z.object(lvFields).strict().default({}),
  errs: assessmentErrorsSchema.default({}),
  troubles: z.array(troubleSchema).default([]),
  ppi: z.object(ppiFields).strict().default({}),
  ppiNote: z.string().default(''),
  plan: planKeySchema.nullable().default(null),
  memo: z.string().default(''),
  goals: z.array(z.string()).default([]),
}).strict();

export const assessmentDataPatchSchema = z.object({
  lv: z.object(lvFields).strict().optional(),
  errs: assessmentErrorsSchema.optional(),
  troubles: z.array(troubleSchema).optional(),
  ppi: z.object(ppiFields).strict().optional(),
  ppiNote: z.string().optional(),
  plan: planKeySchema.nullable().optional(),
  memo: z.string().optional(),
}).strict();

export const assessmentDataCompletedSchema = z.object({
  lv: z.object(lvFields).strict(),
  errs: assessmentErrorsSchema,
  troubles: z.array(troubleSchema),
  ppi: z.object(Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema]))).strict(),
  ppiNote: z.string(),
  plan: planKeySchema,
  memo: z.string(),
  goals: z.array(z.string()),
}).strict();

export const childCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  honorific: honorificSchema,
  gradeCode: gradeCodeSchema,
  joinedOn: dateSchema,
  goals: z.array(z.string().trim().min(1).max(100)).max(5).default([]),
});

export const childPatchRequestSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  honorific: honorificSchema.optional(),
  gradeCode: gradeCodeSchema.optional(),
  joinedOn: dateSchema.optional(),
  goals: z.array(z.string().trim().min(1).max(100)).max(5).optional(),
});

export const childImportRequestSchema = z.object({
  code: z.string().trim().regex(/^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/i),
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

export const assessmentDetailSchema = z.object({
  id: z.string(),
  childId: z.string(),
  seqNo: z.number().int().positive(),
  status: z.enum(['draft', 'done']),
  assessedOn: dateSchema,
  coachId: z.string(),
  unlockExt: z.boolean(),
  prevAssessmentId: z.string().nullable(),
  masterVersion: z.string(),
  data: assessmentDataDraftSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  readOnly: z.boolean(),
  previous: z.object({
    id: z.string(),
    seqNo: z.number().int().positive(),
    assessedOn: dateSchema,
    status: z.literal('done'),
    lv: z.record(exerciseKeySchema, levelSchema.optional()),
    troubles: z.array(z.string()),
    ppi: z.object(ppiFields),
  }).nullable(),
  child: z.object({
    id: z.string(),
    name: z.string(),
    honorific: honorificSchema,
    archivedAt: z.string().datetime().nullable(),
    ageGroup: z.enum(['pre', 'sch']),
    extUnlocked: z.boolean(),
    goals: z.array(z.string()),
  }),
});

export const assessmentResponseSchema = z.object({
  assessment: assessmentDetailSchema,
});

export const assessmentCreatedSchema = z.object({
  id: z.string(),
  childId: z.string(),
  seqNo: z.number().int().positive(),
  status: z.literal('draft'),
  assessedOn: dateSchema,
  unlockExt: z.boolean(),
  updatedAt: z.string().datetime(),
});

export const assessmentCreateResponseSchema = z.object({
  assessment: assessmentCreatedSchema,
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
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;
export type AssessmentCreated = z.infer<typeof assessmentCreatedSchema>;
