import { NEURO_DOMAINS, type NeuroDomain } from './domains';

/**
 * お子さまのお困りごと（5カテゴリ × 6項目）。就学・未就学で共通のセット。
 * 「事前アンケート項目一覧」のシート①を移植した（2026-10-11）。並び順もシートどおり。
 * 各項目は内部で神経ドメイン（`domain` = NEURO_DOMAINS の id）に紐づき、レポートの見立てに使う。
 * シートの「発達ピラミッド」「育てたい力」はドメインから一意に決まるため持たず、troubleProfileOf で引く。
 *
 * 文言は保存値そのもの（事前アンケートの `trouble` 列で渡す値も同じ）なので、
 * 変更＝過去データとの突き合わせ不能（AGENTS.md §6）。
 */
export const TROUBLE_CATEGORIES = [
  { id: 'A', icon: '📖', title: '学習・見る・手を使う', items: [
    { text: '行を読み飛ばす／読むところを見失う（絵本・教科書）', domain: 4 },
    { text: '黒板やお手本を写すのが遅い・間に合わない', domain: 3 },
    { text: 'ぬり絵や書字が枠から大きくはみ出す', domain: 3 },
    { text: '見本を見ながら積み木やブロックを同じに作れない', domain: 5 },
    { text: 'ふたつの指示を同時に持っていられない', domain: 7 },
    { text: '本や画面を見ているとすぐ疲れる', domain: 3 },
  ] },
  { id: 'B', icon: '🔄', title: '落ち着き・切り替え', items: [
    { text: '順番を待てない／思いついたまま先に動く', domain: 7 },
    { text: 'いちど始めると切り替えられない', domain: 7 },
    { text: '落ち着いて座っていられない', domain: 2 },
    { text: '負けたり失敗したりすると強く崩れる', domain: 7 },
    { text: '環境が変わると強く不安になる', domain: 2 },
    { text: 'ざわざわした場所が苦手', domain: 5 },
  ] },
  { id: 'C', icon: '🧍', title: '姿勢・身体の使い方', items: [
    { text: '姿勢がすぐ崩れる／机に伏せる・寝転がる', domain: 6 },
    { text: '力加減が極端（強すぎる・弱すぎる）', domain: 6 },
    { text: '座っているときに頭や体がよく傾く', domain: 3 },
    { text: 'すぐ「疲れた」と言う／疲れやすい', domain: 2 },
    { text: '自分の体の大きさの感覚がつかめていない', domain: 6 },
    { text: '片足立ちやジャンプがふらつく', domain: 1 },
  ] },
  { id: 'D', icon: '🤸', title: '運動・手先の不器用さ', items: [
    { text: 'ボールを投げる・受けるのが苦手', domain: 1 },
    { text: '字を書くと線がガタガタ／筆圧が不安定', domain: 1 },
    { text: 'リズム運動（縄跳び・手拍子）が合わない', domain: 1 },
    { text: '体育や遊びで、自分がどこに立てばいいか分からない', domain: 5 },
    { text: '遊具に自分から近づかない／こわがる', domain: 5 },
    { text: '走ると腕と脚の動きがちぐはぐ', domain: 1 },
  ] },
  { id: 'E', icon: '🏠', title: '日常生活・生活習慣', items: [
    { text: '朝の支度や着替えに時間がかかる', domain: 7 },
    { text: 'ボタンやひも結びが苦手', domain: 1 },
    { text: '忘れ物・なくし物が多い', domain: 5 },
    { text: 'よく物にぶつかる・つまずく', domain: 5 },
    { text: '食事のときに姿勢が崩れる／よくこぼす', domain: 6 },
    { text: '次に何をするかの段取りが苦手', domain: 7 },
  ] },
] as const;

export type TroubleCategory = (typeof TROUBLE_CATEGORIES)[number];

export const TROUBLE_ITEMS: readonly string[] = TROUBLE_CATEGORIES.flatMap(
  (category) => category.items.map((item) => item.text),
);

/**
 * 困りごと1項目に紐づく情報（レコメンドなどで使う）。
 * 発達ピラミッド＝`domain.pyramid`、育てたい力＝`domain.parentLabel`、主に支える種目＝`domain.priorityKey`。
 */
export interface TroubleProfile {
  text: string;
  category: Pick<TroubleCategory, 'id' | 'icon' | 'title'>;
  domain: NeuroDomain;
}

export function troubleProfileOf(text: string): TroubleProfile | null {
  for (const category of TROUBLE_CATEGORIES) {
    const item = category.items.find((candidate) => candidate.text === text);
    if (!item) continue;
    const domain = NEURO_DOMAINS.find((candidate) => candidate.id === item.domain);
    if (!domain) throw new Error(`困りごとの神経ドメインがマスタにありません: DN${item.domain}`);
    return { text, category: { id: category.id, icon: category.icon, title: category.title }, domain };
  }
  return null;
}

/** チェックされた困りごと（文言）から神経ドメインの id を引く。 */
export function troubleDomainOf(text: string): number | null {
  return troubleProfileOf(text)?.domain.id ?? null;
}
