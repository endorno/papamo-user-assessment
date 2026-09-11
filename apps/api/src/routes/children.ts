import {
  assessmentCreateRequestSchema,
  childCreateRequestSchema,
  childImportRequestSchema,
  childPatchRequestSchema,
  isValidDateString,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppContext, AppVariables, Env } from '../env';
import { jsonError } from '../http/errors';
import {
  childById,
  createChild,
  deleteChildIfEmpty,
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
  return context.json({ children });
});

childrenRoutes.post('/', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = childCreateRequestSchema.safeParse(body);
  if (!parsed.success || !isValidDateString(parsed.success ? parsed.data.joinedOn : '')) {
    return jsonError(context, 'validation', '名前・学年・入会日を確認してください。', 400);
  }

  try {
    const child = await createChild(context.env, context.get('coach').id, parsed.data);
    return context.json({ child }, 201);
  } catch {
    return jsonError(context, 'internal', 'お子さまを登録できませんでした。', 500);
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
  return context.json({ child, ownershipTransferred: result.kind === 'owner' });
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
    return context.json({ assessment }, 201);
  } catch (caught) {
    if (caught instanceof AssessmentServiceError) {
      const status = caught.code === 'not_found' ? 404 : caught.code === 'validation' ? 400 : 409;
      return jsonError(context, caught.code, caught.message, status);
    }
    return jsonError(context, 'internal', 'アセスメントを作成できませんでした。', 500);
  }
});

childrenRoutes.get('/:id', async (context) => {
  const child = await getChildForCoach(context.env, context.req.param('id'), context.get('coach').id);
  if (!child) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  return context.json({ child });
});

childrenRoutes.patch('/:id', async (context) => {
  const childId = context.req.param('id');
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  const current = await childById(context.env, childId);
  if (!current) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
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
  if (!parsed.success || (parsed.data.joinedOn && !isValidDateString(parsed.data.joinedOn))) {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const updated = await patchChild(context.env, childId, parsed.data);
  const serialized = await getChildForCoach(context.env, childId, context.get('coach').id);
  return context.json({ child: updated && serialized });
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
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  if (membership !== 'owner') {
    return jsonError(context, 'forbidden', 'お子さまの削除はオーナーのみ行えます。', 403);
  }
  if (!(await deleteChildIfEmpty(context.env, childId))) {
    return jsonError(context, 'conflict', 'アセスメントがあるお子さまは削除できません。', 409);
  }
  return context.body(null, 204);
});

async function archive(context: AppContext, archived: boolean) {
  const childId = context.req.param('id');
  if (!childId) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  const membership = await requireMembership(context.env, childId, context.get('coach').id);
  if (!membership) {
    return jsonError(context, 'not_found', 'お子さまが見つかりません。', 404);
  }
  if (membership !== 'owner') {
    return jsonError(context, 'forbidden', 'この操作はオーナーのみ行えます。', 403);
  }
  await setArchiveState(context.env, childId, archived);
  const child = await getChildForCoach(context.env, childId, context.get('coach').id);
  return context.json({ child });
}

childrenRoutes.post('/:id/archive', (context) => archive(context, true));
childrenRoutes.post('/:id/unarchive', (context) => archive(context, false));
