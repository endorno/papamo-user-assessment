import {
  assessmentCreateResponseSchema,
  assessmentResponseSchema,
  childResponseSchema,
} from '@papamo/shared';
import type { D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { expect } from 'vitest';

import type { Env } from '../env';
import { createApi } from '../index';
import { createAuthMiddleware } from '../middleware/auth';
import type { DriveConnector } from '../services/google-drive';
import type { ReportPdfRenderer } from '../services/report-pdf';

/** API 結合テスト用のクライアント。本番の JWKS 検証は差し替えず、テスト鍵の検証関数を注入する。 */

export const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

export interface TestClient {
  api: ReturnType<typeof createApi>;
  token: string;
  coachId: string;
  email: string;
}

// .dev.vars に本物の鍵を置いた開発機でも、テストから Googleドライブへ書き込まないよう既定では切っておく。
const driveDisabled: DriveConnector = () => null;

export async function createTestClient(
  options: { renderPdf?: ReportPdfRenderer; drive?: DriveConnector } = {},
): Promise<TestClient> {
  const coachId = crypto.randomUUID();
  const email = `${coachId}@example.com`;
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const token = await new SignJWT({ email })
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
  return { api: createApi(auth, { drive: driveDisabled, ...options }), token, coachId, email };
}

export function request(client: TestClient, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${client.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return client.api.fetch(new Request(`https://example.com/api${path}`, { ...init, headers }), testEnv);
}

export async function onboard(client: TestClient, displayName = 'テストコーチ') {
  const response = await request(client, '/me', {
    method: 'PUT',
    body: JSON.stringify({ displayName }),
  });
  expect(response.status).toBe(200);
}

export async function createChild(client: TestClient, name: string) {
  const response = await request(client, '/children', {
    method: 'POST',
    body: JSON.stringify({
      name,
      honorific: 'chan',
      gradeCode: 'k2',
      joinedMonth: '2026-09',
    }),
  });
  expect(response.status).toBe(201);
  return childResponseSchema.parse(await response.json()).child;
}

/** 3種目と PPI を埋めて完了させ、レポートのある回を作る。 */
export async function createCompletedAssessment(client: TestClient, childId: string) {
  const createResponse = await request(client, `/children/${childId}/assessments`, {
    method: 'POST',
    body: JSON.stringify({ unlockExt: false }),
  });
  const created = assessmentCreateResponseSchema.parse(await createResponse.json()).assessment;
  const patchResponse = await request(client, `/assessments/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      data: {
        lv: { post: 3, eyeh: 4, hand: 5 },
        observations: {},
        troubles: ['よく物にぶつかる・つまずく'],
        ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
        ppiNote: '',
        memo: '',
      },
      updatedAt: created.updatedAt,
    }),
  });
  const saved = assessmentResponseSchema.parse(await patchResponse.json()).assessment;
  const completeResponse = await request(client, `/assessments/${created.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ updatedAt: saved.updatedAt }),
  });
  expect(completeResponse.status).toBe(200);
  return created;
}
