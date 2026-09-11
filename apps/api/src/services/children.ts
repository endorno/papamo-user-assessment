import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';

import {
  formatShareCode,
  gradeAt,
  normalizeShareCode,
  reportContentSchema,
  schoolYear,
  stateOf,
  todayInJst,
  type GradeCode,
  type Honorific,
  type ReportContent,
} from '@papamo/shared';
import type { ChildCreateRequest, ChildPatchRequest } from '@papamo/shared';

import { assessments, childCoaches, children, reports } from '../db/schema';
import type { Env } from '../env';

export type ChildRole = 'owner' | 'member';

export interface ChildView {
  id: string;
  name: string;
  honorific: Honorific;
  gradeCode: GradeCode;
  gradeBaseYear: number;
  grade: ReturnType<typeof gradeAt>;
  joinedOn: string;
  extUnlocked: boolean;
  goals: string[];
  archivedAt: string | null;
  shareCode: string;
  ownerShareCode?: string;
  role: ChildRole;
  state: ReturnType<typeof stateOf>;
  createdAt: string;
  updatedAt: string;
}

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

export interface ChildDetail extends ChildView {
  assessments: ChildAssessmentSummary[];
  latestReport: ReportContent | null;
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

function serializeChild(
  row: typeof children.$inferSelect,
  role: ChildRole,
  includeOwnerShareCode: boolean,
  assessmentsForChild: { status: 'draft' | 'done'; assessedOn: string; unlockExt: boolean; lv: Record<string, number | undefined>; troubles: string[]; ppi: Record<string, number | undefined>; plan: string | null }[] = [],
  today = todayInJst(),
): ChildView {
  const gradeCode = row.gradeCode as GradeCode;
  const gradeBaseYear = row.gradeBaseYear;
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

  const result: ChildView[] = [];
  for (const row of rows) {
    const childAssessments = await db
      .select({
        status: assessments.status,
        assessedOn: assessments.assessedOn,
        unlockExt: assessments.unlockExt,
        data: assessments.data,
      })
      .from(assessments)
      .where(eq(assessments.childId, row.child.id))
      .all();
    result.push(
      serializeChild(
        row.child,
        row.role as ChildRole,
        row.role === 'owner',
        childAssessments.map((assessment) => {
          const data = JSON.parse(assessment.data) as Record<string, unknown>;
          return {
            status: assessment.status as 'draft' | 'done',
            assessedOn: assessment.assessedOn,
            unlockExt: assessment.unlockExt,
            lv: (data.lv ?? {}) as Record<string, number | undefined>,
            troubles: (data.troubles ?? []) as string[],
            ppi: (data.ppi ?? {}) as Record<string, number | undefined>,
            plan: (data.plan as string | null | undefined) ?? null,
          };
        }),
      ),
    );
  }
  return result;
}

function newShareCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
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
  const reportRows = await Promise.all(
    childAssessments
      .filter((assessment) => assessment.status === 'done')
      .map(async (assessment) => ({
        assessmentId: assessment.id,
        report: await db
          .select({ content: reports.content })
          .from(reports)
          .where(eq(reports.assessmentId, assessment.id))
          .get(),
      })),
  );
  const reportByAssessmentId = new Map(
    reportRows.map(({ assessmentId, report }) => {
      if (!report) {
        return [assessmentId, null] as const;
      }
      try {
        const parsed = reportContentSchema.safeParse(JSON.parse(report.content));
        return [assessmentId, parsed.success ? parsed.data : null] as const;
      } catch {
        return [assessmentId, null] as const;
      }
    }),
  );
  const serialized = serializeChild(child, membership, membership === 'owner', childAssessments.map((assessment) => {
    const data = JSON.parse(assessment.data) as Record<string, unknown>;
    return {
      status: assessment.status as 'draft' | 'done',
      assessedOn: assessment.assessedOn,
      unlockExt: assessment.unlockExt,
      lv: (data.lv ?? {}) as Record<string, number | undefined>,
      troubles: (data.troubles ?? []) as string[],
      ppi: (data.ppi ?? {}) as Record<string, number | undefined>,
      plan: (data.plan as string | null | undefined) ?? null,
    };
  })) as ChildDetail;
  serialized.assessments = childAssessments.map((assessment) => ({
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
  serialized.latestReport = latestCompleted
    ? (reportByAssessmentId.get(latestCompleted.id) ?? null) as ReportContent | null
    : null;
  return serialized;
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
  if (isOwnerTransfer) {
    await db.update(childCoaches).set({ role: 'member' }).where(
      and(eq(childCoaches.childId, child.id), eq(childCoaches.role, 'owner')),
    ).run();
    if (existing) {
      await db.update(childCoaches).set({ role: 'owner' }).where(
        and(eq(childCoaches.childId, child.id), eq(childCoaches.coachId, coachId)),
      ).run();
    } else {
      await db.insert(childCoaches).values({ childId: child.id, coachId, role: 'owner', createdAt: now }).run();
    }
  } else {
    await db.insert(childCoaches).values({ childId: child.id, coachId, role: 'member', createdAt: now }).run();
  }

  return { kind: isOwnerTransfer ? 'owner' as const : 'member' as const, childId: child.id };
}

export async function removeMembership(env: Env, childId: string, coachId: string) {
  const db = dbFor(env);
  const membership = await requireMembership(env, childId, coachId);
  if (!membership) return 'not_found' as const;
  const child = await childById(env, childId);
  if (child?.archivedAt) return 'archived' as const;
  if (membership === 'owner') return 'owner' as const;
  await db.delete(childCoaches).where(and(eq(childCoaches.childId, childId), eq(childCoaches.coachId, coachId))).run();
  return 'removed' as const;
}

export async function setArchiveState(env: Env, childId: string, archived: boolean) {
  const db = dbFor(env);
  await db.update(children).set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(eq(children.id, childId)).run();
}

export async function deleteChildIfEmpty(env: Env, childId: string) {
  const db = dbFor(env);
  const assessment = await db.select({ id: assessments.id }).from(assessments).where(eq(assessments.childId, childId)).limit(1).get();
  if (assessment) return false;
  await db.delete(childCoaches).where(eq(childCoaches.childId, childId)).run();
  await db.delete(children).where(eq(children.id, childId)).run();
  return true;
}
