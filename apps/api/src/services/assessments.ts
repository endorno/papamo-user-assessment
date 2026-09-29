import { and, desc, eq, exists, gt, isNull, lt, notExists, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  activeExerciseKeys,
  assessmentDataCompletedSchema,
  assessmentDataDraftSchema,
  parseStoredAssessmentData,
  parseStoredCompletedData,
  withoutExtExerciseInput,
  MASTER_VERSION,
  PPI_QUESTIONS,
  reportContentSchema,
  troubleItemsOf,
  todayInJst,
  type AssessmentData,
  type AssessmentPatchRequest,
  type CompletedAssessmentData,
  type Honorific,
} from '@papamo/shared';

import { dbFor, type Db } from '../db/client';
import { assessments, childCoaches, children, coaches, reports } from '../db/schema';
import { isUniqueConstraintError } from '../db/errors';
import { gradeOf } from './child-row';
import type { CoachRecord, Env } from '../env';
import { generateReport } from './report';

export type AssessmentStatus = 'draft' | 'done';

type AssessmentErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'validation';

const ERROR_STATUS: Record<AssessmentErrorCode, 400 | 403 | 404 | 409> = {
  not_found: 404,
  forbidden: 403,
  validation: 400,
  conflict: 409,
};

export class AssessmentServiceError extends Error {
  constructor(
    readonly code: AssessmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssessmentServiceError';
  }

  get status() {
    return ERROR_STATUS[this.code];
  }
}

function parseData(value: string): AssessmentData {
  return parseStoredAssessmentData(JSON.parse(value));
}

