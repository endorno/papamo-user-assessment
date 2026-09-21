import { z } from 'zod';

import { PPI_QUESTIONS } from '../master/ppi';
import {
  EXERCISES,
  LEVEL_NOT_POSSIBLE,
  MAX_EXERCISE_LEVEL,
  type ExerciseKey,
} from '../master/exercises';
import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  ENVIRONMENT_SUPPORT_ITEMS,
} from '../master/engagement';
import {
  COPM_MAX,
  COPM_SCORE_DEFAULT,
  COPM_SCORE_MAX,
  COPM_SCORE_MIN,
  WANT_ITEMS,
  WANT_MAX,
} from '../master/goals';
import { ALL_TROUBLE_ITEMS } from '../master/troubles';
import { isValidDateString } from '../domain/date';

export const exerciseKeySchema = z.enum(
  EXERCISES.map((exercise) => exercise.key) as [ExerciseKey, ...ExerciseKey[]],
);
export const honorificSchema = z.enum(['kun', 'chan', 'san']);
// 敬称とは連動させない（女の子でも「くん」で呼ぶなど、呼び方は家庭ごとに違うため）。
export const genderSchema = z.enum(['boy', 'girl', 'unspecified']);
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

/**
 * 保存済みの到達値。-1 実施不可 / 0 未実施 / 1〜（種目ごとの上限）。
 * 種目が決まらない場面（一覧・レポートのレスポンス検証）はこちらで受ける。
 */
export const storedLevelSchema = z.number().int().min(LEVEL_NOT_POSSIBLE).max(MAX_EXERCISE_LEVEL);

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください。')
  .refine(isValidDateString, '存在する日付を入力してください。');
// -1 実施不可 / 0 未実施 / 1〜 到達Lv。上限は種目ごとに持つ（現在はすべて30）。
const levelSchemaFor = (maxLevel: number) => z.number().int().min(LEVEL_NOT_POSSIBLE).max(maxLevel);
const ppiValueSchema = z.number().int().min(0).max(5);
const lvFields = Object.fromEntries(EXERCISES.map((exercise) => [
  exercise.key,
  levelSchemaFor(exercise.maxLevel).optional(),
]));
const ppiFields = Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema.optional()]));

// 見えた動作（選択）。種目ごとに固定の選択肢から複数選ぶ。
const observationFields = Object.fromEntries(EXERCISES.map((exercise) => [
  exercise.key,
  z.array(z.enum(exercise.observations.map((observation) => observation.text) as [string, ...string[]]))
    .max(exercise.observations.length)
    .optional(),
]));
const observationsSchema = z.object(observationFields).strict();
// 見えた動作（自由記入）。選択肢に当てはまらない動きだけを書く。
const observationNotesSchema = z.object(
  Object.fromEntries(EXERCISES.map((exercise) => [exercise.key, z.string().max(500).optional()])),
).strict();

const engagementSchema = z.object(
  Object.fromEntries(ENGAGEMENT_AXES.map(({ key }) => [
    key,
    z.number().int().min(0).max(ENGAGEMENT_LEVEL_COUNT - 1).optional(),
  ])),
).strict();
const envSupportSchema = z.array(
  z.enum(ENVIRONMENT_SUPPORT_ITEMS.map((item) => item.key) as [string, ...string[]]),
).max(ENVIRONMENT_SUPPORT_ITEMS.length);

const wantSchema = z.array(
  z.enum(WANT_ITEMS.map((item) => item.id) as [string, ...string[]]),
).max(WANT_MAX);

const copmScoreSchema = z.number().int().min(COPM_SCORE_MIN).max(COPM_SCORE_MAX);
const copmGoalSchema = z.object({
  text: z.string().trim().min(1).max(100),
  memo: z.string().max(300).default(''),
  performance: copmScoreSchema,
  satisfaction: copmScoreSchema,
  importance: copmScoreSchema,
});
const copmSchema = z.array(copmGoalSchema).max(COPM_MAX);

const troubleSchema = z.enum(ALL_TROUBLE_ITEMS as [string, ...string[]]);

export const assessmentDataDraftSchema = z.object({
  lv: z.object(lvFields).strict().default({}),
  observations: observationsSchema.default({}),
  observationNotes: observationNotesSchema.default({}),
  engagement: engagementSchema.default({}),
  envSupports: envSupportSchema.default([]),
  troubles: z.array(troubleSchema).default([]),
  wants: wantSchema.default([]),
  copm: copmSchema.default([]),
  ppi: z.object(ppiFields).strict().default({}),
  ppiNote: z.string().default(''),
  memo: z.string().default(''),
  goals: z.array(z.string()).default([]),
}).strict();

