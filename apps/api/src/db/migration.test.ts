import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

describe('D1初期マイグレーション', () => {
  it('最終スキーマとレポート整合性トリガーを空のDBへ構築する', async () => {
    expect(testEnv.TEST_MIGRATIONS.map(({ name }) => name)).toEqual([
      '0000_initial_schema.sql',
      '0001_report_consistency_triggers.sql',
      '0002_report_assessment_input.sql',
    ]);

    await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);

    const childColumns = await testEnv.DB.prepare('PRAGMA table_info(children)').all<{ name: string }>();
    expect(childColumns.results.map(({ name }) => name)).toContain('gender');
    expect(childColumns.results.map(({ name }) => name)).not.toContain('goals');
    expect(childColumns.results.map(({ name }) => name)).toContain('joined_month');
    expect(childColumns.results.map(({ name }) => name)).not.toContain('joined_on');

    const reportColumns = await testEnv.DB.prepare('PRAGMA table_info(reports)').all<{ name: string }>();
    expect(reportColumns.results.map(({ name }) => name)).toContain('assessment_input');

    const triggers = await testEnv.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'trigger'
      ORDER BY name
    `).all<{ name: string }>();
    expect(triggers.results.map(({ name }) => name)).toEqual([
      'reports_assessment_consistency_insert',
      'reports_assessment_consistency_update',
    ]);
  });
});