function parseCompletedData(value: string): CompletedAssessmentData {
  return parseStoredCompletedData(JSON.parse(value));
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

async function ensureWritable(
  env: Env,
  assessment: typeof assessments.$inferSelect,
  coachId: string,
) {
  const linked = await membership(env, assessment.childId, coachId);
  if (!linked) throw new AssessmentServiceError('forbidden', 'このアセスメントを操作する権限がありません。');
  const child = await childOrThrow(env, assessment.childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  const later = await dbFor(env).select({ id: assessments.id }).from(assessments).where(
    and(eq(assessments.childId, assessment.childId), gt(assessments.seqNo, assessment.seqNo)),
  ).limit(1).get();
  if (later) throw new AssessmentServiceError('conflict', '次のアセスメントがあるため、この回は編集できません。');
  return child;
}

function nextUpdatedAt(previous: string): string {
  const previousTime = Date.parse(previous);
  const minimum = Number.isFinite(previousTime) ? previousTime + 1 : 0;
  return new Date(Math.max(Date.now(), minimum)).toISOString();
}

function concurrentUpdateError() {
  return new AssessmentServiceError('conflict', '他のコーチが更新しました。読み込み直してください。');
}

function affectedRows(result: { meta: { changes?: number } }): number {
  return result.meta.changes ?? 0;
}

function writableMutationCondition(
  db: Db,
  assessment: typeof assessments.$inferSelect,
  coachId: string,
) {
  return and(
    eq(assessments.id, assessment.id),
    eq(assessments.revision, assessment.revision),
    eq(assessments.mutationId, assessment.mutationId),
    exists(
      db.select({ value: sql`1` }).from(childCoaches).where(and(
        eq(childCoaches.childId, assessment.childId),
        eq(childCoaches.coachId, coachId),
      )),
    ),
    exists(
      db.select({ value: sql`1` }).from(children).where(and(
        eq(children.id, assessment.childId),
        isNull(children.archivedAt),
      )),
    ),
    notExists(
      db.select({ value: sql`1` }).from(assessments).where(and(
        eq(assessments.childId, assessment.childId),
        gt(assessments.seqNo, assessment.seqNo),
      )),
    ),
  );
}

// 前回の回から引き継ぐのは「聞き直す前の初期値」だけ。Lv・PPI・所見は毎回まっさらにする。
function initialData(
  previous: CompletedAssessmentData | null,
  ageGroup: 'pre' | 'sch',
): AssessmentData {
  const validTroubles = new Set(troubleItemsOf(ageGroup));
  // 目標は前回の COPM を引き継ぐ。初回は空欄から始める。
  const copm = previous?.copm.map((goal) => ({ ...goal })) ?? [];
  return {
    lv: {},
    observations: {},
    observationNotes: {},
    engagement: {},
    envSupports: [],
    troubles: previous?.troubles.filter((trouble) => validTroubles.has(trouble)) ?? [],
    wants: previous?.wants ? [...previous.wants] : [],
    copm,
    ppi: {},
    ppiNote: '',
    memo: '',
  };
}

export async function createAssessment(env: Env, childId: string, coachId: string, unlockExt: boolean) {
  const child = await childOrThrow(env, childId);
  if (child.archivedAt) throw new AssessmentServiceError('conflict', 'アーカイブ中のお子さまは編集できません。');
  if (!(await membership(env, childId, coachId))) throw new AssessmentServiceError('forbidden', 'このお子さまを操作する権限がありません。');
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
  const id = ulid();
  const row = {
    id,
    childId,
    seqNo: (max?.seqNo ?? 0) + 1,
    status: 'draft',
    assessedOn: today,
    coachId,
    unlockExt: child.extUnlocked || unlockExt,
    prevAssessmentId: previous?.id ?? null,
    masterVersion: MASTER_VERSION,
    data: JSON.stringify(initialData(
      previous ? parseCompletedData(previous.data) : null,
      gradeOf(child, today).ageGroup,
    )),
    revision: 1,
    mutationId: id,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  try {
    await db.insert(assessments).values(row).run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AssessmentServiceError('conflict', '入力中のアセスメントがすでにあります。');
    }
    throw error;
  }
  return row;
}

export async function getAssessment(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const linked = await membership(env, assessment.childId, coachId);
  if (!linked) throw new AssessmentServiceError('forbidden', 'このアセスメントを閲覧する権限がありません。');
  const child = await childOrThrow(env, assessment.childId);
  const later = await dbFor(env).select({ id: assessments.id }).from(assessments).where(
    and(eq(assessments.childId, assessment.childId), gt(assessments.seqNo, assessment.seqNo)),
  ).limit(1).get();
  const previous = assessment.prevAssessmentId
    ? await dbFor(env).select({ id: assessments.id, seqNo: assessments.seqNo, assessedOn: assessments.assessedOn, status: assessments.status, data: assessments.data }).from(assessments).where(eq(assessments.id, assessment.prevAssessmentId)).get()
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
    previous: previous
      ? (() => {
          const previousData = parseCompletedData(previous.data);
          return {
            id: previous.id,
            seqNo: previous.seqNo,
            assessedOn: previous.assessedOn,
            status: 'done' as const,
            lv: previousData.lv,
            troubles: previousData.troubles,
            ppi: previousData.ppi,
            engagement: previousData.engagement,
            copm: previousData.copm,
          };
        })()
      : null,
    child: {
      id: child.id,
      name: child.name,
      honorific: child.honorific as Honorific,
      archivedAt: child.archivedAt,
      extUnlocked: child.extUnlocked,
      ageGroup: gradeOf(child, assessment.assessedOn).ageGroup,
    },
  };
}

// 子ども単位で開放済みなら常に5種目。下書きの間だけコーチが開放を取り消せる。
function nextUnlockExt(
  child: typeof children.$inferSelect,
  assessment: typeof assessments.$inferSelect,
  requested: boolean | undefined,
): boolean {
  if (child.extUnlocked) return true;
  if (assessment.status === 'draft') return requested ?? assessment.unlockExt;
  return assessment.unlockExt || Boolean(requested);
}

export async function patchAssessment(
  env: Env,
  assessmentId: string,
  coachId: string,
  input: AssessmentPatchRequest,
) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const child = await ensureWritable(env, assessment, coachId);
  if (assessment.updatedAt !== input.updatedAt) throw concurrentUpdateError();
  const nextUnlock = nextUnlockExt(child, assessment, input.unlockExt);
  const draftData = withoutExtExerciseInput(
    assessmentDataDraftSchema.parse(input.data),
    nextUnlock,
  );
  const updatedAt = nextUpdatedAt(assessment.updatedAt);
  const mutationId = ulid();
  const db = dbFor(env);

  if (assessment.status === 'done') {
    const completedDataResult = assessmentDataCompletedSchema.safeParse(draftData);
    if (!completedDataResult.success) {
      throw new AssessmentServiceError('validation', '完了済みの記録に必要な入力をすべて残してください。');
    }
    const ageGroup = gradeOf(child, input.assessedOn ?? assessment.assessedOn).ageGroup;
    assertCompletable(completedDataResult.data, nextUnlock, ageGroup);
    const reportCoach = await coachOrThrow(env, assessment.coachId);
    const previous = await previousForReport(env, assessment);
    const report = await generateReport({
      env,
      child,
      coach: reportCoach,
      assessment: {
        seqNo: assessment.seqNo,
        assessedOn: input.assessedOn ?? assessment.assessedOn,
        unlockExt: nextUnlock,
        data: completedDataResult.data,
      },
      previous,
      generatedAt: updatedAt,
    });
    await persistCompletedAssessment({
      env,
      assessment,
      child,
      actingCoachId: coachId,
      reportCoachId: assessment.coachId,
      assessedOn: input.assessedOn ?? assessment.assessedOn,
      unlockExt: nextUnlock,
      data: completedDataResult.data,
      report,
      mutationId,
      updatedAt,
      completedAt: assessment.completedAt ?? updatedAt,
    });
    return getAssessment(env, assessmentId, coachId);
  }

  const result = await db.update(assessments).set({
    assessedOn: input.assessedOn ?? assessment.assessedOn,
    unlockExt: nextUnlock,
    data: JSON.stringify(draftData),
    revision: assessment.revision + 1,
    mutationId,
    updatedAt,
  }).where(writableMutationCondition(db, assessment, coachId)).run();
  if (affectedRows(result) !== 1) throw concurrentUpdateError();
  return getAssessment(env, assessmentId, coachId);
}

