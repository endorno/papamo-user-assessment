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
      upcoming: report.upcomingExercises.map(({ key }) => key),
      nextDue: report.nextDue,
      abilities: report.abilities.map(({ key, can, next, blocks }) => `${key}：${can ?? '—'}→${next ?? '—'}（${blocks.join('・')}）`),
      goalBlocks: report.pyramid.goalBlocks,
      issueBlocks: report.pyramid.issueBlocks,
      copmAreas: report.copm.map(({ text, areas }) => ({ text, areas })),
      focusAreas: report.focusAreas.map(({ block, source, goals }) => ({ block, source, goals })),
      troubleBackgrounds: report.troubleBackgrounds.map(({ block, troubles }) => `${block}：${troubles.length}件`),
      risks: report.risks && {
        evidence: report.risks.evidence.map(({ key, lv, expectedLv }) => `${key} Lv${lv}（目安 Lv${expectedLv}）`),
        stages: report.risks.stages.map(({ label, gradesAhead, concerns }) => `${label}・約${gradesAhead}学年先：${concerns.join('／')}`),
      },
      areaMenus: report.coach.areaMenus.map(({ block, source, goals, menus }) => `${block}（${source}）：${goals.join('／')}：${menus.map(({ name }) => name).join('・')}`),
    }))).toMatchInlineSnapshot(`
      [
        {
          "abilities": [
            "post：—→体の軸を保ったまま動く力（目を閉じても保てる）（バランス・姿勢・眼球運動）",
            "eyeh：飛んでくるものを目で捉えて、タイミングを合わせる力→自分の動きの結果を見て、手を合わせる力（目と手の連携・運動のコントロール・ボディイメージ）",
            "hand：見た場所に手を正確に出す力→見た形に合わせて、出す手を選ぶ力（身体の位置・視覚・目と手の連携）",
          ],
          "areaMenus": [
            "前庭覚（both）：すぐにあきらめず最後までやりきる：タオルの船_ブランケットver.・綱渡り・バランス_座る",
            "眼球運動（both）：板書を写すのが間に合うようになる／すぐにあきらめず最後までやりきる：ボールタッチ_5秒追って・タオルキャッチ_ゆらゆら・タオルキャッチ_パッパッ",
            "視覚（goal）：板書を写すのが間に合うようになる：親の手をタッチ_グーとパー・紙コップタワー_レベル1・親の手をタッチ_グーチョキパー",
            "学習・情緒／複合運動（goal）：板書を写すのが間に合うようになる／すぐにあきらめず最後までやりきる：だるまさんが転んだ・ボールタッチ_青はタッチ･赤はタッチしない・タッチ･ゲット･チェンジゲーム_2人",
            "姿勢（issue）：：四つ這い(四つん這い)の背中にたくさんトイレットペーパーを積んでみよう・おしり(お尻)歩き・ティッシュ_落とさないように",
            "バランス（issue）：：じゃんけんタオル・ておしずもう(手押し相撲)・綱渡り",
            "ボディイメージ（issue）：：鬼のトンネルくぐり・シンクロ③・グーチョキパー",
            "運動のコントロール（issue）：：手をつないで立つ・大人を引っ張り上げる・紙コップを足で起こすゲーム",
            "目と手の連携（issue）：：ボールキャッチ_洋服で・ダーツゲーム・輪投げ_立って",
          ],
          "copmAreas": [
            {
              "areas": [
                "視覚",
                "眼球運動",
                "学習・情緒／複合運動",
              ],
              "text": "板書を写すのが間に合うようになる",
            },
            {
              "areas": [
                "前庭覚",
                "眼球運動",
                "学習・情緒／複合運動",
              ],
              "text": "すぐにあきらめず最後までやりきる",
            },
          ],
          "focusAreas": [
            {
              "block": "前庭覚",
              "goals": [
                "すぐにあきらめず最後までやりきる",
              ],
              "source": "both",
            },
            {
              "block": "視覚",
              "goals": [
                "板書を写すのが間に合うようになる",
              ],
              "source": "goal",
            },
            {
              "block": "眼球運動",
              "goals": [
                "板書を写すのが間に合うようになる",
                "すぐにあきらめず最後までやりきる",
              ],
              "source": "both",
            },
          ],
          "goalBlocks": [
            "前庭覚",
            "視覚",
            "眼球運動",
            "学習・情緒／複合運動",
          ],
          "id": "a1",
          "issueBlocks": [
            "前庭覚",
            "姿勢",
            "バランス",
            "眼球運動",
            "ボディイメージ",
            "運動のコントロール",
            "目と手の連携",
          ],
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
          "risks": {
            "evidence": [
              "post Lv5（目安 Lv10）",
              "eyeh Lv4（目安 Lv10）",
            ],
            "stages": [
              "小2・約1学年先：字を書くのが苦手になる／ケアレスミスが増える／自信をなくしやすくなる／「勉強が嫌い」が始まる",
              "小4・約3学年先：友だちとのトラブルが増える／自己肯定感が下がる／不器用さが目立つ／空気が読めないと言われる／学校へ行きたがらなくなる",
            ],
          },
          "troubleBackgrounds": [
            "運動のコントロール：1件",
            "前庭覚：1件",
            "眼球運動：1件",
            "ボディイメージ：1件",
          ],
          "upcoming": [
            "sacc",
            "inhi",
          ],
        },
        {
          "abilities": [
            "post：体の軸を保ったまま動く力（目を閉じても保てる）→支える面が狭くても、ぐらつきを小さく抑える力（バランス・姿勢・前庭覚）",
            "eyeh：飛んでくるものを目で捉えて、タイミングを合わせる力→自分の動きの結果を見て、手を合わせる力（目と手の連携・運動のコントロール・ボディイメージ）",
            "hand：見た場所に手を正確に出す力→見た形に合わせて、出す手を選ぶ力（身体の位置・視覚・目と手の連携）",
          ],
          "areaMenus": [
            "眼球運動（both）：板書を写すのが間に合うようになる／すぐにあきらめず最後までやりきる：ボールタッチ_5秒追って・タオルキャッチ_ゆらゆら・タオルキャッチ_パッパッ",
            "前庭覚（goal）：すぐにあきらめず最後までやりきる：タオルの船_ブランケットver.・綱渡り・バランス_座る",
            "視覚（goal）：板書を写すのが間に合うようになる：親の手をタッチ_グーとパー・紙コップタワー_レベル1・親の手をタッチ_グーチョキパー",
            "学習・情緒／複合運動（goal）：板書を写すのが間に合うようになる／すぐにあきらめず最後までやりきる：だるまさんが転んだ・ボールタッチ_青はタッチ･赤はタッチしない・タッチ･ゲット･チェンジゲーム_2人",
            "ボディイメージ（issue）：：鬼のトンネルくぐり・シンクロ③・グーチョキパー",
          ],
          "copmAreas": [
            {
              "areas": [
                "視覚",
                "眼球運動",
                "学習・情緒／複合運動",
              ],
              "text": "板書を写すのが間に合うようになる",
            },
            {
              "areas": [
                "前庭覚",
                "眼球運動",
                "学習・情緒／複合運動",
              ],
              "text": "すぐにあきらめず最後までやりきる",
            },
          ],
          "focusAreas": [
            {
              "block": "前庭覚",
              "goals": [
                "すぐにあきらめず最後までやりきる",
              ],
              "source": "goal",
            },
            {
              "block": "視覚",
              "goals": [
                "板書を写すのが間に合うようになる",
              ],
              "source": "goal",
            },
            {
              "block": "眼球運動",
              "goals": [
                "板書を写すのが間に合うようになる",
                "すぐにあきらめず最後までやりきる",
              ],
              "source": "both",
            },
          ],
          "goalBlocks": [
            "前庭覚",
            "視覚",
            "眼球運動",
            "学習・情緒／複合運動",
          ],
          "id": "a2",
          "issueBlocks": [
            "眼球運動",
            "ボディイメージ",
          ],
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
          "risks": {
            "evidence": [],
            "stages": [
              "小2・約1学年先：ケアレスミスが増える／「勉強が嫌い」が始まる",
            ],
          },
          "troubleBackgrounds": [
            "眼球運動：1件",
            "ボディイメージ：1件",
          ],
          "upcoming": [
            "sacc",
            "inhi",
          ],
        },
        {
          "abilities": [
            "post：体の軸を保ったまま動く力（目を閉じても保てる）→支える面が狭くても、ぐらつきを小さく抑える力（バランス・姿勢・前庭覚）",
            "eyeh：重さのあるものを扱い、どれを取るか選ぶ注意の力→片手ずつを使い分け、体の中心をまたいで持ちかえる力（運動のコントロール・身体の位置・目と手の連携）",
            "hand：見た形に合わせて、出す手を選ぶ力→決まりに合わせて、出す手を変換する力（眼球運動・言語機能）",
            "sacc：動くものを目でなめらかに追う力→離れた場所へ素早く目を移す力（眼球運動・ボディイメージ・前庭覚）",
            "inhi：合図を見て、決まりどおりに止まる・動く力→見た合図でも聞いた言葉でも動ける力（身体の位置・目と手の連携・視覚）",
          ],
          "areaMenus": [
            "視覚（both）：ノートを最後まで写せるようになる：指で色タッチ・親の手にタッチ_グーパー・あやとり_ほうき",
            "眼球運動（both）：ノートを最後まで写せるようになる／忘れ物を減らす：ティッシュキャッチ_ギリギリ・手をタッチ_いろんな場所で・スピード風船タッチ（瞬発力）",
            "言語機能（both）：忘れ物を減らす：顔を上げてチャレンジ（フープの色を言う）・ツイスターゲーム・反復横跳び_指示された方にジャンプ",
            "学習・情緒／複合運動（goal）：ノートを最後まで写せるようになる／忘れ物を減らす：だるまさんが転んだ・転ばない・じゃんけん_右左タッチ・風船タッチ_お片付けゲーム",
            "前庭覚（issue）：：サイドロール・Vのポーズで転がる・前転練習_1人で",
            "姿勢（issue）：：うつぶせ(うつ伏せ)キャッチボール・Wのポーズ・飛行機のポーズ",
            "バランス（issue）：：タオルの船・片足バランス_トイレットペーパーを乗せる・片足_屈伸",
            "身体の位置（issue）：：トンネルくぐり_親の上を跨いで戻る・タオルぐるぐる_一方通行・タオルチャレンジ_しゃがむ･避ける",
            "ボディイメージ（issue）：：ボールトンネル・体の色んなところでボールタッチ・シンクロ②",
            "運動のコントロール（issue）：：トイレットペーパータオル引きゲーム・おなか(お腹)にボールを挟んで歩く_二人で・背中合わせで立つ",
            "目と手の連携（issue）：：タオルでお手玉・形の中を塗る・靴下に洗濯バサミをつけてみよう",
          ],
          "copmAreas": [
            {
              "areas": [
                "視覚",
                "眼球運動",
                "学習・情緒／複合運動",
              ],
              "text": "ノートを最後まで写せるようになる",
            },
            {
              "areas": [
                "眼球運動",
                "言語機能",
                "学習・情緒／複合運動",
              ],
              "text": "忘れ物を減らす",
            },
          ],
          "focusAreas": [
            {
              "block": "視覚",
              "goals": [
                "ノートを最後まで写せるようになる",
              ],
              "source": "both",
            },
            {
              "block": "眼球運動",
              "goals": [
                "ノートを最後まで写せるようになる",
                "忘れ物を減らす",
              ],
              "source": "both",
            },
            {
              "block": "言語機能",
              "goals": [
                "忘れ物を減らす",
              ],
              "source": "both",
            },
          ],
          "goalBlocks": [
            "視覚",
            "眼球運動",
            "言語機能",
            "学習・情緒／複合運動",
          ],
          "id": "m3",
          "issueBlocks": [
            "前庭覚",
            "視覚",
            "姿勢",
            "バランス",
            "身体の位置",
            "眼球運動",
            "ボディイメージ",
            "運動のコントロール",
            "目と手の連携",
            "言語機能",
          ],
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
          "risks": {
            "evidence": [
              "post Lv12（目安 Lv17）",
              "eyeh Lv12（目安 Lv17）",
              "hand Lv10（目安 Lv17）",
              "sacc Lv7（目安 Lv11）",
              "inhi Lv5（目安 Lv11）",
            ],
            "stages": [
              "小5・約1学年先：提出物の管理ができない／勉強量についていけない",
              "中学・約3学年先：勉強と部活の両立が難しくなる",
            ],
          },
          "troubleBackgrounds": [
            "眼球運動：1件",
            "身体の位置：1件",
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
      }));

    expect(stateOf({ archivedAt: null, assessments }, '2026-09-05')).toEqual({
      key: 'draft',
      label: 'アセスメント入力中（2/4）',
      filled: 2,
      total: 4,
      order: 0,
    });
  });
});
