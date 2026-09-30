import {
  assessmentCompleteRequestSchema,
  assessmentPatchRequestSchema,
  assessmentResponseSchema,
  assessmentRevertRequestSchema,
  reportPdfRequestSchema,
  reportResponseSchema,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppContext, AppVariables, Env } from '../env';
import { internalError, jsonError } from '../http/errors';
import {
  AssessmentServiceError,
  completeAssessment,
  deleteAssessment,
  getAssessment,
  getReport,
  patchAssessment,
  revertAssessment,
} from '../services/assessments';

export const assessmentsRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

function serviceError(context: AppContext, caught: unknown) {
  if (caught instanceof AssessmentServiceError) {
    return jsonError(context, caught.code, caught.message, caught.status);
  }
  return internalError(context, caught, 'assessment.request', 'アセスメントを処理できませんでした。');
}

assessmentsRoutes.get('/:id', async (context) => {
  try {
    const assessment = await getAssessment(context.env, context.req.param('id'), context.get('coach').id);
    return context.json(assessmentResponseSchema.parse({ assessment }));
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
    return context.json(assessmentResponseSchema.parse({ assessment }));
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
    const completed = await completeAssessment(
      context.env,
      context.req.param('id'),
      context.get('coach'),
      parsed.data.updatedAt,
    );
    return context.json(reportResponseSchema.parse(completed));
  } catch (caught) {
    return serviceError(context, caught);
  }
});

// 完了済みの回の入力を、レポートを作ったときの内容に戻す。
assessmentsRoutes.post('/:id/revert', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  const parsed = assessmentRevertRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '入力内容を確認してください。', 400);
  }
  try {
    const assessment = await revertAssessment(
      context.env,
      context.req.param('id'),
      context.get('coach').id,
      parsed.data.updatedAt,
    );
    return context.json(assessmentResponseSchema.parse({ assessment }));
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.get('/:id/report', async (context) => {
  try {
    const found = await getReport(context.env, context.req.param('id'), context.get('coach').id);
    return context.json(reportResponseSchema.parse(found));
  } catch (caught) {
    return serviceError(context, caught);
  }
});

assessmentsRoutes.post('/:id/report/pdf', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', 'レポートの内容を読み取れませんでした。画面を再読み込みしてからもう一度お試しください。', 400);
  }
  const parsed = reportPdfRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', parsed.error.issues[0]?.message ?? 'レポートの内容を読み取れませんでした。', 400);
  }
  try {
    // 担当していない子どものレポートはPDFにもさせない。存在と membership の確認はレポート取得と同じ。
    await getReport(context.env, context.req.param('id'), context.get('coach').id);
  } catch (caught) {
    return serviceError(context, caught);
  }
  try {
    const pdf = await context.get('renderPdf')(context.env, parsed.data.html);
    return context.body(pdf, 200, {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
    });
  } catch (caught) {
    return internalError(context, caught, 'report.pdf', 'PDFを作成できませんでした。少し待ってからもう一度お試しください。');
  }
});
