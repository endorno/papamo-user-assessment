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
