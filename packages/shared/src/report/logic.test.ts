import { describe, expect, it } from 'vitest';

import { MENU_LEVELS, PYRAMID_BLOCKS, WANT_ITEMS, wantToGoalText, type MenuAudience } from '../master';
import {
  AREA_MENU_COUNT,
  AREA_MENU_SERIES_MAX,
  areaMenusOf,
  compareWithGrade,
  concernStagesOf,
  focusBlocksOf,
  goalBlocksOf,
  issueBlocksOf,
  menuAudienceOf,
  menuLevelOf,
  rankedBlocksOf,
  riskEvidenceOf,
  troubleBlocksOf,
} from './logic';

/** 仕様の「目標の候補（入力の目安）」の右の列。候補の文をそのまま語彙表で読んだときの目標ブロック。 */
const CANDIDATE_GOAL_BLOCKS: Record<string, string[]> = {
  w1: ['前庭覚', 'バランス', '姿勢'],
  w2: ['前庭覚', 'バランス', '姿勢'],
  w3: ['前庭覚', 'バランス', '姿勢'],
  w4: ['前庭覚', 'バランス', '姿勢'],
  w5: ['前庭覚', 'バランス', '姿勢'],
  w6: ['前庭覚', 'バランス', '姿勢'],
  w7: ['前庭覚', 'バランス', '姿勢'],
  w8: ['前庭覚', 'バランス', '姿勢'],
  w9: ['身体の位置', '眼球運動', '目と手の連携'],
  w23: ['前庭覚', 'バランス', '姿勢'],
  w11: ['視覚', '眼球運動', 'ボディイメージ'],
  w12: ['固有覚', '運動のコントロール', '目と手の連携'],
  w16: ['視覚', '眼球運動', '学習・情緒／複合運動'],
  w17: ['視覚', '眼球運動', '学習・情緒／複合運動'],
  w13: ['固有覚', '運動のコントロール', '目と手の連携'],
  w18: ['前庭覚', '姿勢', '姿勢調整'],
  w19: ['固有覚', '運動のコントロール', '目と手の連携'],
  w20: ['固有覚', '姿勢', '運動のコントロール'],
  w21: ['眼球運動', '言語機能', '学習・情緒／複合運動'],
  w22: ['聴覚', '言語機能', '学習・情緒／複合運動'],
  w14: ['前庭覚', '固有覚', '学習・情緒／複合運動'],
  w15: ['聴覚', '言語機能', '学習・情緒／複合運動'],
  w24: ['前庭覚', '眼球運動', '学習・情緒／複合運動'],
  w25: ['聴覚', '言語機能', '学習・情緒／複合運動'],
};

describe('目標ブロック（M5）', () => {
  it('候補の文をそのまま読んでも、目標欄の仮の文言で読んでも、仕様の表どおりのブロックになる', () => {
    expect(Object.keys(CANDIDATE_GOAL_BLOCKS).sort()).toEqual(WANT_ITEMS.map((item) => item.id).sort());
    for (const item of WANT_ITEMS) {
      expect(goalBlocksOf(item.text), item.text).toEqual(CANDIDATE_GOAL_BLOCKS[item.id]);
      expect(goalBlocksOf(wantToGoalText(item.text)), item.text).toEqual(CANDIDATE_GOAL_BLOCKS[item.id]);
    }
  });

  it('語彙表に当たらない目標は空にし、メモの語も読む', () => {
    expect(goalBlocksOf('みんなと同じようにできてほしい')).toEqual([]);
    expect(goalBlocksOf('みんなと同じようにできてほしい', '縄跳びの前跳びが目安')).toEqual(['前庭覚', 'バランス', '姿勢']);
  });

  it('目標の行に候補があれば、候補の文も一緒に読む', () => {
    // 「前とび」は語彙表に無いので、候補が無ければ空。縄跳びの候補（w1）から書いた目標なら、候補の表どおりになる。
    expect(goalBlocksOf('前とびを10回続けて跳べる')).toEqual([]);
    expect(goalBlocksOf('前とびを10回続けて跳べる', '', 'w1')).toEqual(CANDIDATE_GOAL_BLOCKS.w1);
    // 候補の文と目標文が同じ行に当たっても、その行の点は1回だけ。
    for (const item of WANT_ITEMS) {
      expect(goalBlocksOf(wantToGoalText(item.text), '', item.id), item.text).toEqual(CANDIDATE_GOAL_BLOCKS[item.id]);
    }
    // 目標文が別の行に当たれば、候補の行の点と合わせる（縄跳びの行＋球技の行）。
    expect(goalBlocksOf('ボールを投げられる', '', 'w1')).toEqual(goalBlocksOf('縄跳びとボールを投げる'));
  });

  it('同じ行の語がいくつ当たっても、その行の点は1回だけ足し、別の行の点は合計する', () => {
    // 行16（ぶつか）で身体の位置+3、行15（転ぶ・ころぶ・片足）で身体の位置+1 → 4点で、バランス・姿勢（3点）と並ぶ。
    // 行15を語の数だけ足すと、バランス・姿勢が9点、前庭覚が6点になって身体の位置が外れる。
    expect(goalBlocksOf('ぶつかる・転ぶ・ころぶ・片足')).toEqual(['身体の位置', 'バランス', '姿勢']);
    // 行15と行13（姿勢）：姿勢 6点・前庭覚 5点・バランスと姿勢調整 4点（同点は段の低いバランス）。表示は段の低い順、同じ段は点の高い順。
    expect(goalBlocksOf('鉄棒のときの姿勢')).toEqual(['前庭覚', '姿勢', 'バランス']);
  });
});

