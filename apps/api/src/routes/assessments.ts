import {
  assessmentCompleteRequestSchema,
  assessmentPatchRequestSchema,
  assessmentResponseSchema,
  assessmentRevertRequestSchema,
  reportDriveRequestSchema,
  reportPdfRequestSchema,
  reportResponseSchema,
  type ReportDriveEvent,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppContext, AppVariables, Env } from '../env';
import { internalError, jsonError, logInternalError } from '../http/errors';
import { streamJsonLines } from '../http/stream';
import {
  AssessmentServiceError,
  completeAssessment,
  deleteAssessment,
  getAssessment,
  getReport,
  patchAssessment,
  revertAssessment,
} from '../services/assessments';
import { GoogleDriveError, type DriveConnection } from '../services/google-drive';
import { assertReportSavable, reportDriveStatusOf, saveReportPdfs } from '../services/report-drive';

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

/** レポート応答に Googleドライブの保存状態を添える。保存を設定していない環境では null。 */
async function withDriveStatus<T extends { assessmentId: string }>(context: AppContext, response: T) {
  const drive = context.get('drive')(context.env);
  return { ...response, drive: drive ? await reportDriveStatusOf(context.env, response.assessmentId) : null };
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
    return context.json(reportResponseSchema.parse(await withDriveStatus(context, completed)));
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
    return context.json(reportResponseSchema.parse(await withDriveStatus(context, found)));
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
    const [pdf] = await context.get('renderPdf')(context.env, [parsed.data.html]);
    if (!pdf) throw new Error('PDFが作られませんでした。');
    return context.body(pdf, 200, {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
    });
  } catch (caught) {
    return internalError(context, caught, 'report.pdf', 'PDFを作成できませんでした。少し待ってからもう一度お試しください。');
  }
});

const PDF_FAILED_MESSAGE = 'PDFを作成できませんでした。少し待ってからもう一度お試しください。';

/**
 * 段階ごとの所要時間（ミリ秒）。画面の進み具合の見込み（Web の DRIVE_STEP_EXPECTED_MS）を実測で直すために記録する。
 * Workers の時計は I/O を待つ間しか進まないが、どの段階も外部への通信を待つので所要時間として読める。
 */
function lapTimer() {
  const startedAt = Date.now();
  let last = startedAt;
  const laps: Record<string, number> = {};
  return {
    lap(label: string) {
      const now = Date.now();
      laps[label] = now - last;
      last = now;
    },
    log(assessmentId: string, outcome: 'saved' | 'pdf_failed' | 'drive_failed') {
      console.log(JSON.stringify({ event: 'report_drive_timing', assessmentId, outcome, ms: { ...laps, total: Date.now() - startedAt } }));
    },
  };
}

/** PDFを2つ作って Drive に保存し、段階に入るたびに send で知らせる。失敗も最後の行で知らせる（例外は投げない）。 */
async function saveReportToDrive(
  context: AppContext,
  drive: DriveConnection,
  input: { assessmentId: string; generatedAt: string; parentHtml: string; coachHtml: string },
  send: (event: ReportDriveEvent) => void,
) {
  const timer = lapTimer();
  send({ type: 'step', step: 'renderParent' });
  let pdfs: Uint8Array<ArrayBuffer>[];
  try {
    pdfs = await context.get('renderPdf')(context.env, [input.parentHtml, input.coachHtml], (index) => {
      if (index === 0) {
        timer.lap('launch');
        return;
      }
      timer.lap('renderParent');
      send({ type: 'step', step: 'renderCoach' });
    });
  } catch (caught) {
    logInternalError(context, caught, 'report.drive.pdf');
    send({ type: 'error', error: { code: 'internal', message: PDF_FAILED_MESSAGE } });
    timer.log(input.assessmentId, 'pdf_failed');
    return;
  }
  const [parent, coach] = pdfs;
  if (!parent || !coach) {
    logInternalError(context, new Error('PDFが作られませんでした。'), 'report.drive.pdf');
    send({ type: 'error', error: { code: 'internal', message: PDF_FAILED_MESSAGE } });
    timer.log(input.assessmentId, 'pdf_failed');
    return;
  }
  timer.lap('renderCoach');

  send({ type: 'step', step: 'upload' });
  try {
    const saved = await saveReportPdfs(context.env, drive, {
      assessmentId: input.assessmentId,
      generatedAt: input.generatedAt,
      pdfs: { parent, coach },
    }, (audience) => timer.lap(audience === 'parent' ? 'folder' : 'uploadParent'));
    timer.lap('uploadCoach');
    send({ type: 'done', drive: saved });
    timer.log(input.assessmentId, 'saved');
  } catch (caught) {
    timer.log(input.assessmentId, 'drive_failed');
    if (caught instanceof AssessmentServiceError) {
      send({ type: 'error', error: { code: caught.code, message: caught.message } });
      return;
    }
    logInternalError(context, caught, 'report.drive.save');
    const message = caught instanceof GoogleDriveError && caught.status === 403
      ? 'Googleドライブの保存先に書き込めませんでした。管理者に共有ドライブの設定を確認してもらってください。'
      : 'Googleドライブに保存できませんでした。少し待ってからもう一度お試しください。';
    send({ type: 'error', error: { code: 'internal', message } });
  }
}

/**
 * 保護者向けとコーチ向けのPDFを Googleドライブに保存する。レポート画面が、保存した版より新しいレポートを開いたときに送る。
 * PDFにするHTMLはブラウザで描いたレポートから組み立てるため（サーバーではレポートを描けない）、完了処理の中では保存しない。
 * 保存は十数秒かかるため、確認を済ませたら段階ごとの途中経過を NDJSON で返す（REPORT_DRIVE_STEPS）。
 */
assessmentsRoutes.post('/:id/report/drive', async (context) => {
  const drive = context.get('drive')(context.env);
  if (!drive) {
    return jsonError(context, 'not_found', 'Googleドライブへの保存は設定されていません。', 404);
  }
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', 'レポートの内容を読み取れませんでした。画面を再読み込みしてからもう一度お試しください。', 400);
  }
  const parsed = reportDriveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', parsed.error.issues[0]?.message ?? 'レポートの内容を読み取れませんでした。', 400);
  }
  const assessmentId = context.req.param('id');
  try {
    await assertReportSavable(context.env, assessmentId, context.get('coach').id, parsed.data.generatedAt);
  } catch (caught) {
    return serviceError(context, caught);
  }

  return streamJsonLines<ReportDriveEvent>(context, 'report.drive', (send) => saveReportToDrive(context, drive, {
    assessmentId,
    ...parsed.data,
  }, send));
});
