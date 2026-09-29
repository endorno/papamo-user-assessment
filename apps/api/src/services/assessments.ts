import { and, desc, eq, exists, gt, isNull, lt, notExists, sql } from 'drizzle-orm';
import { ulid } from 'ulid';
import {
  activeExerciseKeys,
  assessmentDataCompletedSchema,
  assessmentDataDraftSchema,
  changedAssessmentSections,
  parseStoredAssessmentData,
  parseStoredCompletedData,
  withoutExtExerciseInput,
  MASTER_VERSION,
  PPI_QUESTIONS,
  reportContentSchema,
  reportedInputSchema,
  troubleItemsOf,
  todayInJst,
  type AssessmentData,
  type AssessmentInput,
  type AssessmentPatchRequest,
  type CompletedAssessmentData,
  type Honorific,
  type ReportedInput,
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

type AssessmentRow = typeof assessments.$inferSelect;

/** レポートを作ったときの入力（reports.assessment_input）。無い・読めないときは null。 */
export function parseReportedInput(value: string | null | undefined): ReportedInput | null {
  if (!value) return null;
  try {
    const parsed = reportedInputSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** いま保存されている入力（完了後の未反映の編集を含む）。 */
export function currentInputOf(row: Pick<AssessmentRow, 'assessedOn' | 'unlockExt' | 'data'>): AssessmentInput {
  return { assessedOn: row.assessedOn, unlockExt: row.unlockExt, data: parseData(row.data) };
}

/**
 * 完了済みの回として前回比較やレポートに使う入力。
 * レポートへ反映した内容を正にし、完了後に編集してまだ反映していない内容は含めない。
 * レポートの入力が残っていない古い行だけ、いまの入力で代用する。
 */
function confirmedInputOf(row: AssessmentRow, reportInput: string | null | undefined): ReportedInput {
  return parseReportedInput(reportInput) ?? {
    assessedOn: row.assessedOn,
    unlockExt: row.unlockExt,
    data: parseCompletedData(row.data),
  };
}

/** 完了後に編集し、まだレポートへ反映していない変更があるか。 */
export function hasUnreportedChanges(
  row: Pick<AssessmentRow, 'status' | 'assessedOn' | 'unlockExt' | 'data'>,
  reportInput: string | null | undefined,
): boolean {
  if (row.status !== 'done') return false;
  const reported = parseReportedInput(reportInput);
  return reported ? changedAssessmentSections(reported, currentInputOf(row)).length > 0 : false;
}

async function reportInputOf(env: Env, assessmentId: string) {
  const report = await dbFor(env).select({ assessmentInput: reports.assessmentInput })
    .from(reports).where(eq(reports.assessmentId, assessmentId)).get();
  return report?.assessmentInput ?? null;
}

/** 直前の完了回（前回比較の相手）。レポートに反映した入力で返す。 */
async function previousCompleted(env: Env, childId: string, beforeSeqNo?: number) {
  const row = await dbFor(env)
    .select({ assessment: assessments, reportInput: reports.assessmentInput })
    .from(assessments)
    .leftJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(and(
      eq(assessments.childId, childId),
      eq(assessments.status, 'done'),
      ...(beforeSeqNo === undefined ? [] : [lt(assessments.seqNo, beforeSeqNo)]),
    ))
    .orderBy(desc(assessments.seqNo))
    .limit(1)
    .get();
  return row ?? null;
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
  const previous = await previousCompleted(env, childId);
  // 次の回を作ると前の回は編集できなくなる。未反映の変更が宙に浮かないよう、先に片付けてもらう。
  if (previous && hasUnreportedChanges(previous.assessment, previous.reportInput)) {
    throw new AssessmentServiceError(
      'conflict',
      `第${previous.assessment.seqNo}回の入力に、レポートへ反映していない変更があります。レポートを更新するか、レポート作成時の内容に戻してから始めてください。`,
    );
  }
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
    prevAssessmentId: previous?.assessment.id ?? null,
    masterVersion: MASTER_VERSION,
    data: JSON.stringify(initialData(
      previous ? confirmedInputOf(previous.assessment, previous.reportInput).data : null,
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
    ? await dbFor(env)
        .select({ assessment: assessments, reportInput: reports.assessmentInput })
        .from(assessments)
        .leftJoin(reports, eq(reports.assessmentId, assessments.id))
        .where(eq(assessments.id, assessment.prevAssessmentId))
        .get()
    : null;
  const reported = assessment.status === 'done'
    ? parseReportedInput(await reportInputOf(env, assessment.id))
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
    reported,
    previous: previous
      ? (() => {
          const previousInput = confirmedInputOf(previous.assessment, previous.reportInput);
          return {
            id: previous.assessment.id,
            seqNo: previous.assessment.seqNo,
            assessedOn: previousInput.assessedOn,
            status: 'done' as const,
            lv: previousInput.data.lv,
            troubles: previousInput.data.troubles,
            ppi: previousInput.data.ppi,
            engagement: previousInput.data.engagement,
            copm: previousInput.data.copm,
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
  assessment: AssessmentRow,
  requested: boolean | undefined,
): boolean {
  if (child.extUnlocked) return true;
  if (assessment.status === 'draft') return requested ?? assessment.unlockExt;
  return assessment.unlockExt || Boolean(requested);
}

/**
 * 自動保存。下書きも完了済みの回も、入力をそのまま記録する。
 * 完了済みの回でもレポートは作り直さない（反映は「レポートを更新」を押したときだけ）。
 */
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
  const data = withoutExtExerciseInput(
    assessmentDataDraftSchema.parse(input.data),
    nextUnlock,
  );
  await writeAssessmentInput(env, assessment, coachId, {
    assessedOn: input.assessedOn ?? assessment.assessedOn,
    unlockExt: nextUnlock,
    data,
  });
  return getAssessment(env, assessmentId, coachId);
}

/** 完了済みの回の入力を、レポートを作ったときの内容に戻す。 */
export async function revertAssessment(
  env: Env,
  assessmentId: string,
  coachId: string,
  expectedUpdatedAt: string,
) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  const child = await ensureWritable(env, assessment, coachId);
  if (assessment.status !== 'done') {
    throw new AssessmentServiceError('conflict', 'レポートを作る前の回には、戻す先がありません。');
  }
  if (assessment.updatedAt !== expectedUpdatedAt) throw concurrentUpdateError();
  const reported = parseReportedInput(await reportInputOf(env, assessment.id));
  if (!reported) {
    throw new AssessmentServiceError('conflict', 'レポート作成時の入力が残っていないため、戻せません。');
  }
  await writeAssessmentInput(env, assessment, coachId, {
    assessedOn: reported.assessedOn,
    unlockExt: child.extUnlocked || reported.unlockExt,
    data: reported.data,
  });
  return getAssessment(env, assessmentId, coachId);
}

async function writeAssessmentInput(
  env: Env,
  assessment: AssessmentRow,
  coachId: string,
  input: AssessmentInput,
) {
  const db = dbFor(env);
  const result = await db.update(assessments).set({
    assessedOn: input.assessedOn,
    unlockExt: input.unlockExt,
    data: JSON.stringify(input.data),
    revision: assessment.revision + 1,
    mutationId: ulid(),
    updatedAt: nextUpdatedAt(assessment.updatedAt),
  }).where(writableMutationCondition(db, assessment, coachId)).run();
  if (affectedRows(result) !== 1) throw concurrentUpdateError();
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

/** レポートの比較相手。前の回はレポートに反映した入力で比べる。 */
async function previousForReport(env: Env, assessment: AssessmentRow) {
  const previous = await previousCompleted(env, assessment.childId, assessment.seqNo);
  if (!previous) return undefined;
  return { seqNo: previous.assessment.seqNo, ...confirmedInputOf(previous.assessment, previous.reportInput) };
}

function guardedReportUpsert(
  db: Db,
  input: {
    assessmentId: string;
    assessmentRevision: number;
    mutationId: string;
    generator: string;
    content: string;
    assessmentInput: string;
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
    assessmentInput: sql<string>`${input.assessmentInput}`.as('assessment_input'),
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
      assessmentInput: input.assessmentInput,
      updatedAt: input.updatedAt,
    },
  });
}

/**
 * レポートを作る・更新する（「レポートを作る」「レポートを更新」ボタン）。
 * 押したコーチがレポートの担当になり、そのときの入力をレポートの入力として残す。
 */
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
  const reportedInput: ReportedInput = { assessedOn: assessment.assessedOn, unlockExt, data: data.data };
  const report = await generateReport({ env, child, coach, assessment: { seqNo: assessment.seqNo, ...reportedInput }, previous, generatedAt });

  const db = dbFor(env);
  const nextRevision = assessment.revision + 1;
  const mutationId = ulid();
  const assessmentUpdate = db.update(assessments).set({
    status: 'done',
    coachId: coach.id,
    unlockExt,
    masterVersion: MASTER_VERSION,
    // 完了用スキーマで整えた内容（目標の前後の空白を落とした形）を、いまの入力としても残す。
    data: JSON.stringify(data.data),
    revision: nextRevision,
    mutationId,
    updatedAt: generatedAt,
    completedAt: assessment.completedAt ?? generatedAt,
  }).where(writableMutationCondition(db, assessment, coach.id));
  const reportUpsert = guardedReportUpsert(db, {
    assessmentId: assessment.id,
    assessmentRevision: nextRevision,
    mutationId,
    generator: report.generator,
    content: JSON.stringify(report),
    assessmentInput: JSON.stringify(reportedInput),
    updatedAt: generatedAt,
  });
  // 4・5種目目の開放だけを子どもへ反映する。
  const childUpdate = db.update(children).set({
    extUnlocked: true,
    updatedAt: generatedAt,
  }).where(and(
    eq(children.id, child.id),
    exists(
      db.select({ value: sql`1` }).from(assessments).where(and(
        eq(assessments.id, assessment.id),
        eq(assessments.mutationId, mutationId),
      )),
    ),
  ));
  // D1 batch は1トランザクション。アセスメントの更新が競合で0件なら、レポートと子どもも書き換わらない。
  const results = await db.batch([
    assessmentUpdate,
    reportUpsert,
    ...(unlockExt && !child.extUnlocked ? [childUpdate] : []),
  ]);
  if (affectedRows(results[0]) !== 1) throw concurrentUpdateError();
  return { report, childId: assessment.childId, assessmentId: assessment.id, hasUnreportedChanges: false };
}

export async function getReport(env: Env, assessmentId: string, coachId: string) {
  const assessment = await assessmentOrThrow(env, assessmentId);
  if (!(await membership(env, assessment.childId, coachId))) throw new AssessmentServiceError('forbidden', 'このレポートを閲覧する権限がありません。');
  const report = await dbFor(env).select({
    content: reports.content,
    assessmentInput: reports.assessmentInput,
    updatedAt: reports.updatedAt,
  }).from(reports).where(eq(reports.assessmentId, assessmentId)).get();
  if (!report) throw new AssessmentServiceError('not_found', 'レポートが見つかりません。');
  const stored = reportContentSchema.safeParse(JSON.parse(report.content));
  return {
    // 旧版の形で保存されたレポートは、読むたびにレポート作成時の入力から作り直して返す。保存し直すのは次にレポートを更新したとき。
    report: stored.success ? stored.data : await regenerateStoredReport(env, assessment, report),
    childId: assessment.childId,
    assessmentId: assessment.id,
    hasUnreportedChanges: hasUnreportedChanges(assessment, report.assessmentInput),
  };
}

/**
 * 旧版の形で保存されたレポートを、レポート作成時の入力から作り直す。
 * 名前・学年・担当の表示名とマスタはいまの値を使うため、保存時の本文と同じになるとは限らない。
 */
export async function regenerateStoredReport(
  env: Env,
  assessment: AssessmentRow,
  report: { assessmentInput: string | null; updatedAt: string },
) {
  const child = await childOrThrow(env, assessment.childId);
  const coach = await coachOrThrow(env, assessment.coachId);
  const previous = await previousForReport(env, assessment);
  return generateReport({
    env,
    child,
    coach,
    assessment: { seqNo: assessment.seqNo, ...confirmedInputOf(assessment, report.assessmentInput) },
    previous,
    generatedAt: report.updatedAt,
  });
}
