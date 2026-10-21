import type { ExerciseKey } from './exercises';

/**
 * 育ちのピラミッド。下の段の土台から上へ積み上がる。
 * 段は 1（いちばん下＝感覚）〜5。レポートでは上から順に描く。
 */
export const PYRAMID_TIERS = [
  { tier: 1, label: 'いちばん下の段', items: ['聴覚', '前庭覚', '固有覚', '触覚', '視覚'] },
  { tier: 2, label: '下から2段目', items: ['姿勢', 'バランス', '身体の位置', '眼球運動'] },
  { tier: 3, label: 'まん中の段', items: ['姿勢調整', 'ボディイメージ', '運動のコントロール'] },
  { tier: 4, label: '上から2段目', items: ['目と手の連携', '言語機能'] },
  { tier: 5, label: 'いちばん上の段', items: ['学習・情緒／複合運動'] },
] as const;

export type PyramidItem = (typeof PYRAMID_TIERS)[number]['items'][number];

export function pyramidTierLabel(item: string): string {
  return PYRAMID_TIERS.find((row) => row.items.some((candidate) => candidate === item))?.label ?? '';
}

/**
 * ピラミッドの各要素の、保護者向けの短い定義（definition）と、育つと何が変わるか（effect）。
 * 保護者向けレポート2枚目の「最重要にすべき領域」で「ここが育つと{effect}ため、…」の形で使う。
 * 【仮】PdM の文言が届くまでの仮置き（2026-10-21）。前庭覚・身体の位置の定義と固有覚の定義の書き出しは、変更依頼の例から取った。
 */
export const PYRAMID_ELEMENT_COPY: Record<PyramidItem, { definition: string; effect: string }> = {
  聴覚: { definition: '音を聞き分けて、言葉や合図を受け取る', effect: '話や合図を聞き取りやすくなる' },
  前庭覚: { definition: '重力の向きと体の傾きを感じ取る', effect: '姿勢を保つのに使う力が減る' },
  固有覚: { definition: '自分の手足がどれくらいの力で動いているかを感じ取る', effect: '力の入れすぎ・抜けすぎが減る' },
  触覚: { definition: '触れたものの形や手ざわりを感じ分ける', effect: '道具や物を落ち着いて扱いやすくなる' },
  視覚: { definition: '見たものの形や位置を正しく受け取る', effect: '見て判断するまでが速くなる' },
  姿勢: { definition: '体の軸をまっすぐに保つ', effect: '座る・立つ姿勢が崩れにくくなる' },
  バランス: { definition: 'ぐらついても体を立て直す', effect: '動きながらでも転びにくくなる' },
  身体の位置: { definition: '自分と物の位置関係をつかむ', effect: 'ぶつかる・取り損ねることが減る' },
  眼球運動: { definition: '頭が動いても、見たいものに目を合わせ続ける', effect: '読む・写すときに目が疲れにくくなる' },
  姿勢調整: { definition: '動きに合わせて姿勢を細かく整える', effect: '長い時間の活動でも姿勢を保ちやすくなる' },
  ボディイメージ: { definition: '自分の体の大きさや形を体の中でつかむ', effect: '真似をする・道具を使う動きがスムーズになる' },
  運動のコントロール: { definition: '力の加減とタイミングを合わせる', effect: '動きのばらつきが減る' },
  目と手の連携: { definition: '見たものに合わせて手を動かす', effect: '書く・切る・捕る動きが安定する' },
  言語機能: { definition: '言葉で考え、伝える', effect: '説明を聞いて動けることが増える' },
  '学習・情緒／複合運動': { definition: '止まる・切り替える・がまんする', effect: '落ち着いて学習や遊びに取り組みやすくなる' },
};

/**
 * 神経ドメイン（DN 1〜7）。お子さまのお困りごとの各項目が内部でここへ紐づく。
 * priorityKey＝そのドメインを主に支える種目／pyramid＝ピラミッド上の位置
 * parentLabel・parentText は保護者向けの平易な言い換え（神経名・部位名を使わない）。
 */
export interface NeuroDomain {
  id: number;
  title: string;
  region: string;
  priorityKey: ExerciseKey;
  pyramid: string;
  parentLabel: string;
  parentText: string;
  signs: readonly string[];
  /** この帯まで到達していないと実測では判断できない、という条件。 */
  bandCheck?: { key: ExerciseKey; band: string };
}

