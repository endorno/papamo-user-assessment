import {
  assessmentCreateResponseSchema,
  assessmentResponseSchema,
  childDetailResponseSchema,
  childImportResponseSchema,
  childResponseSchema,
  childrenResponseSchema,
  reportResponseSchema,
} from '@papamo/shared';
import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import { createApi } from '../index';
import { createAuthMiddleware } from '../middleware/auth';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

interface TestClient {
  api: ReturnType<typeof createApi>;
  token: string;
}

async function createTestClient(): Promise<TestClient> {
  const coachId = crypto.randomUUID();
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const token = await new SignJWT({ email: `${coachId}@example.com` })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(coachId)
    .setIssuer(testEnv.SUPABASE_JWT_ISSUER)
    .setAudience(testEnv.SUPABASE_JWT_AUDIENCE)
    .setExpirationTime('1h')
    .sign(privateKey);
  const auth = createAuthMiddleware(async (currentEnv, rawToken) => {
    const result = await jwtVerify(rawToken, publicKey, {
      issuer: currentEnv.SUPABASE_JWT_ISSUER,
      audience: currentEnv.SUPABASE_JWT_AUDIENCE,
    });
    return result.payload;
  });
  return { api: createApi(auth), token };
}

function request(client: TestClient, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${client.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return client.api.fetch(new Request(`https://example.com/api${path}`, { ...init, headers }), testEnv);
}

async function onboard(client: TestClient) {
  const response = await request(client, '/me', {
    method: 'PUT',
    body: JSON.stringify({ displayName: 'テストコーチ' }),
  });
  expect(response.status).toBe(200);
}

async function createChild(client: TestClient, name: string) {
  const response = await request(client, '/children', {
    method: 'POST',
    body: JSON.stringify({
      name,
      honorific: 'chan',
      gradeCode: 'k2',
      joinedOn: '2026-09-01',
    }),
  });
  expect(response.status).toBe(201);
  return childResponseSchema.parse(await response.json()).child;
}

describe('API ルート結合', () => {
  it('初回ログイン時は自分の情報以外を403にし、表示名登録後に進める', async () => {
    const client = await createTestClient();
    const meResponse = await request(client, '/me');
    expect(meResponse.status).toBe(200);
    expect(await meResponse.json()).toMatchObject({ displayName: null });

    const blockedResponse = await request(client, '/children');
    expect(blockedResponse.status).toBe(403);
    await expect(blockedResponse.json()).resolves.toEqual({
      error: { code: 'onboarding_required', message: '最初に表示名を登録してください。' },
    });

    await onboard(client);
    const childrenResponse = await request(client, '/children');
    expect(childrenResponse.status).toBe(200);
    expect(childrenResponseSchema.parse(await childrenResponse.json()).children).toEqual([]);
  });

  it('作成・自動保存・完了・レポート取得を共有レスポンススキーマで検証する', async () => {
    const client = await createTestClient();
    await onboard(client);
    const child = await createChild(client, 'ゆい');

    const ownerRemoval = await request(client, `/children/${child.id}/membership`, { method: 'DELETE' });
    expect(ownerRemoval.status).toBe(403);

    const createResponse = await request(client, `/children/${child.id}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ unlockExt: false }),
    });
    expect(createResponse.status).toBe(201);
    const created = assessmentCreateResponseSchema.parse(await createResponse.json()).assessment;

    const duplicateResponse = await request(client, `/children/${child.id}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ unlockExt: false }),
    });
    expect(duplicateResponse.status).toBe(409);

    const detailResponse = await request(client, `/assessments/${created.id}`);
    const detail = assessmentResponseSchema.parse(await detailResponse.json()).assessment;
    const incompleteResponse = await request(client, `/assessments/${created.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ updatedAt: detail.updatedAt }),
    });
    expect(incompleteResponse.status).toBe(400);

    const patchResponse = await request(client, `/assessments/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          lv: { post: 3, eyeh: 4, hand: 5 },
          observations: {},
          troubles: ['転びやすい・つまずきやすい'],
          ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
          ppiNote: '',
          memo: '',
        },
        updatedAt: detail.updatedAt,
      }),
    });
    expect(patchResponse.status).toBe(200);
    const saved = assessmentResponseSchema.parse(await patchResponse.json()).assessment;

    const completeResponse = await request(client, `/assessments/${created.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ updatedAt: saved.updatedAt }),
    });
    expect(completeResponse.status).toBe(200);
    expect(reportResponseSchema.parse(await completeResponse.json()).report.kind).toBe('first');

    const reportResponse = await request(client, `/assessments/${created.id}/report`);
    expect(reportResponse.status).toBe(200);
    expect(reportResponseSchema.parse(await reportResponse.json()).report.header.childName).toBe('ゆい');

    const completedDetailResponse = await request(client, `/assessments/${created.id}`);
    const completedDetail = assessmentResponseSchema.parse(await completedDetailResponse.json()).assessment;
    const { goals: _completedGoals, ...editableCompleted } = completedDetail.data;
    const completedPatchResponse = await request(client, `/assessments/${created.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        data: {
          ...editableCompleted,
          lv: { ...editableCompleted.lv, post: 10 },
        },
        updatedAt: completedDetail.updatedAt,
      }),
    });
    expect(completedPatchResponse.status).toBe(200);
    const regeneratedReportResponse = await request(client, `/assessments/${created.id}/report`);
    const regeneratedReport = reportResponseSchema.parse(await regeneratedReportResponse.json()).report;
    expect(regeneratedReport.levels.find(({ key }) => key === 'post')?.lv).toBe(10);

    const doneDeletion = await request(client, `/assessments/${created.id}`, { method: 'DELETE' });
    expect(doneDeletion.status).toBe(409);
    const childDeletion = await request(client, `/children/${child.id}`, { method: 'DELETE' });
    expect(childDeletion.status).toBe(409);
  });

  it('性別つきで登録でき、最初のレポート前なら下書きと共有先ごと削除する', async () => {
    const owner = await createTestClient();
    const member = await createTestClient();
    await onboard(owner);
    await onboard(member);

    const createResponse = await request(owner, '/children', {
      method: 'POST',
      body: JSON.stringify({
        name: 'ひなた',
        honorific: 'kun',
        gender: 'girl',
        gradeCode: 'e1',
        joinedOn: '2026-09-01',
      }),
    });
    expect(createResponse.status).toBe(201);
    const child = childResponseSchema.parse(await createResponse.json()).child;
    expect(child).toMatchObject({ honorific: 'kun', gender: 'girl', goals: [] });

    expect((await request(member, '/children/import', {
      method: 'POST',
      body: JSON.stringify({ code: child.shareCode }),
    })).status).toBe(200);
    const draftResponse = await request(owner, `/children/${child.id}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ unlockExt: false }),
    });
    const draft = assessmentCreateResponseSchema.parse(await draftResponse.json()).assessment;

    expect((await request(owner, `/children/${child.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await request(member, `/children/${child.id}`)).status).toBe(404);
    expect((await request(owner, `/assessments/${draft.id}`)).status).toBe(404);
  });

  it('membership のないコーチを403にし、2種類の共有コードを正しく処理する', async () => {
    const owner = await createTestClient();
    const nextOwner = await createTestClient();
    await onboard(owner);
    await onboard(nextOwner);
    const child = await createChild(owner, 'はる');

    const forbiddenResponse = await request(nextOwner, `/children/${child.id}`);
    expect(forbiddenResponse.status).toBe(403);

    const memberImport = await request(nextOwner, '/children/import', {
      method: 'POST',
      body: JSON.stringify({ code: child.shareCode }),
    });
    expect(memberImport.status).toBe(200);
    const memberImportResult = childImportResponseSchema.parse(await memberImport.json());
    expect(memberImportResult).toMatchObject({
      child: { role: 'member' },
      ownershipTransferred: false,
    });
    expect(memberImportResult.child.ownerShareCode).toBeUndefined();

    const ownerImport = await request(nextOwner, '/children/import', {
      method: 'POST',
      body: JSON.stringify({ code: child.ownerShareCode }),
    });
    expect(ownerImport.status).toBe(200);
    expect(childImportResponseSchema.parse(await ownerImport.json())).toMatchObject({
      child: { role: 'owner', ownerShareCode: child.ownerShareCode },
      ownershipTransferred: true,
    });

    const formerOwnerDetail = await request(owner, `/children/${child.id}`);
    expect(childDetailResponseSchema.parse(await formerOwnerDetail.json()).child.role).toBe('member');
    expect((await request(owner, `/children/${child.id}`, { method: 'DELETE' })).status).toBe(403);
  });

  it('アーカイブ中は一覧から外して書き込みを拒否し、復元後に下書きを破棄できる', async () => {
    const client = await createTestClient();
    await onboard(client);
    const child = await createChild(client, 'あおい');
    const createResponse = await request(client, `/children/${child.id}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ unlockExt: false }),
    });
    const assessment = assessmentCreateResponseSchema.parse(await createResponse.json()).assessment;

    const archiveResponse = await request(client, `/children/${child.id}/archive`, { method: 'POST' });
    expect(archiveResponse.status).toBe(200);
    expect(childDetailResponseSchema.parse(await archiveResponse.json()).child.archivedAt).not.toBeNull();

    const activeResponse = await request(client, '/children');
    expect(childrenResponseSchema.parse(await activeResponse.json()).children.some(({ id }) => id === child.id)).toBe(false);
    const archivedResponse = await request(client, '/children?archived=1');
    expect(childrenResponseSchema.parse(await archivedResponse.json()).children.some(({ id }) => id === child.id)).toBe(true);

    const archivedPatch = await request(client, `/assessments/${assessment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { memo: '保存できない内容' }, updatedAt: assessment.updatedAt }),
    });
    expect(archivedPatch.status).toBe(409);

    const restoreResponse = await request(client, `/children/${child.id}/unarchive`, { method: 'POST' });
    expect(restoreResponse.status).toBe(200);
    const draftDeletion = await request(client, `/assessments/${assessment.id}`, { method: 'DELETE' });
    expect(draftDeletion.status).toBe(204);
  });

  it('存在しない日付とマスタ外のつまずきを400で拒否する', async () => {
    const client = await createTestClient();
    await onboard(client);
    const invalidChild = await request(client, '/children', {
      method: 'POST',
      body: JSON.stringify({
        name: '無効日付',
        honorific: 'san',
        gradeCode: 'e1',
        joinedOn: '2026-02-30',
        goals: [],
      }),
    });
    expect(invalidChild.status).toBe(400);

    const child = await createChild(client, '入力検証');
    const createResponse = await request(client, `/children/${child.id}/assessments`, {
      method: 'POST',
      body: JSON.stringify({ unlockExt: false }),
    });
    const assessment = assessmentCreateResponseSchema.parse(await createResponse.json()).assessment;
    const invalidAssessment = await request(client, `/assessments/${assessment.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        assessedOn: '2026-09-31',
        data: { observations: { post: ['マスタにない見えた動作'] } },
        updatedAt: assessment.updatedAt,
      }),
    });
    expect(invalidAssessment.status).toBe(400);
  });
});
