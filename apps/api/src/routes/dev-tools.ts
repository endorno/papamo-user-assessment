import {
  sampleChildCreateRequestSchema,
  sampleChildCreateResponseSchema,
  sampleDataStatusResponseSchema,
} from '@papamo/shared';
import { Hono } from 'hono';

import type { AppVariables, Env } from '../env';
import { internalError, jsonError } from '../http/errors';
import { nonProductionToolsEnabled } from '../services/non-production';
import {
  createSampleChild,
  sampleDataStatus,
  SampleDataServiceError,
} from '../services/sample-data';

export const devToolsRoutes = new Hono<{
  Bindings: Env;
  Variables: AppVariables;
}>();

devToolsRoutes.use('*', async (context, next) => {
  if (!nonProductionToolsEnabled(context.env)) {
    return jsonError(context, 'not_found', '指定された API は見つかりません。', 404);
  }
  await next();
});

devToolsRoutes.get('/sample-data', async (context) => {
  try {
    const status = await sampleDataStatus(context.env);
    return context.json(sampleDataStatusResponseSchema.parse({
      enabled: true,
      presets: [1, 10, 30],
      ...status,
    }));
  } catch (caught) {
    return internalError(context, caught, 'dev_tools.status', '開発用データの状態を確認できませんでした。');
  }
});

devToolsRoutes.post('/sample-child', async (context) => {
  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return jsonError(context, 'validation', '生成するデータの種類を指定してください。', 400);
  }
  const parsed = sampleChildCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(context, 'validation', '生成するデータの種類を確認してください。', 400);
  }

  try {
    const created = await createSampleChild(
      context.env,
      context.get('coach'),
      parsed.data.profile,
    );
    return context.json(sampleChildCreateResponseSchema.parse(created), 201);
  } catch (caught) {
    if (caught instanceof SampleDataServiceError) {
      return jsonError(context, 'conflict', caught.message, 409);
    }
    return internalError(context, caught, 'dev_tools.create_sample_child', 'サンプルのお子さまを作成できませんでした。');
  }
});
