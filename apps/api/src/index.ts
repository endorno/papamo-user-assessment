import {
  apiHealthResponseSchema,
  meResponseSchema,
  updateMeRequestSchema,
} from '@papamo/shared';
import { Hono } from 'hono';
import { authMiddleware, onboardingMiddleware } from './middleware/auth';
import { internalError, jsonError } from './http/errors';
import type { Env, AppVariables } from './env';
import { updateCoachDisplayName } from './services/coaches';
import { childrenRoutes } from './routes/children';
import { assessmentsRoutes } from './routes/assessments';
import { devToolsRoutes } from './routes/dev-tools';
import { renderReportPdf, type ReportPdfRenderer } from './services/report-pdf';

// テストではヘッドレス Chrome を起動しないよう、PDF生成を差し替えられるようにする。
export function createApi(auth = authMiddleware, { renderPdf = renderReportPdf }: { renderPdf?: ReportPdfRenderer } = {}) {
  const app = new Hono<{
    Bindings: Env;
    Variables: AppVariables;
  }>();

  app.use('/api/*', auth);
  app.use('/api/*', onboardingMiddleware);
  app.use('/api/*', async (context, next) => {
    context.set('renderPdf', renderPdf);
    await next();
  });

  app.get('/api/health', (context) => {
    const response = apiHealthResponseSchema.parse({
      status: 'ok',
      service: 'api',
    });

    return context.json(response);
  });

  app.get('/api/me', (context) => {
    const coach = context.get('coach');
    return context.json(meResponseSchema.parse({
      id: coach.id,
      email: coach.email,
      displayName: coach.displayName,
    }));
  });

  app.put('/api/me', async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return jsonError(context, 'validation', '入力内容を確認してください。', 400);
    }

    const parsed = updateMeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(
        context,
        'validation',
        parsed.error.issues[0]?.message ?? '表示名を入力してください。',
        400,
      );
    }

    try {
      const coach = await updateCoachDisplayName(
        context.env,
        context.get('coach').id,
        parsed.data.displayName,
      );
      context.set('coach', coach);
      return context.json(meResponseSchema.parse(coach));
    } catch (caught) {
      return internalError(context, caught, 'coach.update_display_name', '表示名を保存できませんでした。');
    }
  });

  app.route('/api/children', childrenRoutes);
  app.route('/api/assessments', assessmentsRoutes);
  app.route('/api/dev-tools', devToolsRoutes);

  app.all('/api/*', (context) => {
    return context.json(
      {
        error: {
          code: 'not_found',
          message: '指定された API は見つかりません。',
        },
      },
      404,
    );
  });

  app.onError((caught, context) => {
    return internalError(context, caught, 'api.unhandled');
  });

  return app;
}

export const api = createApi();

export default {
  fetch(request: Request, env: Env, executionContext: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
