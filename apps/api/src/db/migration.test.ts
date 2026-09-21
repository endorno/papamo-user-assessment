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
    const honorificMigration = testEnv.TEST_MIGRATIONS.find(({ name }) => name.startsWith('0003_'));
    const genderMigration = testEnv.TEST_MIGRATIONS.find(({ name }) => name.startsWith('0004_'));
    expect(integrityMigration).toBeDefined();
    expect(honorificMigration).toBeDefined();
    expect(genderMigration).toBeDefined();
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

    await applyD1Migrations(testEnv.DB, [honorificMigration!]);

    const preserved = await testEnv.DB.prepare(`
      SELECT children.honorific,
             child_coaches.role,
             assessments.revision,
             reports.assessment_revision
      FROM children
      INNER JOIN child_coaches ON child_coaches.child_id = children.id
      INNER JOIN assessments ON assessments.child_id = children.id
      INNER JOIN reports ON reports.assessment_id = assessments.id
      WHERE children.id = ?
    `).bind(childId).first();
    expect(preserved).toMatchObject({
      honorific: 'san',
      role: 'owner',
      revision: 1,
      assessment_revision: 1,
    });

    const honorificNoneId = crypto.randomUUID();
    await testEnv.DB.prepare(`
      INSERT INTO children (
        id, share_code, owner_share_code, created_by, name, honorific, grade_code,
        grade_base_year, joined_on, ext_unlocked, goals, archived_at, created_at, updated_at
      ) VALUES (?, 'RSTUVWXY', '23456789', ?, '敬称なし', 'none', 'e1', 2026, '2026-09-01', 0, '[]', NULL, ?, ?)
    `).bind(honorificNoneId, coachId, now, now).run();

    await applyD1Migrations(testEnv.DB, [genderMigration!]);

    // 廃止した敬称「なし」は中立な「さん」へ寄せ、性別は未選択として引き継ぐ。
    expect(await testEnv.DB.prepare(
      'SELECT honorific, gender FROM children WHERE id = ?',
    ).bind(honorificNoneId).first()).toEqual({ honorific: 'san', gender: 'unspecified' });

    const withGender = await testEnv.DB.prepare(`
      SELECT children.honorific,
             children.gender,
             child_coaches.role,
             assessments.revision,
             reports.assessment_revision
      FROM children
      INNER JOIN child_coaches ON child_coaches.child_id = children.id
      INNER JOIN assessments ON assessments.child_id = children.id
      INNER JOIN reports ON reports.assessment_id = assessments.id
      WHERE children.id = ?
    `).bind(childId).first();
    expect(withGender).toMatchObject({
      honorific: 'san',
      gender: 'unspecified',
      role: 'owner',
      revision: 1,
      assessment_revision: 1,
    });

    await expect(testEnv.DB.prepare(
      'UPDATE children SET honorific = ? WHERE id = ?',
    ).bind('none', childId).run()).rejects.toThrow(/CHECK constraint/);
    await expect(testEnv.DB.prepare(
      'UPDATE children SET gender = ? WHERE id = ?',
    ).bind('unknown', childId).run()).rejects.toThrow(/CHECK constraint/);
  });
});
