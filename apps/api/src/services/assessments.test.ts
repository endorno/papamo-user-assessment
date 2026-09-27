import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

import { createChild, getChildForCoach, setArchiveState } from './children';
import { upsertCoach } from './coaches';
import {
  AssessmentServiceError,
  completeAssessment,
  createAssessment,
  deleteAssessment,
  getAssessment,
  getReport,
  patchAssessment,
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

    // 到達が「未実施」でも、選ばれてさえいれば完了できる。
    await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completedInput(), lv: { post: 0, eyeh: -1, hand: 5 } },
      updatedAt: missingPpi.updatedAt,
    });
    const { report } = await completeAssessment(testEnv, assessment.id, coach);
    expect(report.levels.map(({ key, lv }) => [key, lv])).toEqual([['post', 0], ['eyeh', -1], ['hand', 5]]);
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

  it('次回作成前なら完了済みの自動保存と同時にレポートを再生成する', async () => {
    const { coach, child } = await createFixture('りお');
    const assessment = await createAssessment(testEnv, child.id, coach.id, false);
    const saved = await saveCompletedInput(coach, assessment);
    await completeAssessment(testEnv, assessment.id, coach, saved.updatedAt);
    const completed = await getAssessment(testEnv, assessment.id, coach.id);
    const edited = await patchAssessment(testEnv, assessment.id, coach.id, {
      data: { ...completed.data, lv: { ...completed.data.lv, post: 10 } },
      updatedAt: completed.updatedAt,
    });

    const { report, childId } = await getReport(testEnv, assessment.id, coach.id);
    expect(report.levels.find(({ key }) => key === 'post')?.lv).toBe(10);
    expect(childId).toBe(child.id);
    const revisions = await testEnv.DB.prepare(`
      SELECT assessments.revision AS assessment_revision,
             reports.assessment_revision AS report_revision
      FROM assessments
      INNER JOIN reports ON reports.assessment_id = assessments.id
      WHERE assessments.id = ?
    `).bind(assessment.id).first<{ assessment_revision: number; report_revision: number }>();
    expect(revisions?.report_revision).toBe(revisions?.assessment_revision);
    expect(edited.status).toBe('done');
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
