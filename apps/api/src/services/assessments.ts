import { and, desc, eq, gt, lt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import {
  assessmentDataCompletedSchema,
  assessmentDataDraftSchema,
  CORE_EXERCISE_KEYS,
  EXT_EXERCISE_KEYS,
  gradeAt,
  MASTER_VERSION,
  PPI_QUESTIONS,
  PLANS,
  TROUBLE_CATEGORIES,
  todayInJst,
  type AssessmentData,
  type AssessmentDataPatch,
  type CompletedAssessmentData,
  type ExerciseKey,
} from '@papamo/shared';

import { assessments, childCoaches, children, reports } from '../db/schema';
import type { CoachRecord, Env } from '../env';
import { generateReport } from './report';

export type AssessmentStatus = 'draft' | 'done';

export class AssessmentServiceError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict' | 'validation',
    message: string,
  ) {
    super(message);
    this.name = 'AssessmentServiceError';
  }
}

function dbFor(env: Env) {
  return drizzle(env.DB, { schema: { assessments, childCoaches, children, reports } });
}

function parseData(value: string): AssessmentData {
  const parsed = JSON.parse(value) as unknown;
  return assessmentDataDraftSchema.parse(parsed);
}

function parseCompletedData(value: string): CompletedAssessmentData {
  return assessmentDataCompletedSchema.parse(JSON.parse(value));
}

async function membership(env: Env, childId: string, coachId: string) {
  return dbFor(env).select({ role: childCoaches.role }).from(childCoaches).where(
    and(eq(childCoaches.childId, childId), eq(childCoaches.coachId, coachId)),
  ).get();
}

async function childOrThrow(env: Env, childId: string) {
  const child = await dbFor(env).select().from(children).where(eq(children.id, childId)).get();
  if (!child) throw new AssessmentServiceError('not_found', 'お子さまが見つかりません。');
  return child;
}

async function assessmentOrThrow(env: Env, assessmentId: string) {
  const assessment = await dbFor(env).select().from(assessments).where(eq(assessments.id, assessmentId)).get();
  if (!assessment) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  return assessment;
}

