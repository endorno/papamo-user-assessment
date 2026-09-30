import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import { createChild, getChildForCoach, importChild, setArchiveState } from './children';
import { upsertCoach } from './coaches';
import {
  AssessmentServiceError,
  completeAssessment,
  createAssessment,
  deleteAssessment,
  getAssessment,
  getReport,
  patchAssessment,
  revertAssessment,
} from './assessments';
import type { Env } from '../env';

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
});

type TestCoach = Awaited<ReturnType<typeof upsertCoach>>;

async function createFixture(name = 'ゆい') {
  const coach = await upsertCoach(testEnv, {
    id: crypto.randomUUID(),
    email: `${crypto.randomUUID()}@example.com`,
  });
  const child = await createChild(testEnv, coach.id, {
    name,
    honorific: 'chan',
    gender: 'unspecified',
    gradeCode: 'k2',
    joinedMonth: '2026-09',
  });
  return { coach, child };
}

function completedInput(unlockExt = false) {
  return {
    lv: {
      post: 3,
      eyeh: 4,
      hand: 5,
      ...(unlockExt ? { sacc: 6, inhi: 7 } : {}),
    },
    observations: {},
    troubles: ['転びやすい・つまずきやすい'],
    ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
    ppiNote: '',
    memo: '',
  };
}

async function saveCompletedInput(
  coach: TestCoach,
  assessment: Awaited<ReturnType<typeof createAssessment>>,
  unlockExt = false,
) {
  return patchAssessment(testEnv, assessment.id, coach.id, {
    data: completedInput(unlockExt),
    updatedAt: assessment.updatedAt,
  });
}