export async function deleteAssessment(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  await ensureWritable(env, assessment, coachId);
  if (assessment.status !== 'draft') throw new AssessmentServiceError('conflict', '完了済みのアセスメントは削除できません。');
  const db = dbFor(env);
  const result = await db.delete(assessments).where(and(
    writableMutationCondition(db, assessment, coachId),
    eq(assessments.status, 'draft'),
  )).run();
  if (affectedRows(result) !== 1) throw concurrentUpdateError();
}

// 完了用スキーマで弾く前に、コーチが直せる言葉で理由を返す。
function assertCompletable(data: AssessmentData, unlockExt: boolean, ageGroup: 'pre' | 'sch') {
  const missing = activeExerciseKeys(unlockExt).filter((key) => data.lv[key] === undefined);
  if (missing.length) throw new AssessmentServiceError('validation', '全種目のLvを確定してください。');
  if (!PPI_QUESTIONS.every(({ key }) => data.ppi[key] !== undefined)) throw new AssessmentServiceError('validation', 'ご家庭の負担度を5問すべて回答してください。');
  const validTroubles = new Set(troubleItemsOf(ageGroup));
  if (!data.troubles.every((trouble) => validTroubles.has(trouble))) throw new AssessmentServiceError('validation', '困りごとの選択内容を確認してください。');
  if (data.copm.some((goal) => !goal.text.trim())) throw new AssessmentServiceError('validation', '文言が空の目標があります。文言を入力するか、その目標を削除してください。');
}

async function coachOrThrow(env: Env, coachId: string): Promise<CoachRecord> {
  const coach = await dbFor(env).select().from(coaches).where(eq(coaches.id, coachId)).get();
  if (!coach) throw new Error(`レポート担当コーチが見つかりません: ${coachId}`);
  return {
    id: coach.id,
    email: coach.email,
    displayName: coach.displayName,
  };
}

async function previousForReport(
  env: Env,
  assessment: typeof assessments.$inferSelect,
) {
  const previousRow = await dbFor(env).select().from(assessments).where(and(
    eq(assessments.childId, assessment.childId),
    eq(assessments.status, 'done'),
    lt(assessments.seqNo, assessment.seqNo),
  )).orderBy(desc(assessments.seqNo)).limit(1).get();
  return previousRow
    ? {
        seqNo: previousRow.seqNo,
        assessedOn: previousRow.assessedOn,
        unlockExt: previousRow.unlockExt,
        data: parseCompletedData(previousRow.data),
      }
    : undefined;
}

function guardedReportUpsert(
  db: Db,
  input: {
    assessmentId: string;
    assessmentRevision: number;
    mutationId: string;
    generator: string;
    content: string;
    updatedAt: string;
  },
) {
  const reportId = ulid();
  const guardedReport = db.select({
    id: sql<string>`${reportId}`.as('id'),
    assessmentId: sql<string>`${input.assessmentId}`.as('assessment_id'),
    assessmentRevision: sql<number>`${input.assessmentRevision}`.as('assessment_revision'),
    generator: sql<string>`${input.generator}`.as('generator'),
    content: sql<string>`${input.content}`.as('content'),
    createdAt: sql<string>`${input.updatedAt}`.as('created_at'),
    updatedAt: sql<string>`${input.updatedAt}`.as('updated_at'),
  }).from(assessments).where(and(
    eq(assessments.id, input.assessmentId),
    eq(assessments.mutationId, input.mutationId),
  ));

  return db.insert(reports).select(guardedReport).onConflictDoUpdate({
    target: reports.assessmentId,
    set: {
      assessmentRevision: input.assessmentRevision,
      generator: input.generator,
      content: input.content,
      updatedAt: input.updatedAt,
    },
  });
}

