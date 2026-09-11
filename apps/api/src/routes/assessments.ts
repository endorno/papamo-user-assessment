import {
  assessmentCompleteRequestSchema,
  assessmentPatchRequestSchema,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppContext, AppVariables, Env } from '../env';
import { jsonError } from '../http/errors';
import {
  AssessmentServiceError,
  completeAssessment,
  deleteAssessment,
  getAssessment,
  getReport,
  patchAssessment,
} from '../services/assessments';

export const assessmentsRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

function serviceError(context: AppContext, caught: unknown) {
  if (caught instanceof AssessmentServiceError) {
    const status = caught.code === 'not_found' ? 404 : caught.code === 'validation' ? 400 : 409;
    return jsonError(context, caught.code, caught.message, status);
  }
  return jsonError(context, 'internal', 'アセスメントを処理できませんでした。', 500);
}

assessmentsRoutes.get('/:id', async (context) => {
  try {
    const assessment = await getAssessment(context.env, context.req.param('id'), context.get('coach').id);
    return context.json({ assessment });
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.patch('/:id', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = assessmentPatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', 'アセスメントの入力内容を確認してください。', 400);
  }
  try {
    const assessment = await patchAssessment(context.env, context.req.param('id'), context.get('coach').id, parsed.data);
    return context.json({ assessment });
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.delete('/:id', async (context) => {
  try {
    await deleteAssessment(context.env, context.req.param('id'), context.get('coach').id);
    return context.body(null, 204);
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.post('/:id/complete', async (context) => {
  let body: unknown = {};
  try {
    if (context.req.header('content-type')?.includes('application/json')) {
      body = await context.req.json();
    }
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = assessmentCompleteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  try {
    const report = await completeAssessment(
      context.env,
      context.req.param('id'),
      context.get('coach'),
      parsed.data.updatedAt,
    );
    return context.json({ report });
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.get('/:id/report', async (context) => {
  try {
    const report = await getReport(context.env, context.req.param('id'), context.get('coach').id);
    return context.json({ report });
  } catch (caught) {
    return serviceError(context, caught);
  }
});
