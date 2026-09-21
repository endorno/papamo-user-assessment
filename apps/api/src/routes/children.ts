import {
  assessmentCreateRequestSchema,
  assessmentCreateResponseSchema,
  childCreateRequestSchema,
  childDetailResponseSchema,
  childImportRequestSchema,
  childImportResponseSchema,
  childPatchRequestSchema,
  childResponseSchema,
  childrenResponseSchema,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppContext, AppVariables, Env } from '../env';
import { internalError, jsonError } from '../http/errors';
import {
  childById,
  createChild,
  deleteChildBeforeFirstReport,
  getChildForCoach,
  importChild,
  listChildren,
  patchChild,
  removeMembership,
  requireMembership,
  setArchiveState,
} from '../services/children';
import { AssessmentServiceError, createAssessment } from '../services/assessments';

export const childrenRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

childrenRoutes.get('/', async (context) => {
  const archived = context.req.query('archived') === '1';
  const children = await listChildren(context.env, context.get('coach').id, archived);
  return context.json(childrenResponseSchema.parse({ children }));
});

childrenRoutes.post('/', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = childCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '名前・学年・入会日を確認してください。', 400);
  }

  try {
    const child = await createChild(context.env, context.get('coach').id, parsed.data);
    return context.json(childResponseSchema.parse({ child }), 201);
  } catch (caught) {
    return internalError(context, caught, 'child.create', 'お子さまを登録できませんでした。');
  }
});

childrenRoutes.post('/import', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '共有コードを入力してください。', 400);
  }
  const parsed = childImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '共有コードを確認してください。', 400);
  }

  const result = await importChild(context.env, context.get('coach').id, parsed.data.code);
  if (result.kind === 'not_found') {
    return jsonError(context, 'not_found', '共有コードに一致するお子さまが見つかりません。', 404);
  }
  if (result.kind === 'conflict') {
    return jsonError(context, 'conflict', 'そのお子さまはすでに一覧にあります。', 409);
  }
  const child = await getChildForCoach(context.env, result.childId, context.get('coach').id);
  if (!child) {
    return jsonError(context, 'internal', '取り込み結果を読み込めませんでした。', 500);
  }
  return context.json(childImportResponseSchema.parse({ child, ownershipTransferred: result.kind === 'owner' }));
});

childrenRoutes.post('/:childId/assessments', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = assessmentCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '開放する種目の設定を確認してください。', 400);
  }
  try {
    const assessment = await createAssessment(
      context.env,
      context.req.param('childId'),
      context.get('coach').id,
      parsed.data.unlockExt,
    );
    return context.json(assessmentCreateResponseSchema.parse({ assessment }), 201);
  } catch (caught) {
    if (caught instanceof AssessmentServiceError) {
      return jsonError(context, caught.code, caught.message, caught.status);
    }
    return internalError(context, caught, 'assessment.create', 'アセスメントを作成できませんでした。');
  }
});

childrenRoutes.get('/:id', async (context) => {
  const childId = context.req.param('id');
  if (!(await childById(context.env, childId))) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  if (!(await requireMembership(context.env, childId, context.get('coach').id))) {
    return jsonError(context, 'forbidden', 'このお子さまを閲覧する権限がありません。', 403);
  }
  const child = await getChildForCoach(context.env, childId, context.get('coach').id);
  if (!child) return jsonError(context, 'internal', 'お子さまを読み込めませんでした。', 500);
  return context.json(childDetailResponseSchema.parse({ child }));
});

childrenRoutes.patch('/:id', async (context) => {
  const childId = context.req.param('id');
  const current = await childById(context.env, childId);
  if (!current) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'forbidden', 'このお子さまを編集する権限がありません。', 403);
  }
  if (current.archivedAt) {
    return jsonError(context, 'conflict', 'アーカイブ中のお子さまは編集できません。', 409);
  }

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = childPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  await patchChild(context.env, childId, parsed.data);
  const serialized = await getChildForCoach(context.env, childId, context.get('coach').id);
  if (!serialized) {
    return jsonError(context, 'internal', '更新結果を読み込めませんでした。', 500);
  }
  return context.json(childDetailResponseSchema.parse({ child: serialized }));
});

childrenRoutes.delete('/:id/membership', async (context) => {
  const result = await removeMembership(
    context.env,
    context.req.param('id'),
    context.get('coach').id,
  );
  if (result === 'not_found') {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  if (result === 'forbidden') {
    return jsonError(context, 'forbidden', 'このお子さまを操作する権限がありません。', 403);
  }
  if (result === 'owner') {
    return jsonError(context, 'forbidden', 'オーナーは一覧から削除できません。', 403);
  }
  if (result === 'archived') {
    return jsonError(context, 'conflict', 'アーカイブ中のお子さまは一覧から外せません。', 409);
  }
  return context.body(null, 204);
});

childrenRoutes.delete('/:id', async (context) => {
  const childId = context.req.param('id');
  if (!(await childById(context.env, childId))) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'forbidden', 'このお子さまを操作する権限がありません。', 403);
  }
  if (membership !== 'owner') {
    return jsonError(context, 'forbidden', 'お子さまの削除はオーナーのみ行えます。', 403);
  }
  if (!(await deleteChildBeforeFirstReport(context.env, childId))) {
    return jsonError(context, 'conflict', '最初のレポートを作成したお子さまは削除できません。', 409);
  }
  return context.body(null, 204);
});

async function archive(context: AppContext, archived: boolean) {
  // AppContext はパス未確定のため param が optional になる。
  const childId = context.req.param('id');
  if (!childId || !(await childById(context.env, childId))) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'forbidden', 'このお子さまを操作する権限がありません。', 403);
  }
  if (membership !== 'owner') {
    return jsonError(context, 'forbidden', 'この操作はオーナーのみ行えます。', 403);
  }
  await setArchiveState(context.env, childId, archived);
  const child = await getChildForCoach(context.env, childId, context.get('coach').id);
  if (!child) {
    return jsonError(context, 'internal', '更新結果を読み込めませんでした。', 500);
  }
  return context.json(childDetailResponseSchema.parse({ child }));
}

childrenRoutes.post('/:id/archive', (context) => archive(context, true));
childrenRoutes.post('/:id/unarchive', (context) => archive(context, false));
