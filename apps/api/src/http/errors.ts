import { DrizzleQueryError } from 'drizzle-orm';

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

const MAX_CAUSE_DEPTH = 4;

export interface LoggedError {
  name: string;
  message?: string;
  /** 失敗した SQL 文（値は ? のまま）。 */
  query?: string;
  /** 検証エラーの項目。受け取った値は含めない。 */
  issues?: { code: string; path: string }[];
  stack?: string[];
  cause?: LoggedError;
}

function isZodError(error: Error): error is Error & { issues: { code: string; path: (string | number)[] }[] } {
  return error.name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues);
}

/** スタックは呼び出し位置の行だけを残す。先頭行はメッセージそのものなので、入力値が混ざりうる。 */
function stackFrames(error: Error): string[] | undefined {
  return error.stack
    ?.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

/**
 * ログに残すエラーの情報。子どもの名前や入力本文が混ざる部分は落とす。
 * - Drizzle のクエリ失敗はメッセージにバインド値（名前・入力内容）を含むため、SQL 文と原因だけを残す
 * - zod の検証エラーは受け取った値を含みうるため、コードと項目の位置だけを残す
 * - JSON の解析エラーは元の文字列の一部を含むため、メッセージを残さない
 */
export function describeError(caught: unknown, depth = 0): LoggedError {
  if (!(caught instanceof Error)) return { name: typeof caught };
  const base = { name: caught.name, stack: stackFrames(caught) };
  const cause = depth < MAX_CAUSE_DEPTH && caught.cause !== undefined
    ? { cause: describeError(caught.cause, depth + 1) }
    : {};
  if (caught instanceof DrizzleQueryError) return { ...base, query: caught.query, ...cause };
  if (isZodError(caught)) {
    return {
      ...base,
      issues: caught.issues.map((issue) => ({ code: issue.code, path: issue.path.join('.') })),
    };
  }
  if (caught instanceof SyntaxError) return { ...base, ...cause };
  return { ...base, message: caught.message, ...cause };
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

  const error = describeError(caught);
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
