import { describe, expect, it } from 'vitest';

import { MASTER_VERSION } from '../master';
import { reportContentSchema } from '../schema';
import type { CompletedAssessmentData } from '../schema';
import type { ReportInput } from './types';
import { RuleBasedReportGenerator } from './rule';

const data: CompletedAssessmentData = {
  lv: { post: 5, eyeh: 5, hand: 5 },
  observations: { post: [], eyeh: [], hand: [] },
  observationNotes: {},
  engagement: {},
  troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる'],
  copm: [],
};

function inputFor(
  assessmentData: CompletedAssessmentData,
  options: { unlockExt?: boolean; previous?: ReportInput['previous']; seqNo?: number; gradeCode?: ReportInput['child']['gradeCode'] } = {},
): ReportInput {
  return {
    child: {
      name: 'はると',
      honorific: 'kun',
      grade: '小学1年生',
      gradeCode: options.gradeCode ?? 'e1',
      ageHint: '6〜7歳',
      ageGroup: 'sch',
      joinedMonth: '2026-03',
    },
    coach: { displayName: 'さとうコーチ' },
    assessment: {
      seqNo: options.seqNo ?? 1,
      assessedOn: '2026-09-01',
      unlockExt: options.unlockExt ?? false,
      data: assessmentData,
    },
    ...(options.previous ? { previous: options.previous } : {}),
    master: { version: MASTER_VERSION },
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('RuleBasedReportGenerator', () => {
  it('終了する目標の今回の採点と差分は残し、ピラミッド・方針・メニューには選択した目標だけを使う', async () => {
    const ended = { id: 'ended', text: '姿勢よく座れるようになる', memo: '今回で終了', performance: 7, satisfaction: 3, importance: 10, continueNext: false };
    const next = { id: 'next', text: '字をきれいに書けるようになる', memo: '', performance: 3, satisfaction: 4, importance: 8, continueNext: true };
    const generator = new RuleBasedReportGenerator();
    const report = await generator.generate(inputFor({ ...data, copm: [ended, next] }, {
      seqNo: 2,
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: { ...data, copm: [{ ...ended, continueNext: true, performance: 3 }] } },
    }));
    const onlyNext = await generator.generate(inputFor({ ...data, copm: [next] }));
    expect(report.copm[0]).toMatchObject({ text: ended.text, areas: [], performanceDelta: 4, previous: { performance: 3 } });
    expect(report.pyramid).toEqual(onlyNext.pyramid);
    expect(report.focusAreas).toEqual(onlyNext.focusAreas);
    expect(report.coach.areaMenus).toEqual(onlyNext.coach.areaMenus);
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  it('同じ文言でもIDの違う新しい目標や、前回で終了した目標とは比較しない', async () => {
    const goal = { text: '縄跳びを10回跳ぶ', memo: '', performance: 7, satisfaction: 7, importance: 5 };
    for (const previousGoal of [{ ...goal, id: 'old' }, { ...goal, id: 'new', continueNext: false }]) {
      const report = await new RuleBasedReportGenerator().generate(inputFor({ ...data, copm: [{ ...goal, id: 'new' }] }, {
        seqNo: 2,
        previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: { ...data, copm: [previousGoal] } },
      }));
      expect(report.copm[0]?.previous).toBeUndefined();
    }
  });
  it('取り組みの発達を前回と並べて返す', async () => {
    const current: CompletedAssessmentData = {
      ...data,
      engagement: { dur: 3, sup: 2 },
    };
    const previous: CompletedAssessmentData = { ...data, engagement: { dur: 1, sup: 2 } };
    const report = await new RuleBasedReportGenerator().generate(inputFor(current, {
      seqNo: 2,
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: previous },
    }));

    expect(report.engagement).toEqual([
      { key: 'dur', title: '参加の持続', subtitle: 'どれくらい取り組めたか', level: 3, levelCount: 5, label: '複数の課題を続けて取り組める', prevLevel: 1, delta: 2 },
      { key: 'sup', title: '必要な支援', subtitle: 'どれくらい支えると取り組めるか', level: 2, levelCount: 5, label: '手本を見せると取り組める', prevLevel: 2, delta: 0 },
    ]);
    expect(report.tuning.map(({ key }) => key)).toContain('engagementDelta');
  });

  it('COPMの目標は同じ文言どうしを突き合わせて差分を出す', async () => {
    const current: CompletedAssessmentData = {
      ...data,
      copm: [{ text: '姿勢よく座れるようになる', memo: '', performance: 6, satisfaction: 5, importance: 9 }],
    };
    const previous: CompletedAssessmentData = {
      ...data,
      copm: [{ text: '姿勢よく座れるようになる', memo: '', performance: 3, satisfaction: 2, importance: 9 }],
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(current, {
      seqNo: 2,
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: previous },
    }));

    expect(report.copm[0]).toMatchObject({ performanceDelta: 3, satisfactionDelta: 3 });
  });

  it('初回は、ツール導入前の採点を前回として目標の差分を出す（レポートの種類は初回のまま）', async () => {
    const current: CompletedAssessmentData = {
      ...data,
      copm: [
        { text: 'ひとりで靴をはける', memo: '', performance: 6, satisfaction: 5, importance: 8, baseline: { performance: 4, satisfaction: 3 } },
        { text: '縄跳びを跳べる', memo: '', performance: 3, satisfaction: 4, importance: 6 },
      ],
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(current));

    expect(report.kind).toBe('first');
    expect(report.copm).toEqual([
      {
        text: 'ひとりで靴をはける',
        memo: '',
        areas: [],
        performance: 6,
        satisfaction: 5,
        importance: 8,
        previous: { performance: 4, satisfaction: 3 },
        performanceDelta: 2,
        satisfactionDelta: 2,
      },
      // 前回の採点が無い目標も、語彙表で優先する領域を持つ。
      { text: '縄跳びを跳べる', memo: '', areas: ['前庭覚', 'バランス', '姿勢'], performance: 3, satisfaction: 4, importance: 6 },
    ]);
    expect(report.tuning.map(({ key }) => key)).toContain('copmDelta');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  it('比較回のLv・困りごとを決定的に生成する', async () => {
    const previousData: CompletedAssessmentData = {
      ...data,
      lv: { post: 2, eyeh: 5, hand: 7 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる', '忘れ物・なくし物が多い'],
    };
    const currentData: CompletedAssessmentData = {
      ...data,
      lv: { post: 5, eyeh: 6, hand: 7 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる', '朝の支度や着替えに時間がかかる'],
    };
    const report = await new RuleBasedReportGenerator().generate(inputFor(currentData, {
      seqNo: 2,
      previous: {
        seqNo: 1,
        assessedOn: '2026-06-01',
        unlockExt: false,
        data: previousData,
      },
    }));

    expect({
      kind: report.kind,
      levelChanges: report.levels.map(({ key, prevLv, lv, delta }) => ({ key, prevLv, lv, delta })),
      troubles: report.troubles,
      changes3m: report.changes3m,
      nextDue: report.nextDue,
    }).toMatchInlineSnapshot(`
      {
        "changes3m": [
          "姿勢が崩れるまでの時間が延びる",
          "座り直しの回数が減る",
          "キャッチが安定してくる",
          "投げる方向のばらつきが減る",
        ],
        "kind": "comparison",
        "levelChanges": [
          {
            "delta": 3,
            "key": "post",
            "lv": 5,
            "prevLv": 2,
          },
          {
            "delta": 1,
            "key": "eyeh",
            "lv": 6,
            "prevLv": 5,
          },
          {
            "delta": 0,
            "key": "hand",
            "lv": 7,
            "prevLv": 7,
          },
        ],
        "nextDue": "2026-12-01",
        "troubles": {
          "byCategory": [
            {
              "icon": "🧍",
              "id": "C",
              "items": [
                "姿勢がすぐ崩れる／机に伏せる・寝転がる",
              ],
              "title": "姿勢・身体の使い方",
            },
            {
              "icon": "🏠",
              "id": "E",
              "items": [
                "朝の支度や着替えに時間がかかる",
              ],
              "title": "日常生活・生活習慣",
            },
          ],
          "current": [
            "姿勢がすぐ崩れる／机に伏せる・寝転がる",
            "朝の支度や着替えに時間がかかる",
          ],
        },
      }
    `);
    expect(report.tuning.map(({ key }) => key)).toContain('comparison');
    expect(reportContentSchema.parse(report)).toEqual(report);
  });

  describe('種目ごとの力（M1・M2）', () => {
    it('通過した最後の帯の力をできている力、取り組み中の帯の力を次に高めたい力にし、取り組み中の帯のブロックを添える', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({ ...data, lv: { post: 12, eyeh: 14, hand: 16 } }));

      expect(report.abilities).toEqual([
        { key: 'post', can: '体の軸を保ったまま動く力（目を閉じても保てる）', next: '支える面が狭くても、ぐらつきを小さく抑える力', blocks: ['バランス', '姿勢', '前庭覚'] },
        { key: 'eyeh', can: '重さのあるものを扱い、どれを取るか選ぶ注意の力', next: '片手ずつを使い分け、体の中心をまたいで持ちかえる力', blocks: ['運動のコントロール', '身体の位置', '目と手の連携'] },
        // グーパータッチ Lv16 は「視空間対応・交差」（Lv14〜16）の上限なので、その帯を通過して処理速度が取り組み中。
        { key: 'hand', can: '体の左右を取り違えずに、空間と体を対応づける力', next: '正確さを保ったまま、速く処理する力', blocks: ['運動のコントロール', '眼球運動', '言語機能'] },
      ]);
    });

    it('Lv0 はできている力がなく、上限まで届いたら次に高めたい力とブロックがない', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({ ...data, lv: { post: 0, eyeh: 30, hand: 5 } }));

      expect(report.abilities[0]).toEqual({ key: 'post', can: null, next: '体の軸を保ったまま動く力（目を閉じても保てる）', blocks: ['バランス', '姿勢', '眼球運動'] });
      expect(report.abilities[1]).toEqual({ key: 'eyeh', can: '見えない位置でも自分の体の位置をつかむ力', next: null, blocks: [] });
    });

    it('4・5種目目が未開放なら、その種目の力は出さない', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor(data));
      expect(report.abilities.map(({ key }) => key)).toEqual(['post', 'eyeh', 'hand']);
      expect(report.upcomingExercises.map(({ key }) => key)).toEqual(['sacc', 'inhi']);
    });
  });

  describe('発達ピラミッドと最重要にすべき領域（M4・M5）', () => {
    // 小学1年生（目安 0.32）。ラインウォーク Lv5 だけが目安より下（5/30 − 0.32 < −0.12）。
    const pyramidData: CompletedAssessmentData = {
      ...data,
      lv: { post: 5, eyeh: 12, hand: 9 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる'],
      copm: [
        { text: '字をきれいに書けるようになる', memo: '', performance: 2, satisfaction: 3, importance: 10 },
        { text: '姿勢よく座れるようになる', memo: '', performance: 3, satisfaction: 4, importance: 9 },
        { text: 'みんなと同じようにできてほしい', memo: '', performance: 5, satisfaction: 5, importance: 4 },
      ],
    };

    it('目標ごとの優先する領域は語彙表で決め、当たらない目標は空にする', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor(pyramidData));

      expect(report.copm.map(({ text, areas }) => ({ text, areas }))).toEqual([
        { text: '字をきれいに書けるようになる', areas: ['固有覚', '運動のコントロール', '目と手の連携'] },
        { text: '姿勢よく座れるようになる', areas: ['前庭覚', '姿勢', '姿勢調整'] },
        { text: 'みんなと同じようにできてほしい', areas: [] },
      ]);
    });

    it('目標ブロックは赤い塗り、課題ブロックは目安より下の種目の帯のブロックとお困りごとのブロック', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor(pyramidData));

      expect(report.pyramid.goalBlocks).toEqual(['前庭覚', '固有覚', '姿勢', '姿勢調整', '運動のコントロール', '目と手の連携']);
      // ラインウォーク Lv5 の取り組み中の帯（17cm一巡）のブロックと、お困りごと（身体図式）のボディイメージ。
      expect(report.pyramid.issueBlocks).toEqual(['姿勢', 'バランス', '眼球運動', 'ボディイメージ']);
    });

    it('最重要にすべき領域は 両方→目標だけ→課題だけ の順に3つ選び、下の段から並べて目標を添える', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor(pyramidData));

      expect(report.focusAreas.map(({ block, tier, source, goals }) => ({ block, tier, source, goals }))).toEqual([
        { block: '前庭覚', tier: 1, source: 'goal', goals: ['姿勢よく座れるようになる'] },
        { block: '固有覚', tier: 1, source: 'goal', goals: ['字をきれいに書けるようになる'] },
        { block: '姿勢', tier: 2, source: 'both', goals: ['姿勢よく座れるようになる'] },
      ]);
      expect(report.focusAreas[0]).toMatchObject({ definition: '重力の向きと体の傾きを感じ取る', effect: '姿勢が崩れるまでの時間が延びる／疲れにくくなる' });
      expect(reportContentSchema.parse(report)).toEqual(report);
    });

    it('最重要にすべき領域から学習・情緒／複合運動を除く', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({
        ...data,
        lv: { post: 12, eyeh: 12, hand: 12 },
        troubles: ['順番を待てない／思いついたまま先に動く'],
        copm: [{ text: '友だちと一緒に遊べるようになる', memo: '', performance: 2, satisfaction: 3, importance: 8 }],
      }));

      expect(report.pyramid.goalBlocks).toEqual(['聴覚', '言語機能', '学習・情緒／複合運動']);
      expect(report.pyramid.issueBlocks).toEqual(['学習・情緒／複合運動']);
      expect(report.focusAreas.map(({ block, source }) => ({ block, source }))).toEqual([
        { block: '聴覚', source: 'goal' },
        { block: '言語機能', source: 'goal' },
      ]);
      // 方針とメニューの方向性は除かずに、同じ並び（両方が先）ですべて出す。
      expect(report.coach.areaMenus.map(({ block, source }) => ({ block, source }))).toEqual([
        { block: '学習・情緒／複合運動', source: 'both' },
        { block: '聴覚', source: 'goal' },
        { block: '言語機能', source: 'goal' },
      ]);
    });

    it('次の3か月の目標に選ばなかった目標は、優先する領域を持たずピラミッドに効かない', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({
        ...pyramidData,
        copm: pyramidData.copm.map((goal, index) => ({ ...goal, continueNext: index !== 1 })),
      }));

      expect(report.copm[1]?.areas).toEqual([]);
      expect(report.pyramid.goalBlocks).toEqual(['固有覚', '運動のコントロール', '目と手の連携']);
    });

    it('方針とメニューの方向性は、目標ブロックと課題ブロックのすべてを最重要と同じ順に並べる', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor(pyramidData));
      const { areaMenus } = report.coach;

      expect(areaMenus.map(({ block, source, goals }) => ({ block, source, goals }))).toEqual([
        { block: '姿勢', source: 'both', goals: ['姿勢よく座れるようになる'] },
        { block: '前庭覚', source: 'goal', goals: ['姿勢よく座れるようになる'] },
        { block: '固有覚', source: 'goal', goals: ['字をきれいに書けるようになる'] },
        { block: '姿勢調整', source: 'goal', goals: ['姿勢よく座れるようになる'] },
        { block: '運動のコントロール', source: 'goal', goals: ['字をきれいに書けるようになる'] },
        { block: '目と手の連携', source: 'goal', goals: ['字をきれいに書けるようになる'] },
        { block: 'バランス', source: 'issue', goals: [] },
        { block: '眼球運動', source: 'issue', goals: [] },
        { block: 'ボディイメージ', source: 'issue', goals: [] },
      ]);
      // 小1（対象区分 low）で到達率の中央値が 0.30（初級）なので、固有覚は low・初級のメニューを属性つきで出す。
      expect(areaMenus[2]?.menus.map(({ name }) => name)).toEqual(['タオル綱引き_立って', '仁王立ち_押す', 'ダンゴムシ_押す']);
      expect(areaMenus[2]?.menus[2]).toEqual({ name: 'ダンゴムシ_押す', difficulty: '初級', form: '親子で', equipment: '道具なし', parentBurden: '多', category: '筋力が弱い、低緊張／押す' });
      expect(areaMenus.every(({ aim, menus }) => aim.length > 0 && menus.length === 3)).toBe(true);
      expect(report.tuning.map(({ key }) => key)).toContain('areaMenus');
    });

    it('目標も課題もなければ、ピラミッドに色を付けず領域も出さない', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({ ...data, lv: { post: 12, eyeh: 12, hand: 12 }, troubles: [], copm: [] }));
      expect(report.pyramid).toMatchObject({ goalBlocks: [], issueBlocks: [] });
      expect(report.focusAreas).toEqual([]);
      expect(report.coach.areaMenus).toEqual([]);
      expect(report.tuning.map(({ key }) => key)).not.toContain('areaMenus');
    });
  });

  describe('困りごとの背景と、続いた場合に起こりうること（M3・M6）', () => {
    it('お困りごとをドメインごとに1行にまとめ、チェックの多いドメインから並べる', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({
        ...data,
        troubles: ['忘れ物・なくし物が多い', 'ボールを投げる・受けるのが苦手', 'よく物にぶつかる・つまずく', '片足立ちやジャンプがふらつく', '落ち着いて座っていられない'],
      }));

      expect(report.troubleBackgrounds).toEqual([
        { id: 1, parentLabel: '力の加減とタイミングを合わせる力', block: '運動のコントロール', troubles: ['ボールを投げる・受けるのが苦手', '片足立ちやジャンプがふらつく'] },
        { id: 5, parentLabel: 'まわりとの位置関係をつかむ力', block: '身体の位置', troubles: ['忘れ物・なくし物が多い', 'よく物にぶつかる・つまずく'] },
        { id: 2, parentLabel: '体の力を抜いて切り替える力', block: '前庭覚', troubles: ['落ち着いて座っていられない'] },
      ]);
    });

    it('測定の裏づけと、1つ先・3つ先の段階でお困りごとのカテゴリに合う懸念だけを出す', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({
        ...data,
        lv: { post: 5, eyeh: 12, hand: 9 },
        // A（学習・見る・手を使う）と C（姿勢・身体の使い方）。
        troubles: ['行を読み飛ばす／読むところを見失う（絵本・教科書）', '姿勢がすぐ崩れる／机に伏せる・寝転がる'],
      }));

      expect(report.risks).toEqual({
        evidence: [{ key: 'post', name: 'ラインウォーク', lv: 5, maxLv: 30, expectedLv: 10 }],
        // 小学1年生の1つ先は小2（A が2つ）、3つ先は小4（A・C が無いので出さない）。
        stages: [{
          label: '小2',
          theme: '自己効力感の形成',
          demand: '「自分はできる」という自信を育てる時期',
          gradesAhead: 1,
          concerns: ['ケアレスミスが増える', '「勉強が嫌い」が始まる'],
        }],
      });
    });

    it('裏づけも懸念もなければ、起こりうることを出さない', async () => {
      const report = await new RuleBasedReportGenerator().generate(inputFor({ ...data, lv: { post: 12, eyeh: 12, hand: 12 }, troubles: [] }));
      expect(report.risks).toBeNull();
    });
  });

  it('観察された様子は、見えた動作か自由記入がある種目だけ出す', async () => {
    const report = await new RuleBasedReportGenerator().generate(inputFor({
      ...data,
      observations: { post: [], eyeh: ['指示理解の難しさ'], hand: [] },
      observationNotes: { post: '  ', hand: '左右を取り違える' },
    }));

    expect(report.coach.exerciseNotes).toEqual([
      { key: 'eyeh', lv: 5, observations: ['指示理解の難しさ'], conditions: ['指示理解の難しさ'], note: '' },
      { key: 'hand', lv: 5, observations: [], conditions: [], note: '左右を取り違える' },
    ]);
    expect(report.conditionNotes).toEqual([{ key: 'eyeh', name: 'お手玉キャッチ', notes: ['指示理解の難しさ'] }]);
  });
});
