import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

describe('データ整合性マイグレーション', () => {
  it('既存データを保持したまま制約とrevisionを追加する', async () => {
    const initialMigrations = testEnv.TEST_MIGRATIONS.filter(({ name }) => (
      name.startsWith('0000_') || name.startsWith('0001_')
    ));
    const integrityMigration = testEnv.TEST_MIGRATIONS.find(({ name }) => name.startsWith('0002_'));
    expect(integrityMigration).toBeDefined();
    await applyD1Migrations(testEnv.DB, initialMigrations);

    const coachId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const assessmentId = crypto.randomUUID();
    const reportId = crypto.randomUUID();
    const now = '2026-09-12T00:00:00.000Z';
    await testEnv.DB.batch([
      testEnv.DB.prepare('INSERT INTO coaches VALUES (?, ?, ?, ?, ?)').bind(coachId, 'coach@example.com', '確認コーチ', now, now),
      testEnv.DB.prepare('INSERT INTO children VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
        childId, 'ABCDEFGH', 'JKLMNPQR', coachId, '移行確認', 'san', 'e1', 2026,
        '2026-09-01', 0, '[]', null, now, now,
      ),
      testEnv.DB.prepare('INSERT INTO child_coaches VALUES (?, ?, ?, ?)').bind(childId, coachId, 'owner', now),
      testEnv.DB.prepare('INSERT INTO assessments VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(
        assessmentId, childId, 1, 'done', '2026-09-12', coachId, 0, null,
        '2026-09', '{}', now, now, now,
      ),
      testEnv.DB.prepare('INSERT INTO reports VALUES (?, ?, ?, ?, ?, ?)').bind(
        reportId, assessmentId, 'rule_v1', '{}', now, now,
      ),
    ]);

    await applyD1Migrations(testEnv.DB, [integrityMigration!]);

    const migrated = await testEnv.DB.prepare(`
      SELECT assessments.revision,
             assessments.mutation_id,
             reports.assessment_revision
      FROM assessments
      INNER JOIN reports ON reports.assessment_id = assessments.id
      WHERE assessments.id = ?
    `).bind(assessmentId).first<{
      revision: number;
      mutation_id: string;
      assessment_revision: number;
    }>();
    expect(migrated).toEqual({
      revision: 1,
      mutation_id: assessmentId,
      assessment_revision: 1,
    });
    await expect(
      testEnv.DB.prepare('DELETE FROM children WHERE id = ?').bind(childId).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
