import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

describe('レポート作成時の入力の追加（0002）', () => {
  it('追加前に作られたレポートへ、同じ版のアセスメント入力を埋める', async () => {
    const [initial, triggers] = testEnv.TEST_MIGRATIONS;
    await applyD1Migrations(testEnv.DB, [initial!, triggers!]);
    const now = '2026-09-01T00:00:00.000Z';
    const data = JSON.stringify({ lv: { post: 3 }, troubles: [], memo: '' });
    await testEnv.DB.batch([
      testEnv.DB.prepare('INSERT INTO coaches (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind('coach-1', 'coach@example.com', 'コーチ', now, now),
      testEnv.DB.prepare(`INSERT INTO children (id, share_code, owner_share_code, created_by, name, honorific, gender,
        grade_code, grade_base_year, joined_month, ext_unlocked, archived_at, created_at, updated_at)
        VALUES ('child-1', 'ABCDEFGH', 'HGFEDCBA', 'coach-1', 'ゆい', 'chan', 'unspecified', 'e1', 2026, '2026-04', 0, NULL, ?, ?)`)
        .bind(now, now),
      ...(['done-1', 'done-2'] as const).map((id, index) => testEnv.DB.prepare(`INSERT INTO assessments (id, child_id, seq_no,
        status, assessed_on, coach_id, unlock_ext, prev_assessment_id, master_version, data, revision, mutation_id,
        created_at, updated_at, completed_at)
        VALUES (?, 'child-1', ?, 'done', '2026-09-01', 'coach-1', ?, NULL, 'test', ?, 2, ?, ?, ?, ?)`)
        .bind(id, index + 1, index, data, id, now, now, now)),
      testEnv.DB.prepare(`INSERT INTO reports (id, assessment_id, assessment_revision, generator, content, created_at, updated_at)
        VALUES ('report-1', 'done-1', 2, 'rule_v1', '{}', ?, ?)`).bind(now, now),
      testEnv.DB.prepare(`INSERT INTO reports (id, assessment_id, assessment_revision, generator, content, created_at, updated_at)
        VALUES ('report-2', 'done-2', 2, 'rule_v1', '{}', ?, ?)`).bind(now, now),
      // 版がずれた行は、どの入力で作ったか分からないので埋めない。
      testEnv.DB.prepare(`UPDATE assessments SET revision = 3 WHERE id = 'done-2'`),
    ]);

    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);

    const rows = await testEnv.DB.prepare('SELECT id, assessment_input FROM reports ORDER BY id')
      .all<{ id: string; assessment_input: string | null }>();
    expect(rows.results[0]?.assessment_input && JSON.parse(rows.results[0].assessment_input)).toEqual({
      assessedOn: '2026-09-01',
      unlockExt: false,
      data: { lv: { post: 3 }, troubles: [], memo: '' },
    });
    expect(rows.results[1]?.assessment_input).toBeNull();
  });
});
