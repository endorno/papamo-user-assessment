import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import { createAssessment } from '../services/assessments';
import { createChild } from '../services/children';
import { upsertCoach } from '../services/coaches';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe('D1データ制約', () => {
  it('外部キー・役割・単一オーナーをDBで保証する', async () => {
    const owner = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const anotherCoach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const child = await createChild(testEnv, owner.id, {
      name: '制約確認',
      honorific: 'san',
      gender: 'unspecified',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
    });
    const now = new Date().toISOString();

    await expect(testEnv.DB.prepare(
      'INSERT INTO child_coaches (child_id, coach_id, role, created_at) VALUES (?, ?, ?, ?)',
    ).bind(child.id, crypto.randomUUID(), 'member', now).run()).rejects.toThrow(/FOREIGN KEY/);

    await expect(testEnv.DB.prepare(
      'INSERT INTO child_coaches (child_id, coach_id, role, created_at) VALUES (?, ?, ?, ?)',
    ).bind(child.id, anotherCoach.id, 'invalid', now).run()).rejects.toThrow(/CHECK constraint/);

    await expect(testEnv.DB.prepare(
      'INSERT INTO child_coaches (child_id, coach_id, role, created_at) VALUES (?, ?, ?, ?)',
    ).bind(child.id, anotherCoach.id, 'owner', now).run()).rejects.toThrow(/UNIQUE constraint/);

    await expect(testEnv.DB.prepare(
      'UPDATE children SET gender = ? WHERE id = ?',
    ).bind('unknown', child.id).run()).rejects.toThrow(/CHECK constraint/);

    await expect(testEnv.DB.prepare(
      'UPDATE children SET honorific = ? WHERE id = ?',
    ).bind('none', child.id).run()).rejects.toThrow(/CHECK constraint/);
  });

  it('子どもごとの下書き1件をDBで保証する', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const child = await createChild(testEnv, coach.id, {
      name: '下書き制約',
      honorific: 'chan',
      gender: 'unspecified',
      gradeCode: 'k2',
      joinedOn: '2026-09-01',
    });
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await expect(testEnv.DB.prepare(`
      INSERT INTO assessments (
        id, child_id, seq_no, status, assessed_on, coach_id, unlock_ext,
        prev_assessment_id, master_version, data, revision, mutation_id,
        created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, 'draft', '2026-09-12', ?, 0, NULL, 'test', '{}', 1, ?, ?, ?, NULL)
    `).bind(id, child.id, 2, coach.id, id, now, now).run()).rejects.toThrow(/UNIQUE constraint/);

    await expect(testEnv.DB.prepare(`
      INSERT INTO reports (
        id, assessment_id, assessment_revision, generator, content, created_at, updated_at
      ) VALUES (?, ?, 1, 'rule_v1', '{}', ?, ?)
    `).bind(crypto.randomUUID(), assessment.id, now, now).run()).rejects.toThrow(/revision mismatch/);
  });
});
