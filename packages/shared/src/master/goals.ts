import type { ExerciseKey } from './exercises';

/**
 * できるようになりたいこと（複数選択可）。
 * お困りごと（いま困っていること）とは別に、達成したい具体的なことを聞く。
 * menu＝対応するへやすぽアシストのメニューパッケージ／axis＝主に支える種目
 */
export const WANT_ITEMS = [
  { id: 'w1', group: '運動', icon: '🪢', text: '縄跳びが跳べるようになりたい', menu: '前跳びパッケージ（Lv1〜6）／あやとび・交差とびパッケージ', axis: 'post' },
  { id: 'w2', group: '運動', icon: '🤸', text: '鉄棒（逆上がり）ができるようになりたい', menu: '逆上がりパッケージ（Lv1〜）', axis: 'post' },
  { id: 'w3', group: '運動', icon: '📦', text: '跳び箱が跳べるようになりたい', menu: '跳び箱パッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w4', group: '運動', icon: '🤾', text: 'マット運動（前転・後転・側転）ができるようになりたい', menu: '前転／後転／ブリッジパッケージ', axis: 'post' },
  { id: 'w5', group: '運動', icon: '🚲', text: '自転車に乗れるようになりたい', menu: '自転車パッケージ（Lv1〜）', axis: 'post' },
  { id: 'w6', group: '運動', icon: '🏊', text: '泳げるようになりたい', menu: '水泳／クロールパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w7', group: '運動', icon: '🏃', text: 'かけっこが速くなりたい', menu: 'かけっこパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w8', group: '運動', icon: '🦘', text: 'スキップ・ケンケンができるようになりたい', menu: 'スキップ／けんけんパッケージ（Lv1〜5）', axis: 'post' },
  { id: 'w9', group: '運動', icon: '⚾', text: 'ボールを投げる・受けるのが上手になりたい', menu: 'ボール投げ／キャッチパッケージ（Lv1〜6）', axis: 'eyeh' },
  { id: 'w10', group: '運動', icon: '⚽', text: 'ボールを蹴る・打つのが上手になりたい', menu: 'ボールを蹴る／ボールを打つパッケージ（Lv1〜6）', axis: 'eyeh' },
  { id: 'w11', group: '運動', icon: '💃', text: 'ダンスの振りを覚えて踊れるようになりたい', menu: 'ダンスパッケージ（Lv1〜4）', axis: 'sacc' },
  { id: 'w12', group: '学習', icon: '✏️', text: '字をきれいに書けるようになりたい', menu: '書字パッケージ（Lv1〜5）', axis: 'hand' },
  { id: 'w16', group: '学習', icon: '📋', text: '板書を写すのが間に合うようになりたい', menu: 'ビジョントレーニング／スピードタッチ', axis: 'sacc' },
  { id: 'w17', group: '学習', icon: '📖', text: '音読で行を飛ばさず読めるようになりたい', menu: 'ビジョントレーニング／タッチ系（追視）', axis: 'sacc' },
  { id: 'w18', group: '学習', icon: '🪑', text: '授業中に座っていられるようになりたい', menu: '体幹・全身／低緊張パッケージ', axis: 'post' },
  { id: 'w13', group: '生活', icon: '🥢', text: 'お箸が上手に使えるようになりたい', menu: 'お箸パッケージ（Lv1〜4）', axis: 'hand' },
  { id: 'w19', group: '生活', icon: '👕', text: '着替え・ボタンが自分でできるようになりたい', menu: '微細運動／手のコントロール', axis: 'hand' },
  { id: 'w20', group: '生活', icon: '🍚', text: '食事でこぼさず食べられるようになりたい', menu: '体幹・全身／微細運動', axis: 'post' },
  { id: 'w21', group: '生活', icon: '⏰', text: '朝の支度を自分で進められるようになりたい', menu: '横断（土台づくりを優先）', axis: 'inhi' },
  { id: 'w22', group: '気持ち・対人', icon: '🔄', text: '順番を待つ・気持ちを切り替えられるようになりたい', menu: '反応ゲーム／だるまさんが転んだ系', axis: 'inhi' },
  { id: 'w14', group: '気持ち・対人', icon: '🏫', text: '体育の授業に自信をもって参加したい', menu: '横断（土台づくりを優先）', axis: 'post' },
  { id: 'w15', group: '気持ち・対人', icon: '👫', text: '友だちと一緒に遊べるようになりたい', menu: 'SST／横断（土台づくりを優先）', axis: 'inhi' },
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

/** 目標欄に入れる仮の文言。「〜たい」を言い切りに直す。 */
export function wantToGoalText(text: string): string {
  return text
    .replace(/なりたい$/, 'なる')
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
    .replace(/のが上手$/, '')
    .replace(/たい$/, '')
    .replace(/参加し$/, '参加')
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
