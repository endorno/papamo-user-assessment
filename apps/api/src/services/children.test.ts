import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import type { Env } from '../env';
import {
  createChild,
  deleteChildIfEmpty,
  getChildForCoach,
  importChild,
  listChildren,
  removeMembership,
  requireMembership,
  setArchiveState,
} from './children';
import { createAssessment } from './assessments';
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

  it('メンバーは自分の紐づきだけ解除でき、オーナーは解除できない', async () => {
    const ownerId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    await upsertCoach(testEnv, { id: ownerId, email: `${ownerId}@example.com` });
    await upsertCoach(testEnv, { id: memberId, email: `${memberId}@example.com` });
    const child = await createChild(testEnv, ownerId, {
      name: 'りく',
      honorific: 'kun',
      gradeCode: 'e2',
      joinedOn: '2026-09-01',
      goals: [],
    });
    await importChild(testEnv, memberId, child.shareCode);

    expect(await removeMembership(testEnv, child.id, ownerId)).toBe('owner');
    expect(await removeMembership(testEnv, child.id, memberId)).toBe('removed');
    expect(await requireMembership(testEnv, child.id, memberId)).toBeNull();
    expect(await requireMembership(testEnv, child.id, ownerId)).toBe('owner');
  });

  it('アーカイブした子どもを通常一覧と共有コードの取り込み対象から外す', async () => {
    const ownerId = crypto.randomUUID();
    const newCoachId = crypto.randomUUID();
    await upsertCoach(testEnv, { id: ownerId, email: `${ownerId}@example.com` });
    await upsertCoach(testEnv, { id: newCoachId, email: `${newCoachId}@example.com` });
    const child = await createChild(testEnv, ownerId, {
      name: 'あおい',
      honorific: 'chan',
      gradeCode: 'k3',
      joinedOn: '2026-09-01',
      goals: [],
    });

    await setArchiveState(testEnv, child.id, true);
    expect((await listChildren(testEnv, ownerId, false)).some(({ id }) => id === child.id)).toBe(false);
    expect((await listChildren(testEnv, ownerId, true)).find(({ id }) => id === child.id)).toMatchObject({
      archivedAt: expect.any(String),
      state: null,
    });
    expect(await importChild(testEnv, newCoachId, child.shareCode)).toEqual({ kind: 'not_found' });

    await setArchiveState(testEnv, child.id, false);
    expect((await listChildren(testEnv, ownerId, false)).some(({ id }) => id === child.id)).toBe(true);
  });

  it('アセスメントがない登録だけ完全に削除できる', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const emptyChild = await createChild(testEnv, coach.id, {
      name: 'みお',
      honorific: 'chan',
      gradeCode: 'k1',
      joinedOn: '2026-09-01',
      goals: [],
    });
    const assessedChild = await createChild(testEnv, coach.id, {
      name: 'なお',
      honorific: 'san',
      gradeCode: 'j1',
      joinedOn: '2026-09-01',
      goals: [],
    });
    await createAssessment(testEnv, assessedChild.id, coach.id, false);

    expect(await deleteChildIfEmpty(testEnv, emptyChild.id)).toBe(true);
    expect(await getChildForCoach(testEnv, emptyChild.id, coach.id)).toBeNull();
    expect(await deleteChildIfEmpty(testEnv, assessedChild.id)).toBe(false);
    expect(await getChildForCoach(testEnv, assessedChild.id, coach.id)).not.toBeNull();
  });
});
