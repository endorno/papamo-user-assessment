/**
 * 取り組みの発達（Engagement Profile）。
 * 運動の到達Lvとは独立に「どう取り組めたか」を記録する。
 * levels は順序尺度（添字が大きいほど自立・般化）で、3か月後に同じ設問で差分を見る。
 */
export const ENGAGEMENT_AXES = [
  {
    key: 'dur',
    title: '参加の持続',
    subtitle: 'どれくらい取り組めたか',
    levels: [
      '課題の場に入れない／別のことをしている',
      '課題の一部だけ取り組める（1回だけ・途中まで）',
      '短時間なら最後まで取り組める（1課題）',
      '複数の課題を続けて取り組める',
      'レッスンを通して取り組める',
    ],
  },
  {
    key: 'sup',
    title: '必要な支援',
    subtitle: 'どれくらい支えると取り組めるか',
    levels: [
      '体に触れて動かすと取り組める（身体介助）',
      '一緒に同時にやると取り組める（模倣）',
      '手本を見せると取り組める',
      '声かけで取り組める',
      '最初の説明だけで取り組める',
    ],
  },
  {
    key: 'mot',
    title: '課題への向かい方',
    subtitle: '提示された課題にどう向かえるか',
    levels: [
      '自分の好きなこと・やり方を中心に取り組む',
      '好きな要素や環境調整があれば、提示された課題にも取り組める',
      '提示された課題に取り組める',
      '苦手・難しい課題にも取り組める',
      '新しい・苦手・難しい課題にも自分から挑戦できる',
    ],
  },
  {
    key: 'rec',
    title: '切り替えと立て直し',
    subtitle: 'うまくいかなかったときの戻り方',
    levels: [
      '崩れると戻れない／終了になる',
      '離れて休むと戻れる',
      '声かけがあればその場で戻れる',
      '自分で気持ちを立て直せる',
      'うまくいかなくても、自分で切り替えて取り組みを続けられる',
    ],
  },
] as const;

export type EngagementKey = (typeof ENGAGEMENT_AXES)[number]['key'];

export const ENGAGEMENT_LEVEL_COUNT = 5;

/**
 * 環境調整（今回きいた条件）。
 * 順序尺度ではなく profile。高い低いではなく「この子に効いた条件」の記録で、
 * 次のレッスンで何を用意すれば取り組めるかの引き継ぎに使う。
 */
export const ENVIRONMENT_SUPPORT_GROUPS = [
  {
    group: '情報の入り方',
    items: [
      { key: 'e-vis', text: '視覚（手本・図・写真を見せる）' },
      { key: 'e-lng', text: '言語（説明・声かけ・数える）' },
      { key: 'e-bod', text: '身体（触れる・介助・一緒に動く）' },
      { key: 'e-dem', text: '実演（やって見せる）' },
      { key: 'e-mrk', text: '目印（線・フープ・置く位置を決める）' },
    ],
  },
  {
    group: '見通しの立て方',
    items: [
      { key: 'e-tim', text: 'タイマー（終わりを時間で示す）' },
      { key: 'e-cnt', text: '回数（「あと3回」と数で示す）' },
      { key: 'e-ord', text: '順番表（やることを先に並べて見せる）' },
      { key: 'e-cho', text: '選択肢（2つから選んでもらう）' },
      { key: 'e-pre', text: '予告（次にやることを先に伝える）' },
    ],
  },
  {
    group: '動機づけ',
    items: [
      { key: 'e-fav', text: '好きな要素（好きなキャラ・題材・道具）' },
      { key: 'e-cmp', text: '競争（記録・タイムに挑む）' },
      { key: 'e-vs', text: '対決（コーチや保護者と勝負する）' },
      { key: 'e-rol', text: '役割（先生役・お手本役をまかせる）' },
      { key: 'e-sto', text: 'ストーリー（設定・ごっこの中に入れる）' },
    ],
  },
  {
    group: '負荷の下げ方',
    items: [
      { key: 'e-sht', text: '短くする（1回を短時間で区切る）' },
      { key: 'e-esy', text: '易しくする（一段下から入る）' },
      { key: 'e-tgt', text: '一緒にやる（同時・模倣で入る）' },
      { key: 'e-qui', text: '静かな環境（刺激を減らす）' },
      { key: 'e-brk', text: '休憩を挟む（離れてから戻る）' },
    ],
  },
] as const;

export const ENVIRONMENT_SUPPORT_ITEMS = ENVIRONMENT_SUPPORT_GROUPS.flatMap((group) => (
  group.items.map((item) => ({ ...item, group: group.group }))
));

