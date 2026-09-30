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

  it('ステージングはSupabase Authで認証済みのコーチを通す', async () => {
    const id = crypto.randomUUID();
    const api = client(id, 'coach@example.com');
    const currentEnv = environment({
      APP_ENV: 'staging',
      NON_PRODUCTION_TOOLS_ENABLED: 'true',
    });

    const onboardResponse = await request(api, currentEnv, '/me', {
      method: 'PUT',
      body: JSON.stringify({ displayName: 'ステージングコーチ' }),
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
      environment: 'local',
      ready: false,
      backgroundCoachCount: 0,
      requiredBackgroundCoachCount: 15,
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

  it('本番では担当一覧の一括削除も404にする', async () => {
    const id = crypto.randomUUID();
    const api = client(id, `${id}@example.com`);
    await request(api, environment(), '/me', {
      method: 'PUT',
      body: JSON.stringify({ displayName: '本番テストコーチ2' }),
    });

    const response = await request(api, environment(), '/dev-tools/children', { method: 'DELETE' });
    expect(response.status).toBe(404);
  });

  it('ローカルではオーナーの子どもだけ履歴ごと消し、共有で受け取った子どもはリンクだけ外す', async () => {
    const currentEnv = environment({ APP_ENV: 'local', NON_PRODUCTION_TOOLS_ENABLED: 'true' });
    const ownerId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const ownerApi = client(ownerId, `${ownerId}@example.com`);
    const memberApi = client(memberId, `${memberId}@example.com`);
    for (const [id, name] of [[ownerId, 'オーナーコーチ'], [memberId, '片付けコーチ']] as const) {
      await upsertCoach(currentEnv, { id, email: `${id}@example.com` });
      await updateCoachDisplayName(currentEnv, id, name);
    }
    for (let index = 1; index <= 15; index += 1) {
      const suffix = index.toString().padStart(2, '0');
      await upsertCoach(currentEnv, {
        id: `seed-coach-${suffix}`,
        email: `seed-coach-${suffix}@example.invalid`,
      });
    }

    // 完了済みの回とレポートが積み重なった子どもでも消せることを確かめる。
    for (const profile of ['long', 'new'] as const) {
      const created = await request(memberApi, currentEnv, '/dev-tools/sample-child', {
        method: 'POST',
        body: JSON.stringify({ profile }),
      });
      expect(created.status).toBe(201);
    }

    // ほかのコーチがオーナーの子どもを共有コードで受け取っておく。
    const shared = await request(ownerApi, currentEnv, '/dev-tools/sample-child', {
      method: 'POST',
      body: JSON.stringify({ profile: 'short' }),
    });
    const { childId: sharedChildId } = await shared.json() as { childId: string };
    const detail = await request(ownerApi, currentEnv, `/children/${sharedChildId}`);
    const { child } = await detail.json() as { child: { shareCode: string } };
    const imported = await request(memberApi, currentEnv, '/children/import', {
      method: 'POST',
      body: JSON.stringify({ code: child.shareCode }),
    });
    expect(imported.status).toBe(200);

    const response = await request(memberApi, currentEnv, '/dev-tools/children', { method: 'DELETE' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 2, unlinked: 1 });

    const memberList = await request(memberApi, currentEnv, '/children');
    await expect(memberList.json()).resolves.toEqual({ children: [] });

    // オーナー側の子どもは記録ごと残る。
    const ownerList = await request(ownerApi, currentEnv, '/children');
    const { children: ownerChildren } = await ownerList.json() as { children: { id: string }[] };
    expect(ownerChildren.map((row) => row.id)).toEqual([sharedChildId]);
  });
});