describe('アセスメントサービス', () => {
  it('下書きを完了してレポートを作り、後続回ができると前回を編集できない', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const child = await createChild(testEnv, coach.id, {
      name: 'ゆい',
      honorific: 'chan',
      gender: 'unspecified',
      gradeCode: 'k2',
      joinedMonth: '2026-09',
    });
    const created = await createAssessment(testEnv, child.id, coach.id, false);
    const draft = JSON.parse(created.data) as {
      lv: Record<string, number | undefined>;
      observations: Record<string, string[]>;
      troubles: string[];
      ppi: Record<string, number | undefined>;
      ppiNote: string;
      memo: string;
    };
    draft.lv = { post: 3, eyeh: 4, hand: 5 };
    draft.ppi = { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 };
    draft.troubles = ['転びやすい・つまずきやすい'];
    const saved = await patchAssessment(testEnv, created.id, coach.id, {
      data: draft,
      updatedAt: created.updatedAt,
    });
    const completedResult = await completeAssessment(testEnv, created.id, coach);

    expect(completedResult.report.kind).toBe('first');
    expect(completedResult.childId).toBe(child.id);
    expect(await getReport(testEnv, created.id, coach.id)).toMatchObject({ report: { kind: 'first' } });
    const completed = await getAssessment(testEnv, created.id, coach.id);
    expect(completed.data.copm).toEqual([]);
    const detail = await getChildForCoach(testEnv, child.id, coach.id);
    expect(detail?.latestReport?.header.seqNo).toBe(1);
    expect(detail?.assessments[0]?.reportAvailable).toBe(true);

    const next = await createAssessment(testEnv, child.id, coach.id, false);
    await expect(
      patchAssessment(testEnv, created.id, coach.id, {
        data: saved.data,
        updatedAt: saved.updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(deleteAssessment(testEnv, created.id, coach.id)).rejects.toBeInstanceOf(AssessmentServiceError);
    expect(next.seqNo).toBe(2);
  });

  it('アーカイブ中はアセスメントの書き込みを拒否し、復元後は操作できる', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const child = await createChild(testEnv, coach.id, {
      name: 'そうた',
      honorific: 'kun',
      gender: 'unspecified',
      gradeCode: 'e1',
      joinedMonth: '2026-09',
    });
    const draft = await createAssessment(testEnv, child.id, coach.id, false);
    await setArchiveState(testEnv, child.id, true);
    await expect(deleteAssessment(testEnv, draft.id, coach.id)).rejects.toMatchObject({ code: 'conflict' });
    await setArchiveState(testEnv, child.id, false);
    await deleteAssessment(testEnv, draft.id, coach.id);
  });

  it('同じ子どもに下書きを2件作成できない', async () => {
    const { coach, child } = await createFixture('はな');
    await createAssessment(testEnv, child.id, coach.id, false);

    await expect(createAssessment(testEnv, child.id, coach.id, false)).rejects.toMatchObject({
      code: 'conflict',
      message: '入力中のアセスメントがすでにあります。',
    });
  });

  it('必須のLv・PPIが揃わない状態では完了できない', async () => {
    const { coach, child } = await createFixture('めい');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const missingLevel = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: {
        ...completedInput(),
        lv: { post: 3, eyeh: 4 },
      },
      updatedAt: assessment.updatedAt,
    });
    await expect(completeAssessment(testEnv, assessment.id, coach)).rejects.toMatchObject({ code: 'validation' });

    const missingPpi = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: {
        ...completedInput(),
        ppi: { time: 0, emo: 1, soc: 2, fut: 3 },
      },
      updatedAt: missingLevel.updatedAt,
    });
    await expect(completeAssessment(testEnv, assessment.id, coach)).rejects.toMatchObject({ code: 'validation' });

    // 到達が Lv0 でも、選ばれてさえいれば完了できる。
    await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completedInput(), lv: { post: 0, eyeh: 0, hand: 5 } },
      updatedAt: missingPpi.updatedAt,
    });
    const { report } = await completeAssessment(testEnv, assessment.id, coach);
    expect(report.levels.map(({ key, lv }) => [key, lv])).toEqual([['post', 0], ['eyeh', 0], ['hand', 5]]);
  });

  it('古い更新日時による上書きを競合として拒否する', async () => {
    const { coach, child } = await createFixture('えま');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { memo: '先に保存された内容' },
      updatedAt: assessment.updatedAt,
    });

    await expect(patchAssessment(testEnv, assessment.id, coach.id, {
      data: { memo: '古い画面からの内容' },
      updatedAt: assessment.updatedAt,
    })).rejects.toMatchObject({
      code: 'conflict',
      message: '他のコーチが更新しました。読み込み直してください。',
    });
  });

  it('同じ版への同時保存は一方だけを反映する', async () => {
    const { coach, child } = await createFixture('すず');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const results = await Promise.allSettled([
      patchAssessment(testEnv, assessment.id, coach.id, {
        data: { memo: 'コーチAの入力' },
        updatedAt: assessment.updatedAt,
      }),
      patchAssessment(testEnv, assessment.id, coach.id, {
        data: { memo: 'コーチBの入力' },
        updatedAt: assessment.updatedAt,
      }),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'conflict' } });
    expect((await getAssessment(testEnv, assessment.id, coach.id)).data.memo).toMatch(/コーチ[AB]の入力/);
  });

  it('4・5種目目の開放を子どもに引き継ぎ、次回も5種目で開始する', async () => {
    const { coach, child } = await createFixture('ひな');
    const first = await createAssessment(testEnv, child.id, coach.id, true);
    const saved = await saveCompletedInput(coach, first, true);
    await completeAssessment(testEnv, first.id, coach, saved.updatedAt);

    expect((await getChildForCoach(testEnv, child.id, coach.id))?.extUnlocked).toBe(true);
    const next = await createAssessment(testEnv, child.id, coach.id, false);
    expect(next.unlockExt).toBe(true);
    expect((await getAssessment(testEnv, next.id, coach.id)).previous).toMatchObject({
      seqNo: 1,
      lv: { post: 3, eyeh: 4, hand: 5, sacc: 6, inhi: 7 },
      ppi: { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 },
    });
  });

  it('完了後の自動保存は入力だけを記録し、レポートは更新ボタンまで変えない', async () => {
    const { coach, child } = await createFixture('りお');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const saved = await saveCompletedInput(coach, assessment);
    await completeAssessment(testEnv, assessment.id, coach, saved.updatedAt);
    const completed = await getAssessment(testEnv, assessment.id, coach.id);
    expect(completed.reported?.data.lv.post).toBe(3);

    const edited = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completed.data, lv: { ...completed.data.lv, post: 10 } },
      updatedAt: completed.updatedAt,
    });

    expect(edited).toMatchObject({ status: 'done', data: { lv: { post: 10 } }, reported: { data: { lv: { post: 3 } } } });
    const { report, childId, hasUnreportedChanges } = await getReport(testEnv, assessment.id, coach.id);
    expect(report.levels.find(({ key }) => key === 'post')?.lv).toBe(3);
    expect(childId).toBe(child.id);
    expect(hasUnreportedChanges).toBe(true);
    const detail = await getChildForCoach(testEnv, child.id, coach.id);
    expect(detail?.assessments[0]).toMatchObject({ hasUnreportedChanges: true, reportAvailable: true });
    // 子どもページはレポートに反映した内容で見せる。
    expect(detail?.latestAssessment?.lv.post).toBe(3);
  });

  it('レポートを更新すると、押したコーチが担当になり、そのときの入力で作り直す', async () => {
    const { coach, child } = await createFixture('いつき');
    const colleague = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    await testEnv.DB.prepare('UPDATE coaches SET display_name = ? WHERE id = ?').bind('となりのコーチ', colleague.id).run();
    const detailForShare = await getChildForCoach(testEnv, child.id, coach.id);
    await importChild(testEnv, colleague.id, detailForShare!.shareCode);

    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const saved = await saveCompletedInput(coach, assessment);
    await completeAssessment(testEnv, assessment.id, coach, saved.updatedAt);
    const completed = await getAssessment(testEnv, assessment.id, colleague.id);
    const edited = await patchAssessment(testEnv, assessment.id, colleague.id, {
      data: { ...completed.data, lv: { ...completed.data.lv, post: 10 } },
      updatedAt: completed.updatedAt,
    });
    // 自動保存だけでは担当は変わらない。
    expect(edited.coachId).toBe(coach.id);

    const updated = await completeAssessment(testEnv, assessment.id, { ...colleague, displayName: 'となりのコーチ' }, edited.updatedAt);
    expect(updated.report.levels.find(({ key }) => key === 'post')?.lv).toBe(10);
    expect(updated.report.header.coachName).toBe('となりのコーチ');
    expect(updated.hasUnreportedChanges).toBe(false);
    const after = await getAssessment(testEnv, assessment.id, coach.id);
    expect(after).toMatchObject({ coachId: colleague.id, reported: { data: { lv: { post: 10 } } } });
    expect((await getReport(testEnv, assessment.id, coach.id)).hasUnreportedChanges).toBe(false);
  });

  it('レポート作成時の内容に戻すと、未反映の変更がなくなる', async () => {
    const { coach, child } = await createFixture('うた');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const saved = await saveCompletedInput(coach, assessment);
    await completeAssessment(testEnv, assessment.id, coach, saved.updatedAt);
    const completed = await getAssessment(testEnv, assessment.id, coach.id);
    const edited = await patchAssessment(testEnv, assessment.id, coach.id, {
      assessedOn: '2026-08-01',
      data: { ...completed.data, memo: 'あとから書き足した所見', troubles: [] },
      updatedAt: completed.updatedAt,
    });

    await expect(revertAssessment(testEnv, assessment.id, coach.id, completed.updatedAt))
      .rejects.toMatchObject({ code: 'conflict' });
    const reverted = await revertAssessment(testEnv, assessment.id, coach.id, edited.updatedAt);

    expect(reverted).toMatchObject({
      assessedOn: completed.assessedOn,
      data: { memo: '', troubles: ['転びやすい・つまずきやすい'] },
    });
    expect((await getReport(testEnv, assessment.id, coach.id)).hasUnreportedChanges).toBe(false);
  });

  it('前の回に未反映の変更が残っている間は、次の回を始められない', async () => {
    const { coach, child } = await createFixture('こはる');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const saved = await saveCompletedInput(coach, assessment);
    await completeAssessment(testEnv, assessment.id, coach, saved.updatedAt);
    const completed = await getAssessment(testEnv, assessment.id, coach.id);
    const edited = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completed.data, memo: '未反映の所見' },
      updatedAt: completed.updatedAt,
    });

    await expect(createAssessment(testEnv, child.id, coach.id, false)).rejects.toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('第1回の入力に、レポートへ反映していない変更があります'),
    });

    await completeAssessment(testEnv, assessment.id, coach, edited.updatedAt);
    const next = await createAssessment(testEnv, child.id, coach.id, false);
    expect(next.seqNo).toBe(2);
  });

  it('文言が空の目標は下書きに残せるが、レポートを作るときは止める', async () => {
    const { coach, child } = await createFixture('なぎ');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const blankGoal = { text: '', memo: '', performance: 5, satisfaction: 5, importance: 5 };
    const saved = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completedInput(), copm: [blankGoal] },
      updatedAt: assessment.updatedAt,
    });
    expect(saved.data.copm).toEqual([blankGoal]);

    await expect(completeAssessment(testEnv, assessment.id, coach, saved.updatedAt)).rejects.toMatchObject({
      code: 'validation',
      message: '文言が空の目標があります。文言を入力するか、その目標を削除してください。',
    });

    const filled = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completedInput(), copm: [{ ...blankGoal, text: '縄跳びを跳べる　' }] },
      updatedAt: saved.updatedAt,
    });
    const { report } = await completeAssessment(testEnv, assessment.id, coach, filled.updatedAt);
    // 前回との突き合わせは文言の一致で行うため、レポートにする時点で前後の空白を落とす。
    expect(report.copm[0]?.text).toBe('縄跳びを跳べる');
    expect((await getAssessment(testEnv, assessment.id, coach.id)).data.copm[0]?.text).toBe('縄跳びを跳べる');
  });

  it('下書きの間は4・5種目目の開放を取り消し、入力済みのLvも落とす', async () => {
    const { coach, child } = await createFixture('かえで');
    const assessment = await createAssessment(testEnv, child.id, coach.id, true);
    const unlocked = await patchAssessment(testEnv, assessment.id, coach.id, {
      unlockExt: true,
      data: { lv: { post: 3, sacc: 6, inhi: 7 }, observations: { sacc: ['目だけでなく頭ごと動かして探す'] } },
      updatedAt: assessment.updatedAt,
    });
    expect(unlocked.unlockExt).toBe(true);

    const closed = await patchAssessment(testEnv, assessment.id, coach.id, {
      unlockExt: false,
      data: { lv: { post: 3, sacc: 6, inhi: 7 }, observations: { sacc: ['目だけでなく頭ごと動かして探す'] } },
      updatedAt: unlocked.updatedAt,
    });
    expect(closed.unlockExt).toBe(false);
    expect(closed.data.lv).toEqual({ post: 3 });
    expect(closed.data.observations.sacc).toBeUndefined();
  });

  it('子どもが開放済みなら下書きでも4・5種目目を閉じられない', async () => {
    const { coach, child } = await createFixture('そら');
    const first = await createAssessment(testEnv, child.id, coach.id, true);
    const saved = await saveCompletedInput(coach, first, true);
    await completeAssessment(testEnv, first.id, coach, saved.updatedAt);

    const second = await createAssessment(testEnv, child.id, coach.id, false);
    const patched = await patchAssessment(testEnv, second.id, coach.id, {
      unlockExt: false,
      data: { lv: { post: 1 } },
      updatedAt: second.updatedAt,
    });
    expect(patched.unlockExt).toBe(true);
  });
});
