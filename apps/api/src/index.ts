import {
  apiHealthResponseSchema,
  updateMeRequestSchema,
} from '@papamo/shared';
import { Hono } from 'hono';
import { authMiddleware, onboardingMiddleware } from './middleware/auth';
import { jsonError } from './http/errors';
import type { Env, AppVariables, WorkerExecutionContext } from './env';
import { updateCoachDisplayName } from './services/coaches';
import { childrenRoutes } from './routes/children';
import { assessmentsRoutes } from './routes/assessments';

export const api = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

api.use('/api/*', authMiddleware);
api.use('/api/*', onboardingMiddleware);

api.get('/api/health', (context) => {
  const response = apiHealthResponseSchema.parse({
    status: 'ok',
    service: 'api',
  });

  return context.json(response);
});

api.get('/api/me', (context) => {
  const coach = context.get('coach');
  return context.json({
    id: coach.id,
    email: coach.email,
    displayName: coach.displayName,
  });
});

api.put('/api/me', async (context) => {
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
    return context.json(coach);
  } catch {
    return jsonError(context, 'internal', '表示名を保存できませんでした。', 500);
  }
});

api.route('/api/children', childrenRoutes);
api.route('/api/assessments', assessmentsRoutes);

api.all('/api/*', (context) => {
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

export default {
  fetch(request: Request, env: Env, executionContext: WorkerExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request, env, executionContext);
    }

    return env.ASSETS.fetch(request);
  },
};
