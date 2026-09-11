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

describe('アセスメントサービス', () => {
  it('下書きを完了してレポートを作り、後続回ができると前回を編集できない', async () => {
    const coach = await upsertCoach(testEnv, {
      id: crypto.randomUUID(),
      email: `${crypto.randomUUID()}@example.com`,
    });
    const child = await createChild(testEnv, coach.id, {
      name: 'ゆい',
      honorific: 'chan',
      gradeCode: 'k2',
      joinedOn: '2026-09-01',
      goals: ['転びにくくなってほしい'],
    });
    const created = await createAssessment(testEnv, child.id, coach.id, false);
    const draft = JSON.parse(created.data) as {
      lv: Record<string, number | undefined>;
      errs: Record<string, string[]>;
      troubles: string[];
      ppi: Record<string, number | undefined>;
      ppiNote: string;
      plan: 'base' | 'select' | 'pre' | null;
      memo: string;
      goals: string[];
    };
    draft.lv = { post: 3, eyeh: 4, hand: 5 };
    draft.ppi = { time: 0, emo: 1, soc: 2, fut: 3, nav: 4 };
    draft.troubles = ['転びやすい・つまずきやすい'];
    draft.plan = 'pre';
    const saved = await patchAssessment(testEnv, created.id, coach.id, {
      data: draft,
      updatedAt: created.updatedAt,
    });
    const report = await completeAssessment(testEnv, created.id, coach);

    expect(report.kind).toBe('first');
    expect(await getReport(testEnv, created.id, coach.id)).toMatchObject({ kind: 'first' });
    const completed = await getAssessment(testEnv, created.id, coach.id);
    expect(completed.data.goals).toEqual(child.goals);
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
      gradeCode: 'e1',
      joinedOn: '2026-09-01',
      goals: [],
    });
    const draft = await createAssessment(testEnv, child.id, coach.id, false);
    await setArchiveState(testEnv, child.id, true);
    await expect(deleteAssessment(testEnv, draft.id, coach.id)).rejects.toMatchObject({ code: 'conflict' });
    await setArchiveState(testEnv, child.id, false);
    await deleteAssessment(testEnv, draft.id, coach.id);
  });
});
