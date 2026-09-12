import type { AppContext } from '../env';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'onboarding_required'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'internal';

export function jsonError(
  context: AppContext,
  code: ApiErrorCode,
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 500,
) {
  return context.json({ error: { code, message } }, status);
}

export function internalError(
  context: AppContext,
  caught: unknown,
  operation: string,
  userMessage = '処理中にエラーが発生しました。もう一度お試しください。',
) {
  let coachId: string | undefined;
  try {
    coachId = context.get('coach')?.id;
  } catch {
    coachId = undefined;
  }

  const error = caught instanceof Error
    ? { name: caught.name, message: caught.message, stack: caught.stack }
    : { name: 'UnknownError', message: String(caught) };
  console.error(JSON.stringify({
    event: 'api_internal_error',
    operation,
    method: context.req.method,
    path: context.req.path,
    requestId: context.req.header('cf-ray') ?? crypto.randomUUID(),
    ...(coachId ? { coachId } : {}),
    error,
  }));

  return jsonError(context, 'internal', userMessage, 500);
}
