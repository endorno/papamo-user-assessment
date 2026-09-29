import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import { childrenResponseSchema, MAX_ACTIVE_CHILDREN_PER_COACH, MAX_EXERCISE_LEVEL } from '@papamo/shared';
import type { Env } from '../env';
import {
  assertCanTakeChild,
  ChildLimitError,
  createChild,
  deleteChildBeforeFirstReport,
  getChildForCoach,
  importChild,
  listChildren,
  patchChild,
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
    gender: 'unspecified',
    gradeCode: 'k2',
    joinedMonth: '2026-01',
  });
  return { coach, child };
}

function saveCompletedInput(
  coach: Awaited<ReturnType<typeof upsertCoach>>,
  assessment: Awaited<ReturnType<typeof createAssessment>>,
  goal?: string,
) {
  return patchAssessment(testEnv, assessment.id, coach.id, {
    data: {
      lv: { post: 3, eyeh: 4, hand: 5 },
      observations: {},
      troubles: ['転びやすい・つまずきやすい'],
      copm: goal ? [{ text: goal, memo: '', performance: 3, satisfaction: 3, importance: 8 }] : [],
      ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
      ppiNote: '',
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
      gender: 'unspecified',
      gradeCode: 'e1',
      joinedMonth: '2026-09',
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
      gender: 'unspecified',
      gradeCode: 'e2',
      joinedMonth: '2026-09',
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
      gender: 'unspecified',
      gradeCode: 'k3',
      joinedMonth: '2026-09',
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

  it('最初のレポート作成前なら下書きと共有先を含めて完全に削除できる', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const emptyChild = await createChild(testEnv, coach.id, {
      name: 'みお',
      honorific: 'chan',
      gender: 'unspecified',
      gradeCode: 'k1',
      joinedMonth: '2026-09',
    });
    const draftingChild = await createChild(testEnv, coach.id, {
      name: 'なお',
      honorific: 'san',
      gender: 'unspecified',
      gradeCode: 'j1',
      joinedMonth: '2026-09',
    });
    const member = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    await importChild(testEnv, member.id, draftingChild.shareCode);
    const draft = await createAssessment(testEnv, draftingChild.id, coach.id, false);

    expect(await deleteChildBeforeFirstReport(testEnv, emptyChild.id)).toBe(true);
    expect(await getChildForCoach(testEnv, emptyChild.id, coach.id)).toBeNull();
    expect(await deleteChildBeforeFirstReport(testEnv, draftingChild.id)).toBe(true);
    expect(await getChildForCoach(testEnv, draftingChild.id, coach.id)).toBeNull();
    expect(await getChildForCoach(testEnv, draftingChild.id, member.id)).toBeNull();
    expect(await testEnv.DB.prepare('SELECT id FROM assessments WHERE id = ?').bind(draft.id).first()).toBeNull();
  });

  it('一覧に下書きのIDを載せ、期限超過が大きい子どもを先に並べる', async () => {
    const coachId = crypto.randomUUID();
    await upsertCoach(testEnv, { id: coachId, email: `${coachId}@example.com` });
    const base = { honorific: 'chan' as const, gender: 'unspecified' as const, gradeCode: 'k2' as const, joinedMonth: '2026-01' };
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
          observations: {},
          observationNotes: {},
          engagement: {},
          envSupports: [],
          troubles: [],
          wants: [],
          copm: [],
          ppi: { time: 0, emo: 0, soc: 0, fut: 0, nav: 0 },
          ppiNote: '',
          memo: '',
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

  it('未実施・実施不可・種目上限の到達値を載せても一覧レスポンスが検証を通る', async () => {
    const { coach, child } = await createFixture('こはる');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    await patchAssessment(testEnv, assessment.id, coach.id, {
      // -1 実施不可 / 0 未実施 / 種目ごとの上限、の3つをまとめて確認する。
      data: { lv: { post: MAX_EXERCISE_LEVEL, eyeh: 0, hand: -1 } },
      updatedAt: assessment.updatedAt,
    });

    const children = await listChildren(testEnv, coach.id, false);
    expect(() => childrenResponseSchema.parse({ children })).not.toThrow();
    const listed = children.find(({ id }) => id === child.id);
    expect(listed?.latestAssessment?.lv).toEqual({ post: MAX_EXERCISE_LEVEL, eyeh: 0, hand: -1 });
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

  it('子ども詳細の目標には最新の完了アセスメントの目標を表示する', async () => {
    const { coach, child } = await createFixture('もも');
    const first = await createAssessment(testEnv, child.id, coach.id, false);
    const firstSaved = await saveCompletedInput(coach, first, '姿勢を安定させる');
    await completeAssessment(testEnv, first.id, coach, firstSaved.updatedAt);

    const second = await createAssessment(testEnv, child.id, coach.id, false);
    const secondSaved = await saveCompletedInput(coach, second, '着替えを自分でする');
    await completeAssessment(testEnv, second.id, coach, secondSaved.updatedAt);

    const detail = await getChildForCoach(testEnv, child.id, coach.id);
    expect(detail?.assessments.at(-1)?.goals).toEqual(['着替えを自分でする']);
  });

  it('下書きの目標は子ども詳細に反映しない', async () => {
    const { coach, child } = await createFixture('みなと');
    const first = await createAssessment(testEnv, child.id, coach.id, false);
    const firstSaved = await saveCompletedInput(coach, first, '姿勢を安定させる');
    await completeAssessment(testEnv, first.id, coach, firstSaved.updatedAt);

    const draft = await createAssessment(testEnv, child.id, coach.id, false);
    await saveCompletedInput(coach, draft, '着替えを自分でする');

    const detail = await getChildForCoach(testEnv, child.id, coach.id);
    expect(detail?.assessments.find(({ id }) => id === first.id)?.goals).toEqual(['姿勢を安定させる']);
    expect(detail?.assessments.find(({ id }) => id === draft.id)?.goals).toEqual([]);
  });

  it('性別と敬称をそれぞれ独立して保存できる', async () => {
    const { coach, child } = await createFixture('かなた');
    expect(child.gender).toBe('unspecified');

    // 女の子でも「くん」と呼ぶ家庭があるため、性別と敬称は連動させない。
    await patchChild(testEnv, child.id, { gender: 'girl' });
    expect((await getChildForCoach(testEnv, child.id, coach.id))?.gender).toBe('girl');

    await patchChild(testEnv, child.id, { honorific: 'kun' });
    const updated = await getChildForCoach(testEnv, child.id, coach.id);
    expect(updated).toMatchObject({ gender: 'girl', honorific: 'kun' });

    await patchChild(testEnv, child.id, { name: 'かなで' });
    expect((await getChildForCoach(testEnv, child.id, coach.id))?.gender).toBe('girl');
  });

  it(`担当は${MAX_ACTIVE_CHILDREN_PER_COACH}名まで。上限でも一覧を取得でき、アーカイブすれば空きができる`, async () => {
    const coach = await upsertCoach(testEnv, { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` });
    const otherOwner = await upsertCoach(testEnv, { id: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.com` });
    const input = { honorific: 'chan' as const, gender: 'unspecified' as const, gradeCode: 'k2' as const, joinedMonth: '2026-01' };
    const shared = await createChild(testEnv, otherOwner.id, { ...input, name: '共有される子' });
    const created = [];
    for (let index = 0; index < MAX_ACTIVE_CHILDREN_PER_COACH; index += 1) {
      created.push(await createChild(testEnv, coach.id, { ...input, name: `上限確認${index}` }));
    }
    // 子どものIDを IN に並べると D1 のバインド変数の上限（100）に当たる。上限ちょうどでも一覧を返せること。
    expect(await listChildren(testEnv, coach.id, false)).toHaveLength(MAX_ACTIVE_CHILDREN_PER_COACH);

    await expect(createChild(testEnv, coach.id, { ...input, name: '上限超え' })).rejects.toBeInstanceOf(ChildLimitError);
    expect(await importChild(testEnv, coach.id, shared.shareCode)).toEqual({ kind: 'limit' });

    await setArchiveState(testEnv, created[0]!.id, true);
    // 復元は空きがあるときだけ（ルートで確認する）。
    await expect(assertCanTakeChild(testEnv, coach.id)).resolves.toBeUndefined();
    expect(await importChild(testEnv, coach.id, shared.shareCode)).toMatchObject({ kind: 'member' });
    await expect(assertCanTakeChild(testEnv, coach.id)).rejects.toBeInstanceOf(ChildLimitError);
    // すでに担当している子のオーナーを引き継ぐだけなら人数は増えないので、上限でも受け付ける。
    expect(await importChild(testEnv, coach.id, shared.ownerShareCode!)).toMatchObject({ kind: 'owner' });
  }, 60000);
});
