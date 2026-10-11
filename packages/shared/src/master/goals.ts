import type { ExerciseKey } from './exercises';

/**
 * できるようになりたいこと（複数選択可）。
 * お困りごと（いま困っていること）とは別に、達成したい具体的なことを聞く。
 * 「事前アンケート項目一覧」のシート②を移植した（2026-10-11）。並び順もシートどおり（id は欠番・飛び番あり）。
 * id は保存値なので振り直さない（w10「ボールを蹴る・打つ」は w9 に統合して欠番。2026-10-11）。
 * 文言は事前アンケート（Googleフォーム）の選択肢と同じにする（取り込みは文言で照合する）。
 * group＝区分／menu＝対応するへやすぽアシストのメニューパッケージ／axis＝主に支える種目
 */
export const WANT_ITEMS = [
  { id: 'w1', group: '運動', icon: '🪢', text: '縄跳びが跳べるようになりたい', menu: '前跳びパッケージ（Lv1〜6）／あやとび・交差とびパッケージ', axis: 'post' },
  { id: 'w2', group: '運動', icon: '🤸', text: '鉄棒ができるようになりたい', menu: '逆上がりパッケージ（Lv1〜）／鉄棒ぶらさがり系', axis: 'post' },
  { id: 'w3', group: '運動', icon: '📦', text: '跳び箱が跳べるようになりたい', menu: '跳び箱パッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w4', group: '運動', icon: '🤾', text: 'マット運動（前転・後転・側転）ができるようになりたい', menu: '前転／後転／ブリッジパッケージ', axis: 'post' },
  { id: 'w5', group: '運動', icon: '🚲', text: '自転車に乗れるようになりたい', menu: '自転車パッケージ（Lv1〜）', axis: 'post' },
  { id: 'w6', group: '運動', icon: '🏊', text: '泳げるようになりたい', menu: '水泳／クロールパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w7', group: '運動', icon: '🏃', text: 'かけっこが速くなりたい', menu: 'かけっこパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w8', group: '運動', icon: '🦘', text: 'スキップ・ケンケンができるようになりたい', menu: 'スキップ／けんけんパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w9', group: '運動', icon: '⚾', text: '球技が上手になりたい', menu: 'ボール投げ／キャッチ／ボールを蹴る／ボールを打つパッケージ（Lv1〜6）', axis: 'eyeh' },
  { id: 'w23', group: '運動', icon: '🛝', text: '公園の遊具で遊べるようになりたい', menu: '体幹・全身／ぶらさがり・のぼり系（公園遊具）', axis: 'post' },
  { id: 'w11', group: '運動', icon: '💃', text: '動きの模倣（ダンスなども含む）ができるようになりたい', menu: 'ダンスパッケージ（Lv1〜4）／あしあとものまね系', axis: 'sacc' },
  { id: 'w12', group: '学習', icon: '✏️', text: '字をきれいに書けるようになりたい', menu: '書字パッケージ（Lv1〜5）', axis: 'hand' },
  { id: 'w16', group: '学習', icon: '📋', text: '板書を写すのが間に合うようになりたい', menu: 'ビジョントレーニング／スピードタッチ', axis: 'sacc' },
  { id: 'w17', group: '学習', icon: '📖', text: '音読で行を飛ばさず読めるようになりたい', menu: 'ビジョントレーニング／タッチ系（追視）', axis: 'sacc' },
  { id: 'w13', group: '生活', icon: '🥢', text: 'お箸が上手に使えるようになりたい', menu: 'お箸パッケージ（Lv1〜4）', axis: 'hand' },
  { id: 'w18', group: '生活', icon: '🪑', text: '姿勢よく座れるようになりたい', menu: '体幹・全身／低緊張パッケージ', axis: 'post' },
  { id: 'w19', group: '生活', icon: '👕', text: '着替え・ボタンが自分でできるようになりたい', menu: '微細運動／手のコントロール', axis: 'hand' },
  { id: 'w20', group: '生活', icon: '🍚', text: '食事でこぼさず食べられるようになりたい', menu: '体幹・全身／微細運動', axis: 'post' },
  { id: 'w21', group: '生活', icon: '⏰', text: '朝の支度を自分で進められるようになりたい', menu: '横断（土台づくりを優先）', axis: 'inhi' },
  { id: 'w22', group: '気持ち・対人', icon: '🔄', text: '順番を待つ・気持ちを切り替えられるようになりたい', menu: '反応ゲーム／だるまさんが転んだ系', axis: 'inhi' },
  { id: 'w14', group: '気持ち・対人', icon: '🌈', text: '自分に自信を持っていろんな事に挑戦してほしい', menu: '横断（土台づくりを優先）', axis: 'post' },
  { id: 'w15', group: '気持ち・対人', icon: '👫', text: '友だちと一緒に遊べるようになりたい', menu: 'SST／横断（土台づくりを優先）', axis: 'inhi' },
  { id: 'w24', group: '気持ち・対人', icon: '👂', text: '人の話を最後まで聞けるようになりたい', menu: '反応ゲーム／だるまさんが転んだ系／聞き取り課題', axis: 'inhi' },
  { id: 'w25', group: '気持ち・対人', icon: '💬', text: '自分の気持ちを言葉で伝えられるようになりたい', menu: 'SST／横断（土台づくりを優先）', axis: 'inhi' },
] as const satisfies readonly {
  id: string;
  group: string;
  icon: string;
  text: string;
  menu: string;
  axis: ExerciseKey;
}[];

export type WantItem = (typeof WANT_ITEMS)[number];

export const WANT_GROUPS = ['運動', '学習', '生活', '気持ち・対人'] as const;
export const WANT_MAX = 4;

export function wantById(id: string): WantItem | null {
  return WANT_ITEMS.find((item) => item.id === id) ?? null;
}

/**
 * 事前アンケートの「その他（自由記載）」欄（wf1 / wf2）。選択肢にない「できるようになりたいこと」を書いてもらう。
 * ツールでは選択肢にせず、目標（COPM）の文言として入力する（自由記載を含めて最大4つ＝COPM_MAX のため）。
 * 主に支える種目は「本文のキーワードから推定する」方針で、推定は未実装のため axis を持たない。
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

/** レポートで短く並べるための表記。 */
export function wantShortText(text: string): string {
  return text
    .replace(/ができるようになりたい$/, '')
    // 「〜ようになりたい」を先に外す。先に「〜になりたい」を外すと「よう」が残る。
    .replace(/ようになりたい$/, '')
    .replace(/になりたい$/, '')
    .replace(/してほしい$/, '')
    .replace(/たい$/, '')
    .replace(/^泳げる$/, '泳げるようになる');
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
export const COPM_SCORE_MIN = 1;
export const COPM_SCORE_MAX = 10;
export const COPM_SCORE_DEFAULT = 5;