async function ensureWritable(env: Env, childId: string, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  if (assessment.childId !== childId) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  const linked = await membership(env, childId, coachId);
  if (!linked) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  const child = await childOrThrow(env, childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  const later = await dbFor(env).select({ id: assessments.id }).from(assessments).where(
    and(eq(assessments.childId, childId), gt(assessments.seqNo, assessment.seqNo)),
  ).limit(1).get();
  if (later) throw new AssessmentServiceError('conflict', '次のアセスメントがあるため、この回は編集できません。');
  return { assessment, child };
}

function initialData(previous: CompletedAssessmentData | null, ageGroup: 'pre' | 'sch'): AssessmentData {
  const validTroubles = new Set<string>(TROUBLE_CATEGORIES[ageGroup].flatMap((category) => category.items));
  return {
    lv: {},
    errs: {},
    troubles: previous?.troubles.filter((trouble) => validTroubles.has(trouble)) ?? [],
    ppi: {},
    ppiNote: '',
    plan: previous?.plan ?? (ageGroup === 'pre' ? 'pre' : 'base'),
    memo: '',
    goals: [],
  };
}

export async function createAssessment(env: Env, childId: string, coachId: string, unlockExt: boolean) {
  const child = await childOrThrow(env, childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  if (!(await membership(env, childId, coachId))) throw new AssessmentServiceError('not_found', 'お子さまが見つかりません。');
  const db = dbFor(env);
  const draft = await db.select({ id: assessments.id }).from(assessments).where(
    and(eq(assessments.childId, childId), eq(assessments.status, 'draft')),
  ).get();
  if (draft) throw new AssessmentServiceError('conflict', '入力中のアセスメントがすでにあります。');
  const previous = await db.select().from(assessments).where(
    and(eq(assessments.childId, childId), eq(assessments.status, 'done')),
  ).orderBy(desc(assessments.seqNo)).limit(1).get();
  const max = await db.select({ seqNo: assessments.seqNo }).from(assessments).where(eq(assessments.childId, childId)).orderBy(desc(assessments.seqNo)).limit(1).get();
  const today = todayInJst();
  const now = new Date().toISOString();
  const row = {
    id: ulid(),
    childId,
    seqNo: (max?.seqNo ?? 0) + 1,
    status: 'draft',
    assessedOn: todayInJst(),
    coachId,
    unlockExt: child.extUnlocked || unlockExt,
    prevAssessmentId: previous?.id ?? null,
    masterVersion: MASTER_VERSION,
    data: JSON.stringify(initialData(
      previous ? parseCompletedData(previous.data) : null,
      gradeAt(
        { gradeCode: child.gradeCode as Parameters<typeof gradeAt>[0]['gradeCode'], gradeBaseYear: child.gradeBaseYear },
        today,
      ).ageGroup,
    )),
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  await db.insert(assessments).values(row).run();
  return row;
}

export async function getAssessment(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const linked = await membership(env, assessment.childId, coachId);
  if (!linked) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  const child = await childOrThrow(env, assessment.childId);
  const later = await dbFor(env).select({ id: assessments.id }).from(assessments).where(
    and(eq(assessments.childId, assessment.childId), gt(assessments.seqNo, assessment.seqNo)),
  ).limit(1).get();
  const previous = assessment.prevAssessmentId
    ? await dbFor(env).select({ id: assessments.id, seqNo: assessments.seqNo, assessedOn: assessments.assessedOn, status: assessments.status }).from(assessments).where(eq(assessments.id, assessment.prevAssessmentId)).get()
    : null;
  return {
    id: assessment.id,
    childId: assessment.childId,
    seqNo: assessment.seqNo,
    status: assessment.status as AssessmentStatus,
    assessedOn: assessment.assessedOn,
    coachId: assessment.coachId,
    unlockExt: assessment.unlockExt,
    prevAssessmentId: assessment.prevAssessmentId,
    masterVersion: assessment.masterVersion,
    data: parseData(assessment.data),
    createdAt: assessment.createdAt,
    updatedAt: assessment.updatedAt,
    completedAt: assessment.completedAt,
    readOnly: Boolean(child.archivedAt || later),
    previous,
    child: {
      id: child.id,
      name: child.name,
      archivedAt: child.archivedAt,
      ageGroup: gradeAt(
        { gradeCode: child.gradeCode as Parameters<typeof gradeAt>[0]['gradeCode'], gradeBaseYear: child.gradeBaseYear },
        assessment.assessedOn,
      ).ageGroup,
    },
  };
}

export async function patchAssessment(
  env: Env,
  assessmentId: string,
  coachId: string,
  input: { assessedOn?: string; unlockExt?: boolean; data: AssessmentDataPatch; updatedAt: string },
) {
  const current = await assessmentOrThrow(env, assessmentId);
  const { assessment, child } = await ensureWritable(env, current.childId, assessmentId, coachId);
  if (assessment.updatedAt !== input.updatedAt) throw new AssessmentServiceError('conflict', '他のコーチが更新しました。読み込み直してください。');
  const draftData = assessmentDataDraftSchema.parse(input.data);
  const nextUnlock = child.extUnlocked || input.unlockExt || assessment.unlockExt;
  const updatedAt = new Date().toISOString();
  await dbFor(env).update(assessments).set({
    assessedOn: input.assessedOn ?? assessment.assessedOn,
    unlockExt: nextUnlock,
    data: JSON.stringify({ ...draftData, goals: [] }),
    updatedAt,
  }).where(eq(assessments.id, assessmentId)).run();
  return getAssessment(env, assessmentId, coachId);
}

export async function deleteAssessment(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  if (!(await membership(env, assessment.childId, coachId))) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  const child = await childOrThrow(env, assessment.childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  if (assessment.status !== 'draft') throw new AssessmentServiceError('conflict', '完了済みのアセスメントは削除できません。');
  await dbFor(env).delete(assessments).where(eq(assessments.id, assessmentId)).run();
}

function assertCompletable(data: CompletedAssessmentData, unlockExt: boolean, ageGroup: 'pre' | 'sch') {
  const requiredKeys: ExerciseKey[] = unlockExt ? [...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS] : [...CORE_EXERCISE_KEYS];
  const missing = requiredKeys.filter((key) => data.lv[key] === undefined);
  if (missing.length) throw new AssessmentServiceError('validation', '全種目のLvを確定してください。');
  if (!PPI_QUESTIONS.every(({ key }) => data.ppi[key] !== undefined)) throw new AssessmentServiceError('validation', 'ご家庭の負担度を5問すべて回答してください。');
  if (!data.plan || !(data.plan in PLANS)) throw new AssessmentServiceError('validation', '3か月の運動計画を選択してください。');
  const validTroubles = new Set<string>(TROUBLE_CATEGORIES[ageGroup].flatMap((category) => category.items));
  if (!data.troubles.every((trouble) => validTroubles.has(trouble))) throw new AssessmentServiceError('validation', '困りごとの選択内容を確認してください。');
}

export async function completeAssessment(env: Env, assessmentId: string, coach: CoachRecord, expectedUpdatedAt?: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const linked = await membership(env, assessment.childId, coach.id);
  if (!linked) throw new AssessmentServiceError('not_found', 'アセスメントが見つかりません。');
  const child = await childOrThrow(env, assessment.childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  const later = await dbFor(env).select({ id: assessments.id }).from(assessments).where(and(eq(assessments.childId, child.id), gt(assessments.seqNo, assessment.seqNo))).limit(1).get();
  if (later) throw new AssessmentServiceError('conflict', '次のアセスメントがあるため、この回は完了できません。');
  if (expectedUpdatedAt && expectedUpdatedAt !== assessment.updatedAt) throw new AssessmentServiceError('conflict', '他のコーチが更新しました。読み込み直してください。');
  const draftData = assessmentDataDraftSchema.safeParse(JSON.parse(assessment.data));
  if (!draftData.success) throw new AssessmentServiceError('validation', '入力内容を確認してください。');
  const unlockExt = child.extUnlocked || assessment.unlockExt;
  const completedData = { ...draftData.data, goals: JSON.parse(child.goals) as string[] };
  const data = assessmentDataCompletedSchema.safeParse(completedData);
  if (!data.success) throw new AssessmentServiceError('validation', '入力内容を確認してください。');
  const ageGroup = gradeAt(
    { gradeCode: child.gradeCode as Parameters<typeof gradeAt>[0]['gradeCode'], gradeBaseYear: child.gradeBaseYear },
    assessment.assessedOn,
  ).ageGroup;
  assertCompletable(data.data, unlockExt, ageGroup);

  const previousRow = await dbFor(env).select().from(assessments).where(and(eq(assessments.childId, child.id), eq(assessments.status, 'done'), lt(assessments.seqNo, assessment.seqNo))).orderBy(desc(assessments.seqNo)).limit(1).get();
  const previous = previousRow ? { seqNo: previousRow.seqNo, assessedOn: previousRow.assessedOn, unlockExt: previousRow.unlockExt, data: parseCompletedData(previousRow.data) } : undefined;
  const generatedAt = new Date().toISOString();
  const report = await generateReport({ env, child, coach, assessment: { seqNo: assessment.seqNo, assessedOn: assessment.assessedOn, unlockExt, data: data.data }, previous, generatedAt });
  const now = new Date().toISOString();
  const db = dbFor(env);
  await db.batch([
    db.update(assessments).set({ status: 'done', coachId: coach.id, unlockExt, masterVersion: MASTER_VERSION, data: JSON.stringify(completedData), updatedAt: now, completedAt: now }).where(eq(assessments.id, assessmentId)),
    db.insert(reports).values({ id: ulid(), assessmentId, generator: report.generator, content: JSON.stringify(report), createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: reports.assessmentId, set: { generator: report.generator, content: JSON.stringify(report), updatedAt: now } }),
    ...(unlockExt && !child.extUnlocked ? [db.update(children).set({ extUnlocked: true, updatedAt: now }).where(eq(children.id, child.id))] : []),
  ]);
  return report;
}

export async function getReport(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  if (!(await membership(env, assessment.childId, coachId))) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  const report = await dbFor(env).select().from(reports).where(eq(reports.assessmentId, assessmentId)).get();
  if (!report) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  return JSON.parse(report.content) as unknown;
}
