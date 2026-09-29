import { and, asc, count, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { ulid } from 'ulid';

import {
  formatShareCode,
  generateShareCode,
  MAX_ACTIVE_CHILDREN_PER_COACH,
  normalizeShareCode,
  reportContentSchema,
  schoolYear,
  stateOf,
  todayInJst,
  type AssessmentProgress,
  type ChildDetail,
  type ChildView,
  type Gender,
  type GradeCode,
  type Honorific,
  type ReportContent,
} from '@papamo/shared';
import type { ChildCreateRequest, ChildPatchRequest } from '@papamo/shared';

import { dbFor } from '../db/client';
import { assessments, childCoaches, children, reports } from '../db/schema';
import { isForeignKeyConstraintError, isUniqueConstraintError } from '../db/errors';
import {
  currentInputOf,
  hasUnreportedChanges,
  parseReportedInput,
  regenerateStoredReport,
} from './assessments';
import { gradeOf } from './child-row';
import type { Env } from '../env';

export type ChildRole = 'owner' | 'member';

type ChildAssessmentProgress = AssessmentProgress & {
  id: string;
  seqNo: number;
  goals: string[];
  hasUnreportedChanges: boolean;
};

export class ChildLimitError extends Error {
  constructor() {
    super(`担当できるお子さまは${MAX_ACTIVE_CHILDREN_PER_COACH}名までです。退会したお子さまをアーカイブしてから、もう一度お試しください。`);
    this.name = 'ChildLimitError';
  }
}

/**
 * 一覧・子どもページに出す1回分の状況。
 * 完了済みの回はレポートに反映した入力で見せ、完了後の未反映の編集は「レポートを更新」まで出さない
 * （下書きの目標を完了まで出さないのと同じ考え方）。
 */
function assessmentProgressFrom(row: {
  id: string;
  seqNo: number;
  status: string;
  assessedOn: string;
  unlockExt: boolean;
  data: string;
}, reportInput: string | null): ChildAssessmentProgress {
  const done = row.status === 'done';
  const input = (done ? parseReportedInput(reportInput) : null) ?? currentInputOf(row);
  return {
    id: row.id,
    seqNo: row.seqNo,
    status: row.status as 'draft' | 'done',
    assessedOn: input.assessedOn,
    unlockExt: input.unlockExt,
    lv: input.data.lv,
    troubles: input.data.troubles,
    ppi: input.data.ppi,
    goals: done ? input.data.copm.map((goal) => goal.text) : [],
    hasUnreportedChanges: hasUnreportedChanges(row, reportInput),
  };
}

function latestCompletedAssessment(assessmentsForChild: ChildAssessmentProgress[]) {
  return [...assessmentsForChild]
    .filter((assessment) => assessment.status === 'done')
    .sort((first, second) => second.seqNo - first.seqNo)[0];
}

function serializeChild(
  row: typeof children.$inferSelect,
  role: ChildRole,
  includeOwnerShareCode: boolean,
  assessmentsForChild: ChildAssessmentProgress[] = [],
  today = todayInJst(),
): ChildView {
  const gradeCode = row.gradeCode as GradeCode;
  const latestCompleted = latestCompletedAssessment(assessmentsForChild);
  const latestAssessment = assessmentsForChild.find((assessment) => assessment.status === 'draft')
    ?? latestCompleted
    ?? null;
  return {
    id: row.id,
    name: row.name,
    honorific: row.honorific as Honorific,
    gender: row.gender as Gender,
    gradeCode,
    gradeBaseYear: row.gradeBaseYear,
    grade: gradeOf(row, today),
    joinedMonth: row.joinedMonth,
    extUnlocked: row.extUnlocked,
    archivedAt: row.archivedAt,
    shareCode: formatShareCode(row.shareCode),
    ...(includeOwnerShareCode ? { ownerShareCode: formatShareCode(row.ownerShareCode) } : {}),
    role,
    state: stateOf({ archivedAt: row.archivedAt, assessments: assessmentsForChild }, today),
    latestAssessment: latestAssessment
      ? {
          id: latestAssessment.id,
          seqNo: latestAssessment.seqNo,
          status: latestAssessment.status,
          assessedOn: latestAssessment.assessedOn,
          unlockExt: latestAssessment.unlockExt,
          lv: latestAssessment.lv,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function requireMembership(env: Env, childId: string, coachId: string) {
  const db = dbFor(env);
  const membership = await db
    .select({ role: childCoaches.role })
    .from(childCoaches)
    .where(and(eq(childCoaches.childId, childId), eq(childCoaches.coachId, coachId)))
    .get();
  if (!membership) {
    return null;
  }
  return membership.role as ChildRole;
}

export async function childById(env: Env, childId: string) {
  return dbFor(env).select().from(children).where(eq(children.id, childId)).get();
}

// 期限が近い（超過が大きい）子どもを先に出す。due 以外は同順として名前順に委ねる。
function daysLeftOf(child: ChildView): number {
  return child.state?.key === 'due' ? child.state.daysLeft : 0;
}

export async function listChildren(env: Env, coachId: string, archived: boolean) {
  const db = dbFor(env);
  const rows = await db
    .select({ child: children, role: childCoaches.role })
    .from(childCoaches)
    .innerJoin(children, eq(children.id, childCoaches.childId))
    .where(
      and(
        eq(childCoaches.coachId, coachId),
        archived ? isNotNull(children.archivedAt) : isNull(children.archivedAt),
      ),
    )
    .orderBy(asc(children.name), asc(children.createdAt))
    .all();

  if (rows.length === 0) {
    return [];
  }

  // 一覧に要るのは「入力中の回」と「直近の完了回」だけ。過去の全記録は読まない。
  // 子どもの ID を IN (?, ?, …) に並べると D1 のバインド変数の上限（100）に当たるため、サブクエリで絞る。
  const visibleChildIds = db
    .select({ id: childCoaches.childId })
    .from(childCoaches)
    .innerJoin(children, eq(children.id, childCoaches.childId))
    .where(and(
      eq(childCoaches.coachId, coachId),
      archived ? isNotNull(children.archivedAt) : isNull(children.archivedAt),
    ));
  const assessmentRows = await db
    .select({
      id: assessments.id,
      childId: assessments.childId,
      seqNo: assessments.seqNo,
      status: assessments.status,
      assessedOn: assessments.assessedOn,
      unlockExt: assessments.unlockExt,
      data: assessments.data,
      reportInput: reports.assessmentInput,
    })
    .from(assessments)
    .leftJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(and(
      inArray(assessments.childId, visibleChildIds),
      or(
        eq(assessments.status, 'draft'),
        eq(
          assessments.seqNo,
          sql`(SELECT MAX(latest.seq_no) FROM ${assessments} AS latest
               WHERE latest.child_id = ${assessments.childId} AND latest.status = 'done')`,
        ),
      ),
    ))
    .all();
  const assessmentsByChild = new Map<string, ChildAssessmentProgress[]>();
  for (const assessment of assessmentRows) {
    const grouped = assessmentsByChild.get(assessment.childId) ?? [];
    grouped.push(assessmentProgressFrom(assessment, assessment.reportInput));
    assessmentsByChild.set(assessment.childId, grouped);
  }

  const result = rows.map((row) => serializeChild(
    row.child,
    row.role as ChildRole,
    row.role === 'owner',
    assessmentsByChild.get(row.child.id) ?? [],
  ));
  result.sort((first, second) => {
    const byState = (first.state?.order ?? 99) - (second.state?.order ?? 99);
    if (byState) return byState;
    const byUrgency = daysLeftOf(first) - daysLeftOf(second);
    if (byUrgency) return byUrgency;
    return first.name.localeCompare(second.name, 'ja');
  });
  return result;
}

function newShareCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return generateShareCode(bytes);
}

/** アーカイブ中を除いて、コーチが担当しているお子さまの人数。 */
async function activeChildCount(env: Env, coachId: string): Promise<number> {
  const row = await dbFor(env)
    .select({ total: count() })
    .from(childCoaches)
    .innerJoin(children, eq(children.id, childCoaches.childId))
    .where(and(eq(childCoaches.coachId, coachId), isNull(children.archivedAt)))
    .get();
  return row?.total ?? 0;
}

/**
 * 担当を1人増やせるか。同時に登録した場合など、わずかに上限を超えることはありうる（一覧はそれでも描ける）。
 */
export async function assertCanTakeChild(env: Env, coachId: string) {
  if (await activeChildCount(env, coachId) >= MAX_ACTIVE_CHILDREN_PER_COACH) {
    throw new ChildLimitError();
  }
}

export async function createChild(env: Env, coachId: string, input: ChildCreateRequest) {
  const db = dbFor(env);
  await assertCanTakeChild(env, coachId);
  const now = new Date().toISOString();
  const today = todayInJst();
  const gradeBaseYear = schoolYear(today);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const row = {
      id: ulid(),
      shareCode: newShareCode(),
      ownerShareCode: newShareCode(),
      createdBy: coachId,
      name: input.name,
      honorific: input.honorific,
      gender: input.gender,
      gradeCode: input.gradeCode,
      gradeBaseYear,
      joinedMonth: input.joinedMonth,
      extUnlocked: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.batch([
        db.insert(children).values(row),
        db.insert(childCoaches).values({
          childId: row.id,
          coachId,
          role: 'owner',
          createdAt: now,
        }),
      ]);
      return serializeChild(row, 'owner', true);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
      if (attempt === 4) {
        throw error;
      }
    }
  }
  throw new Error('共有コードの生成に失敗しました。');
}

function parseStoredReport(content: string): ReportContent | undefined {
  try {
    const parsed = reportContentSchema.safeParse(JSON.parse(content));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

type StoredReport = { content: string; assessmentInput: string | null; updatedAt: string };

async function latestReportContent(
  env: Env,
  assessmentId: string,
  report: StoredReport,
): Promise<ReportContent> {
  const stored = parseStoredReport(report.content);
  if (stored) return stored;
  // 旧版の形で保存された本文は、表示に使う最新回だけレポート作成時の入力から作り直す。
  const assessment = await dbFor(env).select().from(assessments).where(eq(assessments.id, assessmentId)).get();
  if (!assessment) throw new Error(`アセスメントが見つかりません: ${assessmentId}`);
  return regenerateStoredReport(env, assessment, report);
}

export async function getChildForCoach(env: Env, childId: string, coachId: string) {
  const db = dbFor(env);
  const membership = await requireMembership(env, childId, coachId);
  if (!membership) {
    return null;
  }
  const child = await childById(env, childId);
  if (!child) {
    return null;
  }
  const childAssessments = await db
    .select({
      id: assessments.id,
      seqNo: assessments.seqNo,
      status: assessments.status,
      assessedOn: assessments.assessedOn,
      unlockExt: assessments.unlockExt,
      data: assessments.data,
      updatedAt: assessments.updatedAt,
      completedAt: assessments.completedAt,
    })
    .from(assessments)
    .where(eq(assessments.childId, childId))
    .orderBy(asc(assessments.seqNo))
    .all();
  const reportRows = await db
    .select({
      assessmentId: reports.assessmentId,
      content: reports.content,
      assessmentInput: reports.assessmentInput,
      updatedAt: reports.updatedAt,
    })
    .from(assessments)
    .innerJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(eq(assessments.childId, childId))
    .all();
  const reportByAssessmentId = new Map<string, StoredReport>(
    reportRows.map(({ assessmentId, ...report }) => [assessmentId, report]),
  );
  const assessmentProgresses = childAssessments.map((assessment) => assessmentProgressFrom(
    assessment,
    reportByAssessmentId.get(assessment.id)?.assessmentInput ?? null,
  ));
  const serialized = serializeChild(
    child,
    membership,
    membership === 'owner',
    assessmentProgresses,
  );
  const assessmentProgressById = new Map(assessmentProgresses.map((progress) => [progress.id, progress]));
  const assessmentSummaries = childAssessments.map((assessment) => {
    const progress = assessmentProgressById.get(assessment.id);
    return {
      id: assessment.id,
      seqNo: assessment.seqNo,
      status: assessment.status as 'draft' | 'done',
      assessedOn: progress?.assessedOn ?? assessment.assessedOn,
      unlockExt: progress?.unlockExt ?? assessment.unlockExt,
      goals: progress?.goals ?? [],
      updatedAt: assessment.updatedAt,
      completedAt: assessment.completedAt,
      reportAvailable: reportByAssessmentId.has(assessment.id),
      hasUnreportedChanges: progress?.hasUnreportedChanges ?? false,
    };
  });
  const latestCompleted = [...childAssessments]
    .reverse()
    .find((assessment) => assessment.status === 'done' && reportByAssessmentId.has(assessment.id));
  const latestReport = latestCompleted ? reportByAssessmentId.get(latestCompleted.id) : undefined;
  return {
    ...serialized,
    assessments: assessmentSummaries,
    latestReport: latestCompleted && latestReport ? await latestReportContent(env, latestCompleted.id, latestReport) : null,
  } satisfies ChildDetail;
}

// 学年を直したときは、その学年を現在年度の基準として置き直す（次の4月から自動で進級する）。
export async function patchChild(env: Env, childId: string, input: ChildPatchRequest) {
  await dbFor(env).update(children).set({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.honorific === undefined ? {} : { honorific: input.honorific }),
    ...(input.gender === undefined ? {} : { gender: input.gender }),
    ...(input.joinedMonth === undefined ? {} : { joinedMonth: input.joinedMonth }),
    ...(input.gradeCode === undefined
      ? {}
      : { gradeCode: input.gradeCode, gradeBaseYear: schoolYear(todayInJst()) }),
    updatedAt: new Date().toISOString(),
  }).where(eq(children.id, childId)).run();
}

export async function importChild(env: Env, coachId: string, code: string) {
  const db = dbFor(env);
  const normalized = normalizeShareCode(code);
  const child = await db.select().from(children).where(
    and(
      eq(children.shareCode, normalized),
      isNull(children.archivedAt),
    ),
  ).get() ?? await db.select().from(children).where(
    and(eq(children.ownerShareCode, normalized), isNull(children.archivedAt)),
  ).get();
  if (!child) {
    return { kind: 'not_found' as const };
  }

  const isOwnerTransfer = child.ownerShareCode === normalized;
  const existing = await db.select().from(childCoaches).where(
    and(eq(childCoaches.childId, child.id), eq(childCoaches.coachId, coachId)),
  ).get();
  if (existing?.role === 'owner' || (existing?.role === 'member' && !isOwnerTransfer)) {
    return { kind: 'conflict' as const };
  }
  // すでに担当しているお子さまのオーナーを引き継ぐだけなら、人数は増えない。
  if (!existing && await activeChildCount(env, coachId) >= MAX_ACTIVE_CHILDREN_PER_COACH) {
    return { kind: 'limit' as const };
  }

  const now = new Date().toISOString();
  try {
    if (isOwnerTransfer) {
      const demoteCurrentOwner = db.update(childCoaches).set({ role: 'member' }).where(
        and(eq(childCoaches.childId, child.id), eq(childCoaches.role, 'owner')),
      );
      const promoteNewOwner = existing
        ? db.update(childCoaches).set({ role: 'owner' }).where(
            and(eq(childCoaches.childId, child.id), eq(childCoaches.coachId, coachId)),
          )
        : db.insert(childCoaches).values({ childId: child.id, coachId, role: 'owner', createdAt: now });
      await db.batch([demoteCurrentOwner, promoteNewOwner]);
    } else {
      await db.insert(childCoaches).values({ childId: child.id, coachId, role: 'member', createdAt: now }).run();
    }
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { kind: 'conflict' as const };
    }
    throw error;
  }

  return { kind: isOwnerTransfer ? 'owner' as const : 'member' as const, childId: child.id };
}

export async function removeMembership(env: Env, childId: string, coachId: string) {
  const db = dbFor(env);
  const child = await childById(env, childId);
  if (!child) return 'not_found' as const;
  const membership = await requireMembership(env, childId, coachId);
  if (!membership) return 'forbidden' as const;
  if (child.archivedAt) return 'archived' as const;
  if (membership === 'owner') return 'owner' as const;
  await db.delete(childCoaches).where(and(eq(childCoaches.childId, childId), eq(childCoaches.coachId, coachId))).run();
  return 'removed' as const;
}

export async function setArchiveState(env: Env, childId: string, archived: boolean) {
  const now = new Date().toISOString();
  await dbFor(env).update(children)
    .set({ archivedAt: archived ? now : null, updatedAt: now })
    .where(eq(children.id, childId))
    .run();
}

export async function deleteChildBeforeFirstReport(env: Env, childId: string) {
  const db = dbFor(env);
  try {
    const deleteUnreportedAssessments = db.delete(assessments).where(and(
      eq(assessments.childId, childId),
      notExists(
        db.select({ id: reports.id })
          .from(reports)
          .where(eq(reports.assessmentId, assessments.id)),
      ),
    ));
    const deleteChild = db.delete(children).where(eq(children.id, childId));

    // D1 batch は1トランザクション。完了処理と競合してレポートが先に作られた場合も全体を戻す。
    await db.batch([deleteUnreportedAssessments, deleteChild]);
    return true;
  } catch (error) {
    if (isForeignKeyConstraintError(error)) {
      return false;
    }
    throw error;
  }
}
