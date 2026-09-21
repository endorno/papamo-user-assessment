import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import nonProductionSql from '../../seeds/non-production.sql?raw';
import resetSql from '../../seeds/reset.sql?raw';
import type { Env } from '../env';
import { createChild } from '../services/children';
import { upsertCoach } from '../services/coaches';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

// wrangler d1 execute --file と同じく、コメントを除いた1文ずつを順に流す。
const runSqlFile = async (sql: string): Promise<void> => {
  const statements = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
  for (const statement of statements) {
    await testEnv.DB.prepare(statement).run();
  }
};

const countOf = async (sql: string): Promise<number> => {
  const row = await testEnv.DB.prepare(sql).first<{ count: number }>();
  return row?.count ?? 0;
};

/** 前回の回を参照する完了アセスメントとレポートを1件ずつ作る。 */
const createFixture = async (): Promise<{ coachId: string }> => {
  const coachId = crypto.randomUUID();
  await upsertCoach(testEnv, { id: coachId, email: `${coachId}@example.com` });
  const child = await createChild(testEnv, coachId, {
    name: 'リセット確認',
    honorific: 'san',
    gender: 'unspecified',
    gradeCode: 'e1',
    joinedOn: '2026-04-01',
    goals: [],
  });
  const now = new Date().toISOString();
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();

  for (const [id, seqNo, prevId] of [[first, 1, null], [second, 2, first]] as const) {
    await testEnv.DB.prepare(
      `INSERT INTO assessments (id, child_id, seq_no, status, assessed_on, coach_id, unlock_ext,
         prev_assessment_id, master_version, data, revision, mutation_id, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, 'done', '2026-04-10', ?, 0, ?, 'test', '{}', 1, ?, ?, ?, ?)`,
    ).bind(id, child.id, seqNo, coachId, prevId, crypto.randomUUID(), now, now, now).run();
  }

  await testEnv.DB.prepare(
    `INSERT INTO reports (id, assessment_id, assessment_revision, generator, content, created_at, updated_at)
     VALUES (?, ?, 1, 'rule_v1', '{}', ?, ?)`,
  ).bind(crypto.randomUUID(), first, now, now).run();

  return { coachId };
};

describe('非本番用SQL', () => {
  it('リセットはマイグレーション直後の状態に戻す', async () => {
    await createFixture();

    await runSqlFile(resetSql);

    expect(await countOf('SELECT count(*) AS count FROM reports')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM assessments')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM child_coaches')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM children')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM coaches')).toBe(0);
  });

  it('シードは実コーチを残して背景コーチを作り直す', async () => {
    const { coachId } = await createFixture();

    await runSqlFile(nonProductionSql);

    expect(await countOf('SELECT count(*) AS count FROM reports')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM assessments')).toBe(0);
    expect(await countOf('SELECT count(*) AS count FROM children')).toBe(0);
    expect(await testEnv.DB.prepare('SELECT id FROM coaches WHERE id = ?').bind(coachId).first()).not.toBeNull();
    expect(await countOf(
      "SELECT count(*) AS count FROM coaches WHERE email LIKE 'seed-coach-%@example.invalid'",
    )).toBe(15);
  });
});
