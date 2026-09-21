/**
 * お子さまのお困りごと。保護者に見せる面は生活場面の5カテゴリ。
 * 各項目は内部で神経ドメイン（`domain` = NEURO_DOMAINS の id）に紐づけ、レポートの見立てに使う。
 *
 * 文言は保存値そのものなので変更＝過去データとの突き合わせ不能（AGENTS.md §6）。
 * 就学／未就学の2セットは統合する方針で調整中のため、ここでは文言を据え置いている。
 * 未就学セットの `domain` は、統合後の文言が決まるまでの暫定の紐づけ。
 */
export const TROUBLE_CATEGORIES = {
  sch: [
    { id: 'A', icon: '📖', title: '学習・学校生活', items: [
      { text: '行を読み飛ばす／読むところを見失う', domain: 4 },
      { text: '黒板を写すのが遅い・間に合わない', domain: 3 },
      { text: 'ふたつの指示を同時に持っていられない', domain: 7 },
    ] },
    { id: 'B', icon: '🔄', title: '落ち着き・切り替え', items: [
      { text: '順番を待てない／思いついたまま先に動く', domain: 7 },
      { text: 'いちど始めると切り替えられない', domain: 7 },
      { text: '落ち着いて座っていられない', domain: 2 },
    ] },
    { id: 'C', icon: '🧍', title: '姿勢・身体の使い方', items: [
      { text: '姿勢がすぐ崩れる／机に伏せる', domain: 6 },
      { text: '力加減が極端（強すぎる・弱すぎる）', domain: 6 },
      { text: '頭や体がよく傾く', domain: 3 },
    ] },
    { id: 'D', icon: '🤸', title: '運動・手先の不器用さ', items: [
      { text: 'ボールを投げる・受けるのが苦手', domain: 1 },
      { text: '字を書くと線がガタガタ／筆圧が不安定', domain: 1 },
      { text: '体育や遊びで、どこに立てばいいか分からない', domain: 5 },
    ] },
    { id: 'E', icon: '🏠', title: '日常生活・生活習慣', items: [
      { text: '朝の支度や着替えに時間がかかる', domain: 7 },
      { text: '忘れ物・なくし物が多い', domain: 5 },
      { text: '食事のときに姿勢が崩れる／よくこぼす', domain: 6 },
    ] },
  ],
  pre: [
    { id: 'A', icon: '📖', title: '見る・手を使う遊び', items: [
      { text: '絵本を見ているとき、見ているところを見失う', domain: 4 },
      { text: 'ぬり絵やお絵かきが枠から大きくはみ出す', domain: 3 },
      { text: '見本を見ながら積み木を同じに作れない', domain: 5 },
    ] },
    { id: 'B', icon: '🔄', title: '落ち着き・切り替え', items: [
      { text: '順番を待てない／先に飛び出してしまう', domain: 7 },
      { text: '遊びをやめて次に移るのに時間がかかる', domain: 7 },
      { text: 'じっと座っていられない', domain: 2 },
    ] },
    { id: 'C', icon: '🧍', title: '姿勢・身体の使い方', items: [
      { text: '床に座ると背中が丸まる・すぐ寝転ぶ', domain: 6 },
      { text: '転びやすい・つまずきやすい', domain: 6 },
      { text: '抱っこのとき体がぐにゃっとする', domain: 2 },
    ] },
    { id: 'D', icon: '🤸', title: '運動・手先の不器用さ', items: [
      { text: 'ボールを追いかけても取れない', domain: 1 },
      { text: 'スプーンやはさみがうまく使えない', domain: 1 },
      { text: 'ジャンプや片足立ちができない', domain: 1 },
    ] },
    { id: 'E', icon: '🏠', title: '日常生活・生活習慣', items: [
      { text: '着替えやボタンに時間がかかる', domain: 7 },
      { text: '食事のときによくこぼす', domain: 6 },
      { text: '靴を左右逆に履く', domain: 5 },
    ] },
  ],
} as const;

export type AgeGroup = keyof typeof TROUBLE_CATEGORIES;

export function troubleItemsOf(ageGroup: AgeGroup): string[] {
  return TROUBLE_CATEGORIES[ageGroup].flatMap((category) => category.items.map((item) => item.text));
}

export const ALL_TROUBLE_ITEMS = [...new Set(
  (Object.keys(TROUBLE_CATEGORIES) as AgeGroup[]).flatMap(troubleItemsOf),
)];

/** チェックされた困りごと（文言）から神経ドメインの id を引く。 */
export function troubleDomainOf(text: string): number | null {
  for (const ageGroup of Object.keys(TROUBLE_CATEGORIES) as AgeGroup[]) {
    for (const category of TROUBLE_CATEGORIES[ageGroup]) {
      const item = category.items.find((candidate) => candidate.text === text);
      if (item) return item.domain;
    }
  }
  return null;
}
