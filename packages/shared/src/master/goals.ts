/**
 * できるようになりたいこと。お困りごと（いま困っていること）とは別に、達成したい具体的なことを聞く。
 * アセスメントでは目標（COPM）を入れるときの候補として出す。選ぶと仮の文言の行を足し、その行に候補の id（`wantId`）を持たせる
 * （2026-11-10。それまでの「選んだ項目を保存しない」（2026-10-21）から、目標の行ごとに持つ形で戻した）。
 * 「事前アンケート項目一覧」のシート②を移植した（2026-10-11）。並び順もシートどおり（id は欠番・飛び番あり。
 * w10「ボールを蹴る・打つ」は w9 に統合して欠番。2026-10-11）。
 * 文言は事前アンケート（Googleフォーム）の選択肢と同じにする（取り込みは文言で照合する）。
 * group＝区分／menu＝対応するへやすぽアシストのメニューパッケージ
 * 目標のブロック（優先する領域）は、目標文・メモに、行に持たせた候補の文も加えて語彙表（GOAL_VOCABULARY）で読み取る
 * （自由に書き換えて語彙表に当たらない言い回しになっても、選んだ候補の分は効くようにするため）。
 */
export const WANT_ITEMS = [
  { id: 'w1', group: '運動', icon: '🪢', text: '縄跳びが跳べるようになりたい', menu: '前跳びパッケージ（Lv1〜6）／あやとび・交差とびパッケージ' },
  { id: 'w2', group: '運動', icon: '🤸', text: '鉄棒ができるようになりたい', menu: '逆上がりパッケージ（Lv1〜）／鉄棒ぶらさがり系' },
  { id: 'w3', group: '運動', icon: '📦', text: '跳び箱が跳べるようになりたい', menu: '跳び箱パッケージ（Lv1〜5）' },
  { id: 'w4', group: '運動', icon: '🤾', text: 'マット運動（前転・後転・側転）ができるようになりたい', menu: '前転／後転／ブリッジパッケージ' },
  { id: 'w5', group: '運動', icon: '🚲', text: '自転車に乗れるようになりたい', menu: '自転車パッケージ（Lv1〜）' },
  { id: 'w6', group: '運動', icon: '🏊', text: '泳げるようになりたい', menu: '水泳／クロールパッケージ（Lv1〜5）' },
  { id: 'w7', group: '運動', icon: '🏃', text: 'かけっこが速くなりたい', menu: 'かけっこパッケージ（Lv1〜5）' },
  { id: 'w8', group: '運動', icon: '🦘', text: 'スキップ・ケンケンができるようになりたい', menu: 'スキップ／けんけんパッケージ（Lv1〜5）' },
  { id: 'w9', group: '運動', icon: '⚾', text: '球技が上手になりたい', menu: 'ボール投げ／キャッチ／ボールを蹴る／ボールを打つパッケージ（Lv1〜6）' },
  { id: 'w23', group: '運動', icon: '🛝', text: '公園の遊具で遊べるようになりたい', menu: '体幹・全身／ぶらさがり・のぼり系（公園遊具）' },
  { id: 'w11', group: '運動', icon: '💃', text: '動きの模倣（ダンスなども含む）ができるようになりたい', menu: 'ダンスパッケージ（Lv1〜4）／あしあとものまね系' },
  { id: 'w12', group: '学習', icon: '✏️', text: '字をきれいに書けるようになりたい', menu: '書字パッケージ（Lv1〜5）' },
  { id: 'w16', group: '学習', icon: '📋', text: '板書を写すのが間に合うようになりたい', menu: 'ビジョントレーニング／スピードタッチ' },
  { id: 'w17', group: '学習', icon: '📖', text: '音読で行を飛ばさず読めるようになりたい', menu: 'ビジョントレーニング／タッチ系（追視）' },
  { id: 'w13', group: '生活', icon: '🥢', text: 'お箸が上手に使えるようになりたい', menu: 'お箸パッケージ（Lv1〜4）' },
  { id: 'w18', group: '生活', icon: '🪑', text: '姿勢よく座れるようになりたい', menu: '体幹・全身／低緊張パッケージ' },
  { id: 'w19', group: '生活', icon: '👕', text: '着替え・ボタンが自分でできるようになりたい', menu: '微細運動／手のコントロール' },
  { id: 'w20', group: '生活', icon: '🍚', text: '食事でこぼさず食べられるようになりたい', menu: '体幹・全身／微細運動' },
  { id: 'w21', group: '生活', icon: '⏰', text: '朝の支度を自分で進められるようになりたい', menu: '横断（土台づくりを優先）' },
  { id: 'w22', group: '気持ち・対人', icon: '🔄', text: '順番を待つ・気持ちを切り替えられるようになりたい', menu: '反応ゲーム／だるまさんが転んだ系' },
  { id: 'w14', group: '気持ち・対人', icon: '🌈', text: '自分に自信を持っていろんな事に挑戦してほしい', menu: '横断（土台づくりを優先）' },
  { id: 'w15', group: '気持ち・対人', icon: '👫', text: '友だちと一緒に遊べるようになりたい', menu: 'SST／横断（土台づくりを優先）' },
  { id: 'w24', group: '気持ち・対人', icon: '👂', text: '人の話を最後まで聞けるようになりたい', menu: '反応ゲーム／だるまさんが転んだ系／聞き取り課題' },
  { id: 'w25', group: '気持ち・対人', icon: '💬', text: '自分の気持ちを言葉で伝えられるようになりたい', menu: 'SST／横断（土台づくりを優先）' },
] as const satisfies readonly {
  id: string;
  group: string;
  icon: string;
  text: string;
  menu: string;
}[];

