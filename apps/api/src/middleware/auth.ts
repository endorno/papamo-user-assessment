import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { createMiddleware } from 'hono/factory';

import { internalError, jsonError } from '../http/errors';
import type { AppVariables, Env } from '../env';
import { upsertCoach } from '../services/coaches';

const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;

type Jwks = ReturnType<typeof createRemoteJWKSet>;

let cachedJwks: { url: string; expiresAt: number; keys: Jwks } | undefined;

function getJwks(env: Env): Jwks {
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  const now = Date.now();
  if (cachedJwks?.url === url && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const keys = createRemoteJWKSet(new URL(url), {
    cacheMaxAge: JWKS_CACHE_TTL_MS,
  });
  cachedJwks = { url, expiresAt: now + JWKS_CACHE_TTL_MS, keys };
  return keys;
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function verifyToken(env: Env, token: string): Promise<JWTPayload> {
  const result = await jwtVerify(token, getJwks(env), {
    issuer: env.SUPABASE_JWT_ISSUER,
    audience: env.SUPABASE_JWT_AUDIENCE,
  });
  return result.payload;
}

type TokenVerifier = (env: Env, token: string) => Promise<JWTPayload>;

export function createAuthMiddleware(tokenVerifier: TokenVerifier = verifyToken) {
  return createMiddleware<{
    Bindings: Env;
    Variables: AppVariables;
  }>(async (context, next) => {
    if (context.req.path === '/api/health') {
      await next();
      return;
    }

    const token = bearerToken(context.req.header('Authorization'));
    if (!token) {
      return jsonError(context, 'unauthorized', 'ログインが必要です。', 401);
    }

    let payload: JWTPayload;
    try {
      payload = await tokenVerifier(context.env, token);
    } catch {
      return jsonError(context, 'unauthorized', 'ログイン情報が無効です。再度ログインしてください。', 401);
    }

    const id = payload.sub;
    if (!id) {
      return jsonError(context, 'unauthorized', 'ログイン情報にユーザー ID がありません。', 401);
    }

    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!email) {
      return jsonError(context, 'unauthorized', 'ログイン情報にメールアドレスがありません。', 401);
    }

    let coach;
    try {
      coach = await upsertCoach(context.env, { id, email });
    } catch (caught) {
      return internalError(context, caught, 'auth.upsert_coach', 'コーチ情報を保存できませんでした。');
    }

    context.set('token', payload);
    context.set('coach', coach);
    await next();
  });
}

export const authMiddleware = createAuthMiddleware();

export const onboardingMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: AppVariables;
}>(async (context, next) => {
  if (
    context.req.path === '/api/health' ||
    context.req.path === '/api/me'
  ) {
    await next();
    return;
  }

  if (!context.get('coach').displayName) {
    return jsonError(
      context,
      'onboarding_required',
      '最初に表示名を登録してください。',
      403,
    );
  }

  await next();
});
