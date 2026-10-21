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
      gradeCode: child.gradeCode,
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
      // 保護者向け2枚構成の暫定ルール（ロジックが決まったら差し替える）。
      goalItems: report.pyramid.goalItems,
      copmAreas: report.copm.map(({ text, areas }) => ({ text, areas })),
      focusAreas: report.focusAreas.map(({ item, source, goalText }) => ({ item, source, goalText })),
      gradeOutlook: report.gradeOutlook?.milestones.map(({ label, gradesAhead }) => `${label}・約${gradesAhead}学年先`) ?? null,
    }))).toMatchInlineSnapshot(`
      [
        {
          "copmAreas": [
            {
              "areas": [
                "視覚",
                "眼球運動",
                "目と手の連携",
              ],
              "text": "板書を写すのが間に合うようになる",
            },
            {
              "areas": [],
              "text": "すぐにあきらめず最後までやりきる",
            },
          ],
          "focusAreas": [
            {
              "goalText": "姿勢よく座れるようになる",
              "item": "前庭覚",
              "source": "both",
            },
            {
              "goalText": "板書を写すのが間に合うようになる",
              "item": "眼球運動",
              "source": "both",
            },
            {
              "goalText": "板書を写すのが間に合うようになる",
              "item": "目と手の連携",
              "source": "both",
            },
          ],
          "goalItems": [
            "視覚",
            "眼球運動",
            "目と手の連携",
            "前庭覚",
            "姿勢",
            "バランス",
          ],
          "gradeOutlook": [
            "小6ごろ・約5学年先",
            "高校ごろ・約9学年先",
          ],
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
          "copmAreas": [
            {
              "areas": [
                "視覚",
                "眼球運動",
                "目と手の連携",
              ],
              "text": "板書を写すのが間に合うようになる",
            },
            {
              "areas": [],
              "text": "すぐにあきらめず最後までやりきる",
            },
          ],
          "focusAreas": [
            {
              "goalText": null,
              "item": "身体の位置",
              "source": "measured",
            },
            {
              "goalText": "板書を写すのが間に合うようになる",
              "item": "眼球運動",
              "source": "both",
            },
            {
              "goalText": "板書を写すのが間に合うようになる",
              "item": "目と手の連携",
              "source": "both",
            },
          ],
          "goalItems": [
            "視覚",
            "眼球運動",
            "目と手の連携",
            "前庭覚",
            "姿勢",
            "バランス",
          ],
          "gradeOutlook": [
            "小6ごろ・約5学年先",
            "高校ごろ・約9学年先",
          ],
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
          "copmAreas": [
            {
              "areas": [],
              "text": "ノートを最後まで写せるようになる",
            },
            {
              "areas": [],
              "text": "忘れ物を減らす",
            },
          ],
          "focusAreas": [
            {
              "goalText": "朝の支度を自分で進められるようになる",
              "item": "前庭覚",
              "source": "both",
            },
            {
              "goalText": "板書を写すのが間に合うようになる",
              "item": "眼球運動",
              "source": "both",
            },
            {
              "goalText": "朝の支度を自分で進められるようになる",
              "item": "運動のコントロール",
              "source": "both",
            },
          ],
          "goalItems": [
            "視覚",
            "眼球運動",
            "目と手の連携",
            "前庭覚",
            "運動のコントロール",
            "学習・情緒／複合運動",
          ],
          "gradeOutlook": [
            "小6ごろ・約2学年先",
            "高校ごろ・約6学年先",
          ],
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
