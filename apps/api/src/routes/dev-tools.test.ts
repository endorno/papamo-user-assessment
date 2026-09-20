import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import { createApi } from '../index';
import { createAuthMiddleware } from '../middleware/auth';
import { updateCoachDisplayName, upsertCoach } from '../services/coaches';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

function environment(overrides: Partial<Env> = {}): Env {
  return {
    ...testEnv,
    DB: testEnv.DB,
    ASSETS: testEnv.ASSETS,
    APP_ENV: 'production',
    NON_PRODUCTION_TOOLS_ENABLED: 'false',
    STAGING_ALLOWED_EMAILS: '',
    ...overrides,
  };
}

function client(id: string, email: string) {
  return createApi(createAuthMiddleware(async () => ({ sub: id, email })));
}

function request(api: ReturnType<typeof createApi>, currentEnv: Env, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  if (init.body) headers.set('Content-Type', 'application/json');
  return api.fetch(new Request(`https://example.com/api${path}`, { ...init, headers }), currentEnv);
}

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe('開発用データAPI', () => {
  it('本番では認証済みでも404を返す', async () => {
    const id = crypto.randomUUID();
    const api = client(id, `${id}@example.com`);
    await request(api, environment(), '/me', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '本番テストコーチ' }),
    });

    const response = await request(api, environment(), '/dev-tools/sample-data');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'not_found', message: '指定された API は見つかりません。' },
    });
  });

  it('ステージングは許可メール以外を403にする', async () => {
    const id = crypto.randomUUID();
    const api = client(id, 'denied@example.com');
    const response = await request(api, environment({
      APP_ENV: 'staging',
      STAGING_ALLOWED_EMAILS: 'allowed@example.com',
    }), '/me');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'forbidden', message: 'このアカウントはステージング環境を利用できません。' },
    });
  });

  it('ステージングは許可メールを大文字・小文字を区別せず通す', async () => {
    const id = crypto.randomUUID();
    const api = client(id, 'allowed@example.com');
    const currentEnv = environment({
      APP_ENV: 'staging',
      NON_PRODUCTION_TOOLS_ENABLED: 'true',
      STAGING_ALLOWED_EMAILS: 'OTHER@example.com, ALLOWED@EXAMPLE.COM',
    });

    const onboardResponse = await request(api, currentEnv, '/me', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '許可済みコーチ' }),
    });
    expect(onboardResponse.status).toBe(200);

    const statusResponse = await request(api, currentEnv, '/dev-tools/sample-data');
    expect(statusResponse.status).toBe(200);
  });

  it('ローカルでは準備状態を返し、シード前の作成を409にする', async () => {
    const id = crypto.randomUUID();
    const currentEnv = environment({ APP_ENV: 'local', NON_PRODUCTION_TOOLS_ENABLED: 'true' });
    const api = client(id, `${id}@example.com`);
    await upsertCoach(currentEnv, { id, email: `${id}@example.com` });
    await updateCoachDisplayName(currentEnv, id, 'ローカルテストコーチ');

    const statusResponse = await request(api, currentEnv, '/dev-tools/sample-data');
    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toMatchObject({
      enabled: true,
      ready: false,
      backgroundCoachCount: 0,
      presets: [1, 10, 30],
    });

    const createResponse = await request(api, currentEnv, '/dev-tools/sample-child', {
      method: 'POST',
      body: JSON.stringify({ profile: 'long' }),
    });
    expect(createResponse.status).toBe(409);
  });

  it('ローカルで背景コーチが揃っていればサンプルを作成する', async () => {
    const id = crypto.randomUUID();
    const currentEnv = environment({ APP_ENV: 'local', NON_PRODUCTION_TOOLS_ENABLED: 'true' });
    const api = client(id, `${id}@example.com`);
    await upsertCoach(currentEnv, { id, email: `${id}@example.com` });
    await updateCoachDisplayName(currentEnv, id, '生成テストコーチ');
    for (let index = 1; index <= 15; index += 1) {
      const suffix = index.toString().padStart(2, '0');
      await upsertCoach(currentEnv, {
        id: `seed-coach-${suffix}`,
        email: `seed-coach-${suffix}@example.invalid`,
      });
    }

    const response = await request(api, currentEnv, '/dev-tools/sample-child', {
      method: 'POST',
      body: JSON.stringify({ profile: 'new' }),
    });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      childId: expect.any(String),
      profile: 'new',
    });
  });
});