export type WantItem = (typeof WANT_ITEMS)[number];
export type WantId = WantItem['id'];

/** 候補の id の一覧（目標の行の `wantId` の検証に使う）。 */
export const WANT_IDS = WANT_ITEMS.map((item) => item.id) as [WantId, ...WantId[]];

export const WANT_GROUPS = ['運動', '学習', '生活', '気持ち・対人'] as const;

export function wantById(id: string): WantItem | null {
  return WANT_ITEMS.find((item) => item.id === id) ?? null;
}

/**
 * 事前アンケートの「その他（自由記載）」欄（wf1 / wf2）。選択肢にない「できるようになりたいこと」を書いてもらう。
 * ツールでは選択肢にせず、目標（COPM）の文言として入力する（自由記載を含めて最大4つ＝COPM_MAX のため）。
 */
export const WANT_FREE_ENTRY = {
  ids: ['wf1', 'wf2'],
  group: 'その他（自由記載）',
  icon: '✍️',
  menu: '横断（土台づくりを優先）',
  examples: ['階段をスムーズに昇り降りできるようになりたい', '体がやわらかくなって開脚ができるようになりたい'],
} as const;

/** 目標欄に入れる仮の文言。「〜たい」「〜してほしい」を言い切りに直す。 */
export function wantToGoalText(text: string): string {
  return text
    .replace(/なりたい$/, 'なる')
    .replace(/してほしい$/, 'する')
    .replace(/したい$/, 'する')
    .replace(/たい$/, 'る');
}

/**
 * COPM形式の目標設定（最大4件）。
 * 遂行度／満足度／重要度 を 1〜10 で採点する。
 * 遂行度と満足度を分けるのが要点で、「できていても納得していない」状態を取りこぼさない。
 * 重要度は今回どれに手をつけるかの並べ替えにだけ使う。
 */
export const COPM_FIELDS = [
  { key: 'performance', name: '遂行度', hint: 'いまどれくらいできているか' },
  { key: 'satisfaction', name: '満足度', hint: 'その状態にどれくらい納得しているか' },
  { key: 'importance', name: '重要度', hint: '取り組む順番を決めるために使う' },
] as const;

export const COPM_MAX = 4;
export const COPM_RECORD_MAX = COPM_MAX * 2;
export const COPM_SCORE_MIN = 1;
export const COPM_SCORE_MAX = 10;
export const COPM_SCORE_DEFAULT = 5;
