import { z } from 'zod';

import { PPI_QUESTIONS, PPI_SCORE_MAX } from '../master/ppi';
import {
  EXERCISES,
  EXT_EXERCISE_KEYS,
  MAX_EXERCISE_LEVEL,
  MIN_EXERCISE_LEVEL,
  type ExerciseKey,
} from '../master/exercises';
import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  ENVIRONMENT_SUPPORT_ITEMS,
} from '../master/engagement';
import {
  COPM_MAX,
  COPM_SCORE_MAX,
  COPM_SCORE_MIN,
  WANT_ITEMS,
  WANT_MAX,
} from '../master/goals';
import { ALL_TROUBLE_ITEMS } from '../master/troubles';
import { isValidDateString, isValidMonthString } from '../domain/date';

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
 * 保存済みの到達値。0（Lv1 に取り組めなかった）〜 種目ごとの上限。
 * 種目が決まらない場面（一覧・レポートのレスポンス検証）はこちらで受ける。
 */
export const storedLevelSchema = z.number().int().min(MIN_EXERCISE_LEVEL).max(MAX_EXERCISE_LEVEL);

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式で入力してください。')
  .refine(isValidDateString, '存在する日付を入力してください。');
const monthSchema = z.string()
  .regex(/^\d{4}-\d{2}$/, '年月は YYYY-MM 形式で入力してください。')
  .refine(isValidMonthString, '存在する年月を入力してください。');
// Lv0〜 到達Lv。上限は種目ごとに持つ（現在はすべて30）。
const levelSchemaFor = (maxLevel: number) => z.number().int().min(MIN_EXERCISE_LEVEL).max(maxLevel);
export const ppiScoreSchema = z.number().int().min(0).max(PPI_SCORE_MAX);
const lvFields = Object.fromEntries(EXERCISES.map((exercise) => [
  exercise.key,
  levelSchemaFor(exercise.maxLevel).optional(),
]));
const ppiFields = Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiScoreSchema.optional()]));

/**
 * 自由記入欄の文字数上限。API の検証と入力欄の maxLength で同じ値を使う
 * （入力欄だけ上限なしにすると、超えた時点で自動保存が止まるため）。
 */
export const TEXT_LIMITS = {
  copmText: 100,
  copmMemo: 300,
  observationNote: 500,
  ppiNote: 200,
  memo: 2000,
} as const;

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
  Object.fromEntries(EXERCISES.map((exercise) => [exercise.key, z.string().max(TEXT_LIMITS.observationNote).optional()])),
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

export const copmScoreSchema = z.number().int().min(COPM_SCORE_MIN).max(COPM_SCORE_MAX);
// 下書きでは文言が空の行も保存する（「目標を追加」した直後の行で自動保存を止めないため）。
// 空のまま残っている行は、レポートを作るときに止める。
const copmGoalSchema = z.object({
  text: z.string().max(TEXT_LIMITS.copmText),
  memo: z.string().max(TEXT_LIMITS.copmMemo).default(''),
  performance: copmScoreSchema,
  satisfaction: copmScoreSchema,
  importance: copmScoreSchema,
});
const copmSchema = z.array(copmGoalSchema).max(COPM_MAX);
// レポートに載せる回は、文言の前後の空白を落として1文字以上を求める（前回との突き合わせは文言の一致で行うため）。
const completedCopmSchema = z.array(copmGoalSchema.extend({
  text: z.string().trim().min(1, '目標の文言を入力してください。').max(TEXT_LIMITS.copmText),
})).max(COPM_MAX);

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
  ppiNote: z.string().max(TEXT_LIMITS.ppiNote).default(''),
  memo: z.string().max(TEXT_LIMITS.memo).default(''),
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
  ppiNote: z.string().max(TEXT_LIMITS.ppiNote).optional(),
  memo: z.string().max(TEXT_LIMITS.memo).optional(),
}).strict();

export const assessmentDataCompletedSchema = z.object({
  lv: z.object(lvFields).strict(),
  observations: observationsSchema,
  observationNotes: observationNotesSchema,
  engagement: engagementSchema,
  envSupports: envSupportSchema,
  troubles: z.array(troubleSchema),
  wants: wantSchema,
  copm: completedCopmSchema,
  ppi: z.object(Object.fromEntries(PPI_QUESTIONS.map(({ key }) => [key, ppiScoreSchema]))).strict(),
  ppiNote: z.string().max(TEXT_LIMITS.ppiNote),
  memo: z.string().max(TEXT_LIMITS.memo),
}).strict();

export const childCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(30),
  honorific: honorificSchema,
  gender: genderSchema.default('unspecified'),
  gradeCode: gradeCodeSchema,
  joinedMonth: monthSchema,
});

export const childPatchRequestSchema = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  honorific: honorificSchema.optional(),
  gender: genderSchema.optional(),
  gradeCode: gradeCodeSchema.optional(),
  joinedMonth: monthSchema.optional(),
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

export const assessmentRevertRequestSchema = z.object({
  updatedAt: z.string().datetime(),
});

/** 1回分の入力（実施日・4・5種目目の開放・入力内容）。 */
export const assessmentInputSchema = z.object({
  assessedOn: dateSchema,
  unlockExt: z.boolean(),
  data: assessmentDataDraftSchema,
});

/**
 * レポートを作ったときの入力（reports.assessment_input）。
 * 完了後の編集はレポートを更新するまで反映しないため、前回との比較や子どもページの表示はこちらを正にする。
 */
export const reportedInputSchema = assessmentInputSchema.extend({
  data: assessmentDataCompletedSchema,
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
  /** 完了済みの回だけ。レポートを作ったときの入力で、いまの入力との差分表示と「作成時に戻す」に使う。 */
  reported: assessmentInputSchema.nullable(),
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
 * 4・5種目目の開放を取り消したときに残る入力を落とす。
 * 完了検証と食い違わないよう、API の保存時と Web の表示で同じ整理をする。
 */
export function withoutExtExerciseInput(data: AssessmentData, unlockExt: boolean): AssessmentData {
  if (unlockExt) return data;
  const lv = { ...data.lv };
  const observations = { ...data.observations };
  const observationNotes = { ...data.observationNotes };
  for (const key of EXT_EXERCISE_KEYS) {
    delete lv[key];
    delete observations[key];
    delete observationNotes[key];
  }
  return { ...data, lv, observations, observationNotes };
}

export function parseStoredAssessmentData(value: unknown): AssessmentData {
  return assessmentDataDraftSchema.parse(value);
}

export function parseStoredCompletedData(value: unknown): CompletedAssessmentData {
  return assessmentDataCompletedSchema.parse(value);
}

export type AssessmentData = z.infer<typeof assessmentDataDraftSchema>;
export type CompletedAssessmentData = z.infer<typeof assessmentDataCompletedSchema>;
export type CopmGoal = z.infer<typeof copmGoalSchema>;
export type Honorific = z.infer<typeof honorificSchema>;
export type Gender = z.infer<typeof genderSchema>;
export type ChildCreateRequest = z.infer<typeof childCreateRequestSchema>;
export type ChildPatchRequest = z.infer<typeof childPatchRequestSchema>;
export type AssessmentPatchRequest = z.infer<typeof assessmentPatchRequestSchema>;
export type AssessmentDetail = z.infer<typeof assessmentDetailSchema>;
export type AssessmentInput = z.infer<typeof assessmentInputSchema>;
export type ReportedInput = z.infer<typeof reportedInputSchema>;