describe('年齢との比較（M3）', () => {
  it('到達率と学年の目安の差が ±0.12 の内なら目安くらい（境目を含む）', () => {
    // 小学1年生の目安 0.32。ラインウォークの上限は30。
    expect(compareWithGrade('post', 5, 'e1')).toBe('below');
    expect(compareWithGrade('post', 6, 'e1')).toBe('typical');
    expect(compareWithGrade('post', 13, 'e1')).toBe('typical');
    expect(compareWithGrade('post', 14, 'e1')).toBe('above');
  });

  it('あしあとものまね・信号ゲームは上限20で割る', () => {
    // 小学4年生の目安 0.55。9/20 = 0.45 は目安くらい、8/20 = 0.40 は目安より下。
    expect(compareWithGrade('sacc', 9, 'e4')).toBe('typical');
    expect(compareWithGrade('inhi', 8, 'e4')).toBe('below');
  });

  it('高校卒業以上は比べない', () => {
    expect(compareWithGrade('post', 0, 'graduated')).toBeNull();
    expect(riskEvidenceOf([{ key: 'post', lv: 0 }], 'graduated')).toEqual([]);
  });
});

describe('課題ブロック（M4）と、ブロックの並べ方', () => {
  it('お困りごとはドメインの優先して見る土台をピラミッドの順に返す', () => {
    expect(troubleBlocksOf(['ボタンやひも結びが苦手', '本や画面を見ているとすぐ疲れる', 'マスタにない困りごと'])).toEqual(['眼球運動', '運動のコントロール']);
  });

  it('目安より下の種目だけ、取り組み中の帯のブロックを課題ブロックに入れる', () => {
    expect(issueBlocksOf([{ key: 'post', lv: 5 }, { key: 'eyeh', lv: 12 }], 'e1', [])).toEqual(['姿勢', 'バランス', '眼球運動']);
    expect(issueBlocksOf([{ key: 'post', lv: 12 }], 'e1', [])).toEqual([]);
  });

  it('両方→目標だけ→課題だけ、同じ組は段の低い順（同じ段は付録Aの順）に並べる', () => {
    expect(rankedBlocksOf(['視覚', '学習・情緒／複合運動', '姿勢'], ['姿勢', '聴覚', '前庭覚']).map(({ block, source }) => `${source}:${block}`)).toEqual([
      'both:姿勢',
      'goal:視覚',
      'goal:学習・情緒／複合運動',
      'issue:前庭覚',
      'issue:聴覚',
    ]);
  });

  it('最重要にすべき領域は学習・情緒／複合運動を除いた先頭3つを、下の段から並べる', () => {
    expect(focusBlocksOf(['学習・情緒／複合運動', '目と手の連携'], ['学習・情緒／複合運動', '姿勢', 'バランス']).map(({ block }) => block))
      .toEqual(['姿勢', 'バランス', '目と手の連携']);
  });
});