export const assessmentDataPatchSchema = z.object({
  lv: z.object(lvFields).strict().optional(),
  observations: observationsSchema.optional(),
  observationNotes: observationNotesSchema.optional(),
  engagement: engagementSchema.optional(),
  envSupports: envSupportSchema.optional(),
  troubles: z.array(troubleSchema).optional(),
  wants: wantSchema.optional(),
  copm: copmSchema.optional(),
  ppi: z.object(ppiFields).strict().optional(),
  ppiNote: z.string().optional(),
  memo: z.string().optional(),
}).strict();

export const assessmentDataCompletedSchema = z.object({
  lv: z.object(lvFields).strict(),
  observations: observationsSchema,
  observationNotes: observationNotesSchema,
  engagement: engagementSchema,
  envSupports: envSupportSchema,
  troubles: z.array(troubleSchema),
  wants: wantSchema,
  copm: copmSchema,
  ppi: z.object(Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiValueSchema]))).strict(),
  ppiNote: z.string(),
  memo: z.string(),
  goals: z.array(z.string()),
}).strict();

export const childCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  honorific: honorificSchema,
  gender: genderSchema.default('unspecified'),
  gradeCode: gradeCodeSchema,
  joinedOn: dateSchema,
  goals: z.array(z.string().trim().min(1).max(100)).max(COPM_MAX).default([]),
});

export const childPatchRequestSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  honorific: honorificSchema.optional(),
  gender: genderSchema.optional(),
  gradeCode: gradeCodeSchema.optional(),
  joinedOn: dateSchema.optional(),
  goals: z.array(z.string().trim().min(1).max(100)).max(COPM_MAX).optional(),
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
    lv: z.record(exerciseKeySchema, storedLevelSchema.optional()),
    troubles: z.array(z.string()),
    ppi: z.object(ppiFields),
    engagement: engagementSchema,
    copm: copmSchema,
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

/**
 * 保存済みの `assessments.data` を現在の形に寄せてから検証する。
 * マスタを design-mock-v2 にそろえた際に項目が入れ替わったため、
 * 旧版で保存された回もコーチが開いて続きを入力できるようにする。
 */
export function migrateAssessmentData(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const data: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  // 旧「つまずき」と旧「3か月の運動計画」は項目ごと無くなったため引き継がない。
  delete data.errs;
  delete data.plan;
  data.observations ??= {};
  data.observationNotes ??= {};
  data.engagement ??= {};
  data.envSupports ??= [];
  data.wants ??= [];
  if (!Array.isArray(data.copm)) {
    // 旧版は目標を children.goals だけで持っていた。完了時のスナップショットから行を起こす。
    const goals = Array.isArray(data.goals)
      ? data.goals.filter((goal): goal is string => typeof goal === 'string')
      : [];
    data.copm = goals.slice(0, COPM_MAX).map((text) => ({
      text,
      memo: '',
      performance: COPM_SCORE_DEFAULT,
      satisfaction: COPM_SCORE_DEFAULT,
      importance: COPM_SCORE_DEFAULT,
    }));
  }
  return data;
}

export function parseStoredAssessmentData(value: unknown): AssessmentData {
  return assessmentDataDraftSchema.parse(migrateAssessmentData(value));
}

export function parseStoredCompletedData(value: unknown): CompletedAssessmentData {
  return assessmentDataCompletedSchema.parse(migrateAssessmentData(value));
}

export type AssessmentData = z.infer<typeof assessmentDataDraftSchema>;
export type AssessmentDataPatch = z.infer<typeof assessmentDataPatchSchema>;
export type CompletedAssessmentData = z.infer<typeof assessmentDataCompletedSchema>;
export type CopmGoal = z.infer<typeof copmGoalSchema>;
export type Honorific = z.infer<typeof honorificSchema>;
export type Gender = z.infer<typeof genderSchema>;
export type ChildCreateRequest = z.infer<typeof childCreateRequestSchema>;
export type ChildPatchRequest = z.infer<typeof childPatchRequestSchema>;
export type ChildImportRequest = z.infer<typeof childImportRequestSchema>;
export type AssessmentCreateRequest = z.infer<typeof assessmentCreateRequestSchema>;
export type AssessmentPatchRequest = z.infer<typeof assessmentPatchRequestSchema>;
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;
export type AssessmentCreated = z.infer<typeof assessmentCreatedSchema>;
