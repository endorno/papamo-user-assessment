import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import {
  createChild,
  importChild,
  listChildren,
} from './children';
import { upsertCoach } from './coaches';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

describe('子ども管理サービス', () => {
  it('通常コードで参加し、オーナーコードで移譲できる', async () => {
    const ownerId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    await upsertCoach(testEnv, { id: ownerId, email: `${ownerId}@example.com` });
    await upsertCoach(testEnv, { id: memberId, email: `${memberId}@example.com` });

    const created = await createChild(testEnv, ownerId, {
      name: 'はると',
      honorific: 'kun',
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
      goals: ['姿勢を安定させたい'],
    });

    const joined = await importChild(testEnv, memberId, created.shareCode);
    expect(joined.kind).toBe('member');

    const transferred = await importChild(testEnv, memberId, created.ownerShareCode!);
    expect(transferred.kind).toBe('owner');

    const ownerChildren = await listChildren(testEnv, ownerId, false);
    const memberChildren = await listChildren(testEnv, memberId, false);
    expect(ownerChildren[0]?.role).toBe('member');
    expect(memberChildren[0]?.role).toBe('owner');
    expect(memberChildren[0]?.ownerShareCode).toBe(created.ownerShareCode);
  });
});
