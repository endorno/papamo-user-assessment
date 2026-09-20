import { and, asc, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';

import {
  assessmentDataDraftSchema,
  formatShareCode,
  generateShareCode,
  gradeAt,
  normalizeShareCode,
  reportContentSchema,
  schoolYear,
  stateOf,
  todayInJst,
  type AssessmentProgress,
  type ChildDetail,
  type ChildView,
  type GradeCode,
  type Honorific,
} from '@papamo/shared';
import type { ChildCreateRequest, ChildPatchRequest } from '@papamo/shared';

import { assessments, childCoaches, children, reports } from '../db/schema';
import { isForeignKeyConstraintError, isUniqueConstraintError } from '../db/errors';
import type { Env } from '../env';

export type ChildRole = 'owner' | 'member';

export interface ChildAssessmentSummary {
  id: string;
  seqNo: number;
  status: 'draft' | 'done';
  assessedOn: string;
  unlockExt: boolean;
  updatedAt: string;
  completedAt: string | null;
  reportAvailable: boolean;
}

function dbFor(env: Env) {
  return drizzle(env.DB, { schema: { assessments, childCoaches, children, reports } });
}

function parseGoals(value: string): string[] {
  try {
    const goals = JSON.parse(value) as unknown;
    return Array.isArray(goals) && goals.every((goal) => typeof goal === 'string')
      ? goals
      : [];
  } catch {
    return [];
  }
}

type ChildAssessmentProgress = AssessmentProgress & { id: string; seqNo: number };

function assessmentProgressFrom(row: {
  id: string;
  seqNo: number;
  status: string;
  assessedOn: string;
  unlockExt: boolean;
  data: string;
}): ChildAssessmentProgress {
  const data = assessmentDataDraftSchema.parse(JSON.parse(row.data));
  return {
    id: row.id,
    seqNo: row.seqNo,
    status: row.status as 'draft' | 'done',
    assessedOn: row.assessedOn,
    unlockExt: row.unlockExt,
    lv: data.lv,
    troubles: data.troubles,
    ppi: data.ppi,
    plan: data.plan,
  };
}

function serializeChild(
  row: typeof children.$inferSelect,
  role: ChildRole,
  includeOwnerShareCode: boolean,
  assessmentsForChild: ChildAssessmentProgress[] = [],
  today = todayInJst(),
): ChildView {
  const gradeCode = row.gradeCode as GradeCode;
  const gradeBaseYear = row.gradeBaseYear;
  const latestAssessment = assessmentsForChild.find((assessment) => assessment.status === 'draft')
    ?? [...assessmentsForChild].sort((a, b) => b.seqNo - a.seqNo)[0]
    ?? null;
  return {
    id: row.id,
    name: row.name,
    honorific: row.honorific as Honorific,
    gradeCode,
    gradeBaseYear,
    grade: gradeAt({ gradeCode, gradeBaseYear }, today),
    joinedOn: row.joinedOn,
    extUnlocked: row.extUnlocked,
    goals: parseGoals(row.goals),
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
  const visibleChildIds = rows.map(({ child }) => child.id);
  const assessmentRows = await db
    .select({
      id: assessments.id,
      childId: assessments.childId,
      seqNo: assessments.seqNo,
      status: assessments.status,
      assessedOn: assessments.assessedOn,
      unlockExt: assessments.unlockExt,
      data: assessments.data,
    })
    .from(assessments)
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
    grouped.push(assessmentProgressFrom(assessment));
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

export async function createChild(env: Env, coachId: string, input: ChildCreateRequest) {
  const db = dbFor(env);
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
      gradeCode: input.gradeCode,
      gradeBaseYear,
      joinedOn: input.joinedOn,
      extUnlocked: false,
      goals: JSON.stringify(input.goals),
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
      assessmentId: assessments.id,
      assessmentRevision: assessments.revision,
      reportRevision: reports.assessmentRevision,
      content: reports.content,
    })
    .from(assessments)
    .innerJoin(reports, eq(reports.assessmentId, assessments.id))
    .where(eq(assessments.childId, childId))
    .all();
  const reportByAssessmentId = new Map(
    reportRows.map(({ assessmentId, assessmentRevision, reportRevision, content }) => {
      if (assessmentRevision !== reportRevision) {
        return [assessmentId, null] as const;
      }
      try {
        const parsed = reportContentSchema.safeParse(JSON.parse(content));
        return [assessmentId, parsed.success ? parsed.data : null] as const;
      } catch {
        return [assessmentId, null] as const;
      }
    }),
  );
  const serialized = serializeChild(
    child,
    membership,
    membership === 'owner',
    childAssessments.map(assessmentProgressFrom),
  );
  const assessmentSummaries = childAssessments.map((assessment) => ({
    id: assessment.id,
    seqNo: assessment.seqNo,
    status: assessment.status as 'draft' | 'done',
    assessedOn: assessment.assessedOn,
    unlockExt: assessment.unlockExt,
    updatedAt: assessment.updatedAt,
    completedAt: assessment.completedAt,
    reportAvailable: Boolean(reportByAssessmentId.get(assessment.id)),
  }));
  const latestCompleted = [...childAssessments]
    .reverse()
    .find((assessment) => assessment.status === 'done' && reportByAssessmentId.get(assessment.id));
  return {
    ...serialized,
    assessments: assessmentSummaries,
    latestReport: latestCompleted ? reportByAssessmentId.get(latestCompleted.id) ?? null : null,
  } satisfies ChildDetail;
}

export async function patchChild(env: Env, childId: string, input: ChildPatchRequest) {
  const db = dbFor(env);
  const current = await childById(env, childId);
  if (!current) {
    return null;
  }
  const nextGrade = input.gradeCode ?? (current.gradeCode as GradeCode);
  await db.update(children).set({
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.honorific === undefined ? {} : { honorific: input.honorific }),
    ...(input.joinedOn === undefined ? {} : { joinedOn: input.joinedOn }),
    ...(input.goals === undefined ? {} : { goals: JSON.stringify(input.goals) }),
    ...(input.gradeCode === undefined ? {} : { gradeCode: nextGrade, gradeBaseYear: schoolYear(todayInJst()) }),
    updatedAt: new Date().toISOString(),
  }).where(eq(children.id, childId)).run();
  return childById(env, childId);
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
  if (child?.archivedAt) return 'archived' as const;
  if (membership === 'owner') return 'owner' as const;
  await db.delete(childCoaches).where(and(eq(childCoaches.childId, childId), eq(childCoaches.coachId, coachId))).run();
  return 'removed' as const;
}

export async function setArchiveState(env: Env, childId: string, archived: boolean) {
  const db = dbFor(env);
  await db.update(children).set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(children.id, childId)).run();
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