export const NEURO_DOMAINS: readonly NeuroDomain[] = [
  {
    id: 1,
    title: '運動コントロール',
    region: '小脳半球',
    priorityKey: 'hand',
    pyramid: '運動のコントロール',
    parentLabel: '力の加減とタイミングを合わせる力',
    parentText: '体は「こう動かすとこうなるはず」という見通しを立てて動いています。この見通しと実際の結果がずれたとき、そのずれに気づいて直す働きがまだ育っている途中です。回数をこなすことよりも、ずれに気づける形でくり返すことが要点になります。',
    signs: ['ボールを投げても距離や方向が毎回バラバラ', 'リズム運動（縄跳び/手拍子）が合わない', '走ると腕と脚の動きがちぐはぐ', '字を書くと線がガタガタ', '模倣運動が遅い（先生の動きをすぐ真似できない）'],
  },
  {
    id: 2,
    title: '呼吸・自律神経',
    region: '小脳虫部',
    priorityKey: 'post',
    pyramid: '前庭覚',
    parentLabel: '体の力を抜いて切り替える力',
    parentText: '姿勢を保つ働きと、呼吸のリズムを整える働きは、体の中でつながっています。ここが育っていないと、動くたびに息が上がりやすく、疲れやすくなります。足からの刺激で育つところなので、足を使う遊びから入っていきます。',
    signs: ['緊張するとすぐ息が浅くなる', 'ちょっとした刺激で過呼吸', '落ち着いて座れない', '環境変化で強く不安になる', '胃痛や吐き気をよく訴える'],
  },
  {
    id: 3,
    title: '目と首の安定性',
    region: '小脳片葉',
    priorityKey: 'post',
    pyramid: '眼球運動',
    parentLabel: '目と首を一緒に安定させる力',
    parentText: '頭が動いても、見ているものがぶれないように目を調整する働きです。育つ順番が決まっていて、頭が安定する → 視線が安定する → 動きながら見ていられる → 動くものを目で追える、と進みます。順番を飛ばして「目で追う練習」だけをしても身につきません。',
    signs: ['本を読むとすぐ疲れる', '画面を見る姿勢が極端に近い', '頭がよく傾く', '乗り物酔いしやすい', '黒板→ノートの視線移動が遅い'],
    // この帯まで到達していないと、実測では判断できない（未測定として扱う）。
    bandCheck: { key: 'post', band: 'VOR' },
  },
  {
    id: 4,
    title: '視覚入力の精度',
    region: '一次視覚野',
    priorityKey: 'sacc',
    pyramid: '視覚',
    parentLabel: '目を素早く正確に動かす力',
    parentText: '目に入った情報を、線や形や明るさに分けて整理する入口の働きです。ここが粗いと、見えてはいるのに、体を動かすための情報として使えない状態になります。視力の良し悪しとは別のことです。',
    signs: ['行を読み飛ばす', '文字の形をよく間違える', '板書を写すのが遅い', '物を見つけられない', '図形認識が苦手'],
  },
  {
    id: 5,
    title: '空間認知',
    region: '頭頂葉—海馬—前頭葉',
    priorityKey: 'eyeh',
    pyramid: '身体の位置',
    parentLabel: 'まわりとの位置関係をつかむ力',
    parentText: '自分の体を基準にして、まわりの空間をとらえる感覚です。目のはしで見えている情報・重力の向き・体の感覚の3つを材料に作られます。ここが揺れていると、人が多い場所で何が起きているかをつかみにくくなることがあります。',
    signs: ['よく物にぶつかる', '道順を覚えられない', '遊びや体育で、自分がどこに立てばいいかわからない', '作業の段取りが苦手', '遊びのルール理解が遅い'],
  },
  {
    id: 6,
    title: '身体図式',
    region: '身体図式',
    priorityKey: 'post',
    pyramid: 'ボディイメージ',
    parentLabel: '自分の体の位置と力加減をつかむ力',
    parentText: '言葉にはできない「自分の体の地図」のことです。触れた感じや体の内側の感覚で作られ、見ることと重力の感覚で日々更新されます。更新されないと古い地図のまま動くことになり、姿勢や力の基準が毎回変わります。筋力の問題ではありません。',
    signs: ['姿勢がすぐ崩れる', '力加減が極端', '書字の筆圧が不安定', '体の大きさを把握できない', '転びやすい'],
  },
  {
    id: 7,
    title: '実行機能・抑制',
    region: '前頭前野',
    priorityKey: 'inhi',
    pyramid: '学習・情緒／複合運動',
    parentLabel: '止まる・切り替える・がまんする力',
    parentText: '動きを止めておく働きと、決まりを差し替える働きです。姿勢や見ることの負担が大きいと、こちらが先に崩れます。ここだけを取り出して練習するより、下の土台の負担を減らすほうが先になります。',
    signs: ['順番を待てない', 'いちど始めると切り替えられない', '思いついたまま先に動く', '負けると強く崩れる', 'ふたつの指示を同時に持てない'],
  },
];

