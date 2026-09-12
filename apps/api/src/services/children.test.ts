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
import { completeAssessment, createAssessment, patchAssessment } from './assessments';
import { upsertCoach } from './coaches';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

async function createFixture(name: string) {
  const coach = await upsertCoach(testEnv, {
    id: crypto.randomUUID(),
    email: `${crypto.randomUUID()}@example.com`,
  });
  const child = await createChild(testEnv, coach.id, {
    name,
    honorific: 'chan',
    gradeCode: 'k2',
    joinedOn: '2026-01-05',
    goals: [],
  });
  return { coach, child };
}

function saveCompletedInput(
  coach: Awaited<ReturnType<typeof upsertCoach>>,
  assessment: Awaited<ReturnType<typeof createAssessment>>,
) {
  return patchAssessment(testEnv, assessment.id, coach.id, {
    data: {
      lv: { post: 3, eyeh: 4, hand: 5 },
      errs: {},
      troubles: ['転びやすい・つまずきやすい'],
      ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
      ppiNote: '',
      plan: 'pre',
      memo: '',
    },
    updatedAt: assessment.updatedAt,
  });
}

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

  it('一覧に下書きのIDを載せ、期限超過が大きい子どもを先に並べる', async () => {
    const coachId = crypto.randomUUID();
    await upsertCoach(testEnv, { id: coachId, email: `${coachId}@example.com` });
    const base = { honorific: 'chan' as const, gradeCode: 'k2' as const, joinedOn: '2026-01-05', goals: [] };
    const drafting = await createChild(testEnv, coachId, { ...base, name: 'あさひ' });
    const slightlyOverdue = await createChild(testEnv, coachId, { ...base, name: 'いおり' });
    const longOverdue = await createChild(testEnv, coachId, { ...base, name: 'うみ' });

    const draft = await createAssessment(testEnv, drafting.id, coachId, false);
    for (const [child, assessedOn] of [[slightlyOverdue, '2026-06-01'], [longOverdue, '2024-01-10']] as const) {
      await testEnv.DB.prepare(
        `INSERT INTO assessments (id, child_id, seq_no, status, assessed_on, coach_id, unlock_ext, prev_assessment_id,
           master_version, data, revision, mutation_id, created_at, updated_at, completed_at)
         VALUES (?, ?, 1, 'done', ?, ?, 0, NULL, 'test', ?, 1, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        child.id,
        assessedOn,
        coachId,
        JSON.stringify({
          lv: { post: 1, eyeh: 1, hand: 1 },
          errs: {},
          troubles: [],
          ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
          ppiNote: '',
          plan: 'base',
          memo: '',
          goals: [],
        }),
        crypto.randomUUID(),
        '2026-01-05T00:00:00.000Z',
        '2026-01-05T00:00:00.000Z',
        '2026-01-05T00:00:00.000Z',
      ).run();
    }

    const list = await listChildren(testEnv, coachId, false);
    expect(list.map(({ name }) => name)).toEqual(['あさひ', 'うみ', 'いおり']);
    expect(list[0]?.latestAssessment?.id).toBe(draft.id);
  });

  it('回を重ねても、一覧には直近の完了回だけを反映する', async () => {
    const { coach, child } = await createFixture('のぞみ');
    const first = await createAssessment(testEnv, child.id, coach.id, false);
    await completeAssessment(testEnv, first.id, coach, (await saveCompletedInput(coach, first)).updatedAt);
    const second = await createAssessment(testEnv, child.id, coach.id, false);
    await completeAssessment(testEnv, second.id, coach, (await saveCompletedInput(coach, second)).updatedAt);

    const listed = (await listChildren(testEnv, coach.id, false)).find(({ id }) => id === child.id);
    expect(listed?.latestAssessment).toMatchObject({ id: second.id, seqNo: 2, status: 'done' });
    expect(listed?.state).toMatchObject({ key: 'ok' });
  });
});
