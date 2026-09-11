import type { Session } from '@supabase/supabase-js';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
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
    | { error?: { message?: string } }
    | T
    | null;

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? body.error?.message
        : undefined;
    throw new ApiClientError(
      message ?? '通信に失敗しました。もう一度お試しください。',
      response.status,
    );
  }

  return body as T;
}
