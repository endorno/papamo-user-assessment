import { describe, expect, it } from 'vitest';

import { stateOf } from '../domain';
import { MASTER_VERSION } from '../master';
import { RuleBasedReportGenerator, type ReportInput } from '../report';
import { ASSESSMENT_FIXTURES, CHILD_FIXTURES } from './children';

function completedFixture(id: string) {
  const assessment = ASSESSMENT_FIXTURES.find((candidate) => candidate.id === id);
  if (!assessment || assessment.status !== 'done') {
    throw new Error(`完了済みフィクスチャが見つかりません: ${id}`);
  }
  return assessment;
}

function reportInput(id: string): ReportInput {
  const assessment = completedFixture(id);
  const child = CHILD_FIXTURES.find((candidate) => candidate.id === assessment.childId);
  if (!child) throw new Error(`子どもフィクスチャが見つかりません: ${assessment.childId}`);
  const previous = assessment.previousId ? completedFixture(assessment.previousId) : undefined;

  return {
    child: {
      name: child.name,
      honorific: child.honorific,
      grade: child.grade,
      ageHint: child.ageHint,
      ageGroup: child.ageGroup,
      joinedMonth: child.joinedMonth,
    },
    coach: { displayName: 'さとう みき' },
    assessment: {
      seqNo: assessment.seqNo,
      assessedOn: assessment.assessedOn,
      unlockExt: assessment.unlockExt,
      data: assessment.data,
    },
    ...(previous ? {
      previous: {
        seqNo: previous.seqNo,
        assessedOn: previous.assessedOn,
        unlockExt: previous.unlockExt,
        data: previous.data,
      },
    } : {}),
    master: { version: MASTER_VERSION },
    generatedAt: '2026-09-05T00:00:00.000Z',
  };
}

describe('承認モックのフィクスチャ', () => {
  it('初回・比較・5種目開放済みのレポート結果を固定する', async () => {
    const generator = new RuleBasedReportGenerator();
    const reports = await Promise.all(
      ['a1', 'a2', 'm3'].map(async (id) => ({ id, report: await generator.generate(reportInput(id)) })),
    );

    expect(reports.map(({ id, report }) => ({
      id,
      kind: report.kind,
      levels: report.levels.map(({ key, lv, prevLv, delta }) => ({ key, lv, prevLv, delta })),
      priorities: report.priorities.map(({ key }) => key),
      strengths: report.strengths.map(({ key }) => key),
      upcoming: report.upcomingExercises.map(({ key }) => key),
      nextDue: report.nextDue,
    }))).toMatchInlineSnapshot(`
      [
        {
          "id": "a1",
          "kind": "first",
          "levels": [
            {
              "delta": undefined,
              "key": "post",
              "lv": 5,
              "prevLv": undefined,
            },
            {
              "delta": undefined,
              "key": "eyeh",
              "lv": 4,
              "prevLv": undefined,
            },
            {
              "delta": undefined,
              "key": "hand",
              "lv": 6,
              "prevLv": undefined,
            },
          ],
          "nextDue": "2026-08-30",
          "priorities": [
            "eyeh",
            "post",
          ],
          "strengths": [
            "hand",
          ],
          "upcoming": [
            "sacc",
            "inhi",
          ],
        },
        {
          "id": "a2",
          "kind": "comparison",
          "levels": [
            {
              "delta": 4,
              "key": "post",
              "lv": 9,
              "prevLv": 5,
            },
            {
              "delta": 3,
              "key": "eyeh",
              "lv": 7,
              "prevLv": 4,
            },
            {
              "delta": 2,
              "key": "hand",
              "lv": 8,
              "prevLv": 6,
            },
          ],
          "nextDue": "2026-11-29",
          "priorities": [
            "eyeh",
            "hand",
          ],
          "strengths": [
            "post",
          ],
          "upcoming": [
            "sacc",
            "inhi",
          ],
        },
        {
          "id": "m3",
          "kind": "comparison",
          "levels": [
            {
              "delta": 3,
              "key": "post",
              "lv": 12,
              "prevLv": 9,
            },
            {
              "delta": 2,
              "key": "eyeh",
              "lv": 12,
              "prevLv": 10,
            },
            {
              "delta": 2,
              "key": "hand",
              "lv": 10,
              "prevLv": 8,
            },
            {
              "delta": undefined,
              "key": "sacc",
              "lv": 7,
              "prevLv": undefined,
            },
            {
              "delta": undefined,
              "key": "inhi",
              "lv": 5,
              "prevLv": undefined,
            },
          ],
          "nextDue": "2026-09-20",
          "priorities": [
            "inhi",
            "sacc",
            "hand",
          ],
          "strengths": [
            "post",
            "eyeh",
          ],
          "upcoming": [],
        },
      ]
    `);
  });

  it('入力途中の子どもを完了項目数つきの下書き状態にする', () => {
    const assessments = ASSESSMENT_FIXTURES
      .filter(({ childId }) => childId === 'c3')
      .map((assessment) => ({
        status: assessment.status,
        assessedOn: assessment.assessedOn,
        unlockExt: assessment.unlockExt,
        lv: assessment.data.lv,
        troubles: assessment.data.troubles,
        ppi: assessment.data.ppi,
      }));

    expect(stateOf({ archivedAt: null, assessments }, '2026-09-05')).toEqual({
      key: 'draft',
      label: 'アセスメント入力中（2/5）',
      filled: 2,
      total: 5,
      order: 0,
    });
  });
});
