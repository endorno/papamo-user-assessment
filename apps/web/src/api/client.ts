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

/** 認証をつけて送り、失敗なら JSON のエラー本文から ApiClientError を投げる。成功時の本文は呼び出し側で読む。 */
async function send(path: string, session: Session, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`/api${path}`, { ...init, headers });
  if (response.ok) return response;

  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: ApiErrorCode } }
    | null;
  const apiError = new ApiClientError(
    body?.error?.message ?? '通信に失敗しました。もう一度お試しください。',
    response.status,
    body?.error?.code ?? null,
  );
  if (response.status === 401) {
    unauthorizedHandler?.(apiError);
  }
  throw apiError;
}

export async function apiRequest<T>(
  path: string,
  session: Session,
  init: RequestInit = {},
): Promise<T> {
  const response = await send(path, session, init);
  return (await response.json().catch(() => null)) as T;
}

/** PDF などのファイルを受け取る。 */
export async function apiRequestBlob(
  path: string,
  session: Session,
  init: RequestInit = {},
): Promise<Blob> {
  const response = await send(path, session, init);
  return response.blob();
}

/**
 * 途中経過を1行ずつ返すAPI（NDJSON）を読み、届いた行から順に onLine へ渡す。
 * 返し始める前のエラーは通常のAPIと同じく ApiClientError になる。行の中身の検証は呼び出し側で行う。
 */
export async function apiRequestLines(
  path: string,
  session: Session,
  init: RequestInit,
  onLine: (line: unknown) => void,
): Promise<void> {
  const response = await send(path, session, init);
  if (!response.body) throw new ApiClientError('通信に失敗しました。もう一度お試しください。', response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flushLines = () => {
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(JSON.parse(line));
      newline = buffer.indexOf('\n');
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flushLines();
  }
  buffer += `${decoder.decode()}\n`;
  flushLines();
}
