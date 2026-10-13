import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

describe('環境調整の廃止（0004）', () => {
  it('保存済みの入力・レポートから環境調整だけを消し、版は変えない', async () => {
    const before = testEnv.TEST_MIGRATIONS.filter(({ name }) => name < '0004');
    await applyD1Migrations(testEnv.DB, before);
    const now = '2026-10-01T00:00:00.000Z';
    const data = { lv: { post: 3 }, engagement: { dur: 2 }, envSupports: ['e-vis'], troubles: [], memo: '' };
    const { envSupports: _envSupports, ...dataWithout } = data;
    await testEnv.DB.batch([
      testEnv.DB.prepare('INSERT INTO coaches (id, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .bind('coach-1', 'coach@example.com', 'さとう', now, now),
      testEnv.DB.prepare(`INSERT INTO children (id, share_code, owner_share_code, created_by, name, honorific, gender,
        grade_code, grade_base_year, joined_month, ext_unlocked, archived_at, created_at, updated_at)
        VALUES ('child-1', 'ABCDEFGH', 'HGFEDCBA', 'coach-1', 'ゆい', 'chan', 'unspecified', 'e1', 2026, '2026-04', 0, NULL, ?, ?)`)
        .bind(now, now),
      testEnv.DB.prepare(`INSERT INTO assessments (id, child_id, seq_no, status, assessed_on, coach_id, unlock_ext,
        prev_assessment_id, master_version, data, revision, mutation_id, created_at, updated_at, completed_at)
        VALUES ('done-1', 'child-1', 1, 'done', '2026-10-01', 'coach-1', 0, NULL, 'test', ?, 2, 'm-1', ?, ?, ?)`)
        .bind(JSON.stringify(data), now, now, now),
      testEnv.DB.prepare(`INSERT INTO reports (id, assessment_id, assessment_revision, generator, content, assessment_input,
        created_at, updated_at)
        VALUES ('report-1', 'done-1', 2, 'rule_v1', ?, ?, ?, ?)`)
        .bind(
          JSON.stringify({ kind: 'first', envSupports: [{ group: '情報の入り方', items: ['視覚'] }], engagement: [] }),
          JSON.stringify({ assessedOn: '2026-10-01', unlockExt: false, data }),
          now,
          now,
        ),
    ]);

    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);

    const assessment = await testEnv.DB.prepare('SELECT data, revision, updated_at FROM assessments')
      .first<{ data: string; revision: number; updated_at: string }>();
    expect(JSON.parse(assessment!.data)).toEqual(dataWithout);
    expect(assessment).toMatchObject({ revision: 2, updated_at: now });

    const report = await testEnv.DB.prepare('SELECT content, assessment_input, assessment_revision, updated_at FROM reports')
      .first<{ content: string; assessment_input: string; assessment_revision: number; updated_at: string }>();
    expect(JSON.parse(report!.content)).toEqual({ kind: 'first', engagement: [] });
    expect(JSON.parse(report!.assessment_input)).toEqual({ assessedOn: '2026-10-01', unlockExt: false, data: dataWithout });
    expect(report).toMatchObject({ assessment_revision: 2, updated_at: now });
  });
});