async function persistCompletedAssessment(input: {
  env: Env;
  assessment: typeof assessments.$inferSelect;
  child: typeof children.$inferSelect;
  actingCoachId: string;
  reportCoachId: string;
  assessedOn: string;
  unlockExt: boolean;
  data: CompletedAssessmentData;
  report: Awaited<ReturnType<typeof generateReport>>;
  mutationId: string;
  updatedAt: string;
  completedAt: string;
}) {
  const db = dbFor(input.env);
  const nextRevision = input.assessment.revision + 1;
  const assessmentUpdate = db.update(assessments).set({
    status: 'done',
    assessedOn: input.assessedOn,
    coachId: input.reportCoachId,
    unlockExt: input.unlockExt,
    masterVersion: MASTER_VERSION,
    data: JSON.stringify(input.data),
    revision: nextRevision,
    mutationId: input.mutationId,
    updatedAt: input.updatedAt,
    completedAt: input.completedAt,
  }).where(writableMutationCondition(db, input.assessment, input.actingCoachId));
  const reportUpsert = guardedReportUpsert(db, {
    assessmentId: input.assessment.id,
    assessmentRevision: nextRevision,
    mutationId: input.mutationId,
    generator: input.report.generator,
    content: JSON.stringify(input.report),
    updatedAt: input.updatedAt,
  });
  // 4・5種目目の開放だけを子どもへ反映する。
  const childChanges = {
    ...(input.unlockExt && !input.child.extUnlocked ? { extUnlocked: true } : {}),
  };
  const childUpdate = db.update(children).set({
    ...childChanges,
    updatedAt: input.updatedAt,
  }).where(and(
    eq(children.id, input.child.id),
    exists(
      db.select({ value: sql`1` }).from(assessments).where(and(
        eq(assessments.id, input.assessment.id),
        eq(assessments.mutationId, input.mutationId),
      )),
    ),
  ));
  const results = await db.batch([
    assessmentUpdate,
    reportUpsert,
    ...(Object.keys(childChanges).length ? [childUpdate] : []),
  ]);
  if (affectedRows(results[0]) !== 1) throw concurrentUpdateError();
}

export async function completeAssessment(env: Env, assessmentId: string, coach: CoachRecord, expectedUpdatedAt?: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const child = await ensureWritable(env, assessment, coach.id);
  if (expectedUpdatedAt && expectedUpdatedAt !== assessment.updatedAt) throw concurrentUpdateError();
  const draftData = assessmentDataDraftSchema.safeParse(JSON.parse(assessment.data));
  if (!draftData.success) throw new AssessmentServiceError('validation', '入力内容を確認してください。');
  const unlockExt = child.extUnlocked || assessment.unlockExt;
  assertCompletable(draftData.data, unlockExt, gradeOf(child, assessment.assessedOn).ageGroup);
  const data = assessmentDataCompletedSchema.safeParse(draftData.data);
  if (!data.success) throw new AssessmentServiceError('validation', '入力内容を確認してください。');

  const previous = await previousForReport(env, assessment);
  const generatedAt = nextUpdatedAt(assessment.updatedAt);
  const report = await generateReport({ env, child, coach, assessment: { seqNo: assessment.seqNo, assessedOn: assessment.assessedOn, unlockExt, data: data.data }, previous, generatedAt });
  await persistCompletedAssessment({
    env,
    assessment,
    child,
    actingCoachId: coach.id,
    reportCoachId: coach.id,
    assessedOn: assessment.assessedOn,
    unlockExt,
    data: data.data,
    report,
    mutationId: ulid(),
    updatedAt: generatedAt,
    completedAt: assessment.completedAt ?? generatedAt,
  });
  return { report, childId: assessment.childId, assessmentId: assessment.id };
}

export async function getReport(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  if (!(await membership(env, assessment.childId, coachId))) throw new AssessmentServiceError('forbidden', 'このレポートを閲覧する権限がありません。');
  const report = await dbFor(env).select({
    content: reports.content,
    assessmentRevision: reports.assessmentRevision,
  }).from(reports).where(eq(reports.assessmentId, assessmentId)).get();
  if (!report) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  if (report.assessmentRevision !== assessment.revision) {
    throw new Error(`レポートとアセスメントの版が一致しません: ${assessmentId}`);
  }
  const stored = reportContentSchema.safeParse(JSON.parse(report.content));
  return {
    // 旧版の形で保存されたレポートは、同じ記録から読むたびに作り直して返す
    // （生成は決定的なので内容は変わらない）。保存し直すのは次の編集・完了のとき。
    report: stored.success ? stored.data : await regenerateStoredReport(env, assessment),
    childId: assessment.childId,
    assessmentId: assessment.id,
  };
}

/** 旧版の形で保存されたレポートを、同じ記録から作り直す（生成は決定的なので内容は変わらない）。 */
export async function regenerateStoredReport(env: Env, assessment: typeof assessments.$inferSelect) {
  const child = await childOrThrow(env, assessment.childId);
  const coach = await coachOrThrow(env, assessment.coachId);
  const previous = await previousForReport(env, assessment);
  return generateReport({
    env,
    child,
    coach,
    assessment: {
      seqNo: assessment.seqNo,
      assessedOn: assessment.assessedOn,
      unlockExt: assessment.unlockExt,
      data: parseCompletedData(assessment.data),
    },
    previous,
    generatedAt: assessment.updatedAt,
  });
}