describe('学年が上がったときの懸念（M6）', () => {
  const allCategories = ['行を読み飛ばす／読むところを見失う（絵本・教科書）', '順番を待てない／思いついたまま先に動く', '姿勢がすぐ崩れる／机に伏せる・寝転がる', 'ボールを投げる・受けるのが苦手', '忘れ物・なくし物が多い'];

  it('いまの段階の1つ先と3つ先を、その段階の最初の学年までの学年差つきで出す', () => {
    expect(concernStagesOf('k1', allCategories).map(({ label, gradesAhead }) => [label, gradesAhead])).toEqual([['年中', 1], ['小1', 3]]);
    // 中学は3学年で1段階。中学2年生から見た高校は2学年先で、3つ先は無い。
    expect(concernStagesOf('j2', allCategories).map(({ label, gradesAhead }) => [label, gradesAhead])).toEqual([['高校', 2]]);
    expect(concernStagesOf('h1', allCategories)).toEqual([]);
    expect(concernStagesOf('graduated', allCategories)).toEqual([]);
  });

  it('お困りごとのカテゴリに合う項目だけを選び、合う項目がない段階は出さない', () => {
    // 年長（k3）の1つ先は小1、3つ先は小3。E（忘れ物）は小1にだけある。
    expect(concernStagesOf('k3', ['忘れ物・なくし物が多い'])).toEqual([{
      label: '小1',
      theme: '学校適応',
      demand: '授業・宿題・体育・友だち関係など、新しいことが一気に始まる時期',
      gradesAhead: 1,
      concerns: ['忘れ物が多くなる'],
    }]);
    expect(concernStagesOf('k3', [])).toEqual([]);
  });
});

describe('方針とメニューの方向性のメニュー', () => {
  const AUDIENCES: MenuAudience[] = ['pre', 'low', 'high'];

  it('難易度は到達率の中央値で決め、0.32 以上で中級、0.55 以上で上級にする', () => {
    // ラインウォークの上限は30。中央値は 9/30＝0.30 と 10/30≒0.33。
    expect(menuLevelOf([{ key: 'post', lv: 0 }, { key: 'eyeh', lv: 9 }, { key: 'hand', lv: 30 }])).toBe('初級');
    expect(menuLevelOf([{ key: 'post', lv: 0 }, { key: 'eyeh', lv: 10 }, { key: 'hand', lv: 30 }])).toBe('中級');
    // 信号ゲームの上限は20。11/20 は境目ちょうどの 0.55。
    expect(menuLevelOf([{ key: 'inhi', lv: 10 }])).toBe('中級');
    expect(menuLevelOf([{ key: 'inhi', lv: 11 }])).toBe('上級');
    expect(menuLevelOf([])).toBe('初級');
  });

  it('対象区分は未就学・小1〜3・小4以上に分け、中学・高校も小4以上に寄せる', () => {
    expect(['k1', 'k3', 'e1', 'e3', 'e4', 'j1', 'h3', 'graduated'].map(menuAudienceOf))
      .toEqual(['pre', 'pre', 'low', 'low', 'high', 'high', 'high', 'high']);
  });

  it('対象区分に合うものから、難易度が合うもの → 隣の難易度の順に3件選ぶ', () => {
    // 前庭覚の初級は、シニアコーチの勧めで先頭に足した2件、続けて未就学児限定が並ぶ。
    expect(areaMenusOf('前庭覚', 'pre', '初級').map(({ name }) => name))
      .toEqual(['タオルの船_ブランケットver.', '綱渡り', '背中合わせぶらぶら（未就学児限定）']);
    // 勧めの2件も未就学児限定も対象が小3までなので、小4以上には出さず、足りない分を中級で埋める。
    expect(areaMenusOf('前庭覚', 'high', '初級').map(({ name }) => name)).toEqual(['バランス_座る', 'サイドロール', 'Vのポーズで転がる']);
    // 筋トレ系は中級として扱う。上級が1件しかないブロックは中級で埋める。
    expect(areaMenusOf('固有覚', 'high', '上級').map(({ name }) => name)).toEqual(['壁上り', 'タオル綱引き_横向き', 'タオル綱引き_股の下']);
  });

  it('どのブロック・対象区分・難易度でも、合うメニューを3件出し、同じ系列は2件までにする', () => {
    for (const block of PYRAMID_BLOCKS) {
      for (const audience of AUDIENCES) {
        for (const level of MENU_LEVELS) {
          const menus = areaMenusOf(block, audience, level);
          expect(menus, `${block}・${audience}・${level}`).toHaveLength(AREA_MENU_COUNT);
          expect(menus.every((menu) => menu.audiences.includes(audience))).toBe(true);
          const seriesCounts = menus.map((menu) => menus.filter((other) => other.series === menu.series).length);
          expect(Math.max(...seriesCounts)).toBeLessThanOrEqual(AREA_MENU_SERIES_MAX);
        }
      }
    }
  });
});
