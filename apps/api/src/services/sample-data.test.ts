import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import { updateCoachDisplayName, upsertCoach } from './coaches';
import { createSampleChild, sampleDataStatus } from './sample-data';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  for (let index = 1; index <= 15; index += 1) {
    const suffix = index.toString().padStart(2, '0');
    await upsertCoach(testEnv, {
      id: `seed-coach-${suffix}`,
      email: `seed-coach-${suffix}@example.invalid`,
    });
    await updateCoachDisplayName(testEnv, `seed-coach-${suffix}`, `テストコーチ${suffix}`);
  }
});

describe('非本番用サンプルデータ', () => {
  it('15名の背景コーチが揃うと生成可能になる', async () => {
    await expect(sampleDataStatus(testEnv)).resolves.toEqual({
      ready: true,
      backgroundCoachCount: 15,
      requiredBackgroundCoachCount: 15,
    });
  });

  it('長期プロフィールに6回分の完了アセスメントとレポートを作る', async () => {
    const owner = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    await updateCoachDisplayName(testEnv, owner.id, '実データ確認コーチ');

    const created = await createSampleChild(testEnv, { ...owner, displayName: '実データ確認コーチ' }, 'long', {
      now: new Date('2026-09-12T03:00:00.000Z'),
      random: () => 0.4,
    });

    const assessmentCount = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM assessments WHERE child_id = ?',
    ).bind(created.childId).first<{ count: number }>();
    const reportCount = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM reports INNER JOIN assessments ON assessments.id = reports.assessment_id WHERE assessments.child_id = ?',
    ).bind(created.childId).first<{ count: number }>();
    const membershipCount = await testEnv.DB.prepare(
      'SELECT COUNT(*) AS count FROM child_coaches WHERE child_id = ?',
    ).bind(created.childId).first<{ count: number }>();
    const latest = await testEnv.DB.prepare(
      'SELECT status, seq_no AS seqNo, data FROM assessments WHERE child_id = ? ORDER BY seq_no DESC LIMIT 1',
    ).bind(created.childId).first<{ status: string; seqNo: number; data: string }>();

    expect(assessmentCount?.count).toBe(6);
    expect(reportCount?.count).toBe(6);
    expect(membershipCount?.count).toBe(2);
    expect(latest).toMatchObject({ status: 'done', seqNo: 6 });
    expect(JSON.parse(latest!.data)).toMatchObject({
      lv: expect.objectContaining({ post: expect.any(Number), sacc: expect.any(Number) }),
      ppi: expect.objectContaining({ time: expect.any(Number), nav: expect.any(Number) }),
    });
  });
});
