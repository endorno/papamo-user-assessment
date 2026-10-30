import type { ExerciseKey } from './exercises';

/**
 * 発達ピラミッド。15のブロックが5つの段に積み上がり、下の段が育たないと上の段も育たない。
 * 段は 1（いちばん下＝感覚）〜5。段の中の並びは仕様の付録A の順で、同じ段の中に優劣はない。
 * レポートでは上の段から順に描く。
 */
export const PYRAMID_TIERS = [
  { tier: 1, label: 'いちばん下の段', items: ['前庭覚', '固有覚', '触覚', '視覚', '聴覚'] },
  { tier: 2, label: '下から2段目', items: ['姿勢', 'バランス', '身体の位置', '眼球運動'] },
  { tier: 3, label: 'まん中の段', items: ['姿勢調整', 'ボディイメージ', '運動のコントロール'] },
  { tier: 4, label: '上から2段目', items: ['目と手の連携', '言語機能'] },
  { tier: 5, label: 'いちばん上の段', items: ['学習・情緒／複合運動'] },
] as const;

export type PyramidBlock = (typeof PYRAMID_TIERS)[number]['items'][number];

/** 15のブロックを下の段から、段の中は付録A の順に並べたもの。並べ替えの基準に使う。 */
export const PYRAMID_BLOCKS: readonly PyramidBlock[] = PYRAMID_TIERS.flatMap((row) => row.items);

export function isPyramidBlock(value: string): value is PyramidBlock {
  return PYRAMID_BLOCKS.some((block) => block === value);
}

export function pyramidTierOf(block: PyramidBlock): number {
  return PYRAMID_TIERS.find((row) => row.items.some((candidate) => candidate === block))?.tier ?? 0;
}

/** 段の低い順、同じ段は付録A の順に並べる比較関数。 */
export function compareByPyramidPosition(first: PyramidBlock, second: PyramidBlock): number {
  return PYRAMID_BLOCKS.indexOf(first) - PYRAMID_BLOCKS.indexOf(second);
}

/**
 * ブロックごとの、その段で育つこと（definition）と、育ったときに見える変化（effect）。仕様の付録A（2026-10-28）。
 * 保護者向けレポート2枚目の「最重要にすべき領域」で「ここが育つと{effect}ため、…」の形で使う。
 */
export const PYRAMID_BLOCK_COPY: Record<PyramidBlock, { definition: string; effect: string }> = {
  前庭覚: { definition: '重力の向きと体の傾きを感じ取る', effect: '姿勢が崩れるまでの時間が延びる／疲れにくくなる' },
  固有覚: { definition: '自分の手足がどれくらいの力で動いているかを感じ取る', effect: '力加減が安定する／物の扱いが乱暴でなくなる' },
  触覚: { definition: '触れた感じを受け取り、過敏さ・鈍さを整える', effect: '道具や衣服への抵抗が減る' },
  視覚: { definition: '見たものを線や形として整理して受け取る', effect: '探す・見比べるのが速くなる' },
  聴覚: { definition: '聞いた音を言葉や合図として受け取る', effect: '指示が通りやすくなる' },
  姿勢: { definition: '座る・立つを保つ', effect: '机に伏せる・座り直しが減る' },
  バランス: { definition: 'ぐらついても立て直す', effect: '転びにくくなる／片足で支えていられる' },
  身体の位置: { definition: '自分と物の位置関係をつかむ', effect: 'ぶつかる・つまずくが減る' },
  眼球運動: { definition: '目を素早く正確に動かし、見たいところで止める', effect: '行を飛ばさず読める／黒板から手元へ戻るのが速くなる' },
  姿勢調整: { definition: '動きながら姿勢を保ち直す', effect: '動いても字が乱れにくくなる' },
  ボディイメージ: { definition: '自分の体の地図を更新しながら動く', effect: '見本どおりに体を動かせる／力の基準が安定する' },
  運動のコントロール: { definition: '予測と結果のズレに気づいて直す', effect: '同じ動きを繰り返しても精度が落ちにくい' },
  目と手の連携: { definition: '見ながら手を合わせる', effect: 'キャッチ・書字・道具の操作が安定する' },
  言語機能: { definition: '聞く・話す・言葉で考える', effect: '説明を聞いて動ける' },
  '学習・情緒／複合運動': { definition: '決まりの中で止まる・切り替える', effect: '集団の活動に参加しやすくなる' },
};

/**
 * 神経ドメイン（DN 1〜7）。お子さまのお困りごとの各項目が内部でここへ紐づく。仕様の付録E。
 * priorityKey＝主に見る種目（いまの判定では使わない。お困りごとを実測で裏づけるときの手がかり）／
 * parentLabel＝背景にありそうな力／block＝優先して見る土台（そのドメインのお困りごとが指すブロック）
 */
export interface NeuroDomain {
  id: number;
  title: string;
  priorityKey: ExerciseKey;
  parentLabel: string;
  block: PyramidBlock;
}

export const NEURO_DOMAINS: readonly NeuroDomain[] = [
  { id: 1, title: '運動コントロール', priorityKey: 'hand', parentLabel: '力の加減とタイミングを合わせる力', block: '運動のコントロール' },
  { id: 2, title: '呼吸・自律神経', priorityKey: 'post', parentLabel: '体の力を抜いて切り替える力', block: '前庭覚' },
  { id: 3, title: '目と首の安定性', priorityKey: 'post', parentLabel: '目と首を一緒に安定させる力', block: '眼球運動' },
  { id: 4, title: '視覚入力の精度', priorityKey: 'sacc', parentLabel: '目を素早く正確に動かす力', block: '視覚' },
  { id: 5, title: '空間認知', priorityKey: 'eyeh', parentLabel: 'まわりとの位置関係をつかむ力', block: '身体の位置' },
  { id: 6, title: '身体図式', priorityKey: 'post', parentLabel: '自分の体の位置と力加減をつかむ力', block: 'ボディイメージ' },
  { id: 7, title: '実行機能・抑制', priorityKey: 'inhi', parentLabel: '止まる・切り替える・がまんする力', block: '学習・情緒／複合運動' },
];
