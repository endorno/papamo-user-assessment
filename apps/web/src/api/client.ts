import type { Session } from '@supabase/supabase-js';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'onboarding_required'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'internal';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: ApiErrorCode | null = null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

let unauthorizedHandler: ((error: ApiClientError) => void) | null = null;

/** 401 の扱いを1か所にまとめる。レイアウトから登録する。 */
export function setUnauthorizedHandler(handler: ((error: ApiClientError) => void) | null) {
  unauthorizedHandler = handler;
}

export async function apiRequest<T>(
  path: string,
  session: Session,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, { ...init, headers });
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: ApiErrorCode } }
    | T
    | null;

  if (!response.ok) {
    const error = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
    const apiError = new ApiClientError(
      error?.message ?? '通信に失敗しました。もう一度お試しください。',
      response.status,
      error?.code ?? null,
    );
    if (response.status === 401) {
      unauthorizedHandler?.(apiError);
    }
    throw apiError;
  }

  return body as T;
}
