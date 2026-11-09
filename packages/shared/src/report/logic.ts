import {
  bandPositionOf,
  BLOCK_MENUS,
  compareByPyramidPosition,
  exerciseByKey,
  GOAL_VOCABULARY,
  GRADE_STAGES,
  gradeStageIndexOf,
  GRADES,
  MENU_LEVELS,
  NEURO_DOMAINS,
  PYRAMID_BLOCKS,
  pyramidTierOf,
  troubleProfileOf,
  wantById,
  type CatalogMenu,
  type ExerciseKey,
  type MenuAudience,
  type MenuLevel,
  type PyramidBlock,
  type WantId,
} from '../master';
import type { PyramidSource, ReportRisks } from './types';

// 入力からレポートの判定項目を決める中間状態（M1〜M6）。「入力からレポート作成までの仕様」のロジック（2026-10-28）。
// どれも純粋関数で、ルール版のレポート生成（rule.ts）がこれを組み合わせる。

/** 目標ごとの優先する領域（M5）と、最重要にすべき領域に出すブロックの数。 */
export const GOAL_AREA_COUNT = 3;
export const FOCUS_AREA_COUNT = 3;
/** 最重要にすべき領域から外すブロック。いちばん上の段は、下の段が育った結果として育つため。 */
export const FOCUS_AREA_EXCLUDED: PyramidBlock = '学習・情緒／複合運動';
/** 年齢との比較（M3）で「目安くらい」とする幅。到達率と目安の差がこの範囲なら目安くらい。 */
export const AGE_COMPARISON_MARGIN = 0.12;
/** 学年が上がったときの懸念を出す段階（いまの段階から何段階先か）。 */
export const CONCERN_STAGE_STEPS = [1, 3] as const;
/**
 * メニューの難易度を決める到達率（中央値）の境目。intermediate 以上で中級、advanced 以上で上級。
 * 【仮】仕様は「到達率の中央値から初級／中級／上級」までで境目の値が無いため、実装の都合で仮に決めた（2026-10-30）。
 * カタログの対象年齢の区切りに合わせ、小1の目安（0.32）と小4の目安（0.55）を使っている。
 */
export const MENU_LEVEL_THRESHOLDS = { intermediate: 0.32, advanced: 0.55 } as const;
/** 方針とメニューの方向性で、ブロックごとに出すメニューの数と、同じ系列から出せる数。 */
export const AREA_MENU_COUNT = 3;
export const AREA_MENU_SERIES_MAX = 2;

/** ブロックを両方 → 目標だけ → 課題だけの順に並べる（最重要にすべき領域・方針とメニューの方向性）。 */
const SOURCE_ORDER: PyramidSource[] = ['both', 'goal', 'issue'];

function uniqueBlocks(blocks: Iterable<string>): PyramidBlock[] {
  const set = new Set(blocks);
  return PYRAMID_BLOCKS.filter((block) => set.has(block));
}

/** M1・M2：通過した帯と取り組み中の帯、取り組み中の帯のブロック。 */
export function bandStateOf(key: ExerciseKey, level: number) {
  const { passed, current } = bandPositionOf(key, level);
  return { passed, current, blocks: current ? [...current.blocks] : [] };
}

export type AgeComparison = 'above' | 'typical' | 'below';

export function expectedRateOf(gradeCode: string): number | null {
  return GRADES.find((grade) => grade.code === gradeCode)?.expectedRate ?? null;
}

/**
 * M3：年齢との比較。到達率（Lv÷種目の上限）から学年の目安を引いた差で3段階に分ける。
 * 学年マスタに無い（高校卒業以上）ときは比べない。
 */
export function compareWithGrade(key: ExerciseKey, level: number, gradeCode: string): AgeComparison | null {
  const expected = expectedRateOf(gradeCode);
  if (expected === null) return null;
  // 0.20 − 0.32 が −0.12 ちょうどにならないなど、小数の誤差で境目を取り違えないよう丸めてから比べる。
  const difference = Math.round((level / exerciseByKey(key).maxLevel - expected) * 10000) / 10000;
  if (difference >= AGE_COMPARISON_MARGIN) return 'above';
  if (difference >= -AGE_COMPARISON_MARGIN) return 'typical';
  return 'below';
}

/** チェックされたお困りごとのドメインが指すブロック（M4 のお困りごとの分）。 */
export function troubleBlocksOf(troubles: readonly string[]): PyramidBlock[] {
  return uniqueBlocks(troubles.flatMap((text) => {
    const block = troubleProfileOf(text)?.domain.block;
    return block ? [block] : [];
  }));
}

/**
 * M4：課題ブロック。年齢の目安より下の種目の取り組み中の帯のブロック（M2）と、お困りごとのブロック。
 * levels は記録した種目の Lv（未開放の種目は含めない）。
 */
export function issueBlocksOf(levels: readonly { key: ExerciseKey; lv: number }[], gradeCode: string, troubles: readonly string[]): PyramidBlock[] {
  const fromLevels = levels
    .filter(({ key, lv }) => compareWithGrade(key, lv, gradeCode) === 'below')
    .flatMap(({ key, lv }) => bandStateOf(key, lv).blocks);
  return uniqueBlocks([...fromLevels, ...troubleBlocksOf(troubles)]);
}

/**
 * M5（目標1件分）：目標の優先する領域。目標文とメモを語彙表で読み、合計の高いブロック3つを段の低い順に返す。
 * 目標の行に候補（wantId）があれば、候補の文も一緒に読む（候補の文と目標文が同じ語彙表の行に当たっても、その行は1回だけ）。
 * 同点は段の低いほう、それも同じなら先に点が付いたほう（語彙表の行と、行の中の並び順）を採る。
 * 語彙表のどの語にも当たらなければ空。
 */
export function goalBlocksOf(text: string, memo = '', wantId?: WantId): PyramidBlock[] {
  const wantText = wantId ? wantById(wantId)?.text ?? '' : '';
  const source = [wantText, text, memo].join('\n');
  const scores = new Map<PyramidBlock, number>();
  for (const row of GOAL_VOCABULARY) {
    if (!row.words.some((word) => source.includes(word))) continue;
    for (const [block, point] of row.points) scores.set(block, (scores.get(block) ?? 0) + point);
  }
  const entries = [...scores].map(([block, score], order) => ({ block, score, order, tier: pyramidTierOf(block) }));
  return entries
    .sort((first, second) => second.score - first.score || first.tier - second.tier || first.order - second.order)
    .slice(0, GOAL_AREA_COUNT)
    .sort((first, second) => first.tier - second.tier || second.score - first.score || first.order - second.order)
    .map(({ block }) => block);
}

/** ブロックが目標ブロック・課題ブロックのどちらに当たるか。どちらでもなければ null。 */
export function pyramidSourceOf(block: string, goalBlocks: readonly string[], issueBlocks: readonly string[]): PyramidSource | null {
  const goal = goalBlocks.includes(block);
  const issue = issueBlocks.includes(block);
  if (goal && issue) return 'both';
  if (goal) return 'goal';
  return issue ? 'issue' : null;
}

/**
 * 目標ブロックと課題ブロックを、両方 → 目標だけ → 課題だけ、同じ組の中は段の低い順（同じ段は付録A の順）に並べる。
 * 方針とメニューの方向性はこの並びのすべて、最重要にすべき領域はここから選ぶ。
 */
export function rankedBlocksOf(goalBlocks: readonly string[], issueBlocks: readonly string[]) {
  return PYRAMID_BLOCKS
    .flatMap((block) => {
      const source = pyramidSourceOf(block, goalBlocks, issueBlocks);
      return source ? [{ block, source, tier: pyramidTierOf(block) }] : [];
    })
    .sort((first, second) => (
      SOURCE_ORDER.indexOf(first.source) - SOURCE_ORDER.indexOf(second.source) || compareByPyramidPosition(first.block, second.block)
    ));
}

/** 最重要にすべき領域：並べたブロックから学習・情緒／複合運動を除いて先頭3つを選び、下の段から並べる。 */
export function focusBlocksOf(goalBlocks: readonly string[], issueBlocks: readonly string[]) {
  return rankedBlocksOf(goalBlocks, issueBlocks)
    .filter(({ block }) => block !== FOCUS_AREA_EXCLUDED)
    .slice(0, FOCUS_AREA_COUNT)
    .sort((first, second) => compareByPyramidPosition(first.block, second.block));
}

/** 困りごとの背景にありそうな力：お困りごとをドメインごとに1行にまとめ、チェックの多いドメインから（同数はドメインの番号順）。 */
export function troubleBackgroundsOf(troubles: readonly string[]) {
  return NEURO_DOMAINS
    .map((domain) => ({
      id: domain.id,
      parentLabel: domain.parentLabel,
      block: domain.block,
      troubles: troubles.filter((text) => troubleProfileOf(text)?.domain.id === domain.id),
    }))
    .filter((row) => row.troubles.length > 0)
    .sort((first, second) => second.troubles.length - first.troubles.length || first.id - second.id);
}

/**
 * M6 と懸念：学年ラダーのいまの段階の1つ先・3つ先から、チェックしたお困りごとのカテゴリ（A〜E）に合う項目を選ぶ。
 * 合う項目がない段階は出さない（穴埋めもしない）。gradesAhead は、その段階の最初の学年までの学年の差。
 */
export function concernStagesOf(gradeCode: string, troubles: readonly string[]): ReportRisks['stages'] {
  const current = gradeStageIndexOf(gradeCode);
  const gradeIndex = GRADES.findIndex((grade) => grade.code === gradeCode);
  if (current < 0 || gradeIndex < 0) return [];
  const categories = new Set(troubles.flatMap((text) => {
    const category = troubleProfileOf(text)?.category.id;
    return category ? [category] : [];
  }));
  return CONCERN_STAGE_STEPS.flatMap((step) => {
    const stage = GRADE_STAGES[current + step];
    if (!stage) return [];
    const concerns = stage.concerns.filter((concern) => categories.has(concern.category)).map((concern) => concern.text);
    if (!concerns.length) return [];
    const firstGradeIndex = GRADES.findIndex((grade) => grade.code === stage.grades[0]);
    return [{ label: stage.label, theme: stage.theme, demand: stage.demand, gradesAhead: firstGradeIndex - gradeIndex, concerns }];
  });
}

/** メニューの難易度が足りないときに埋める順。隣の難易度から、中級は易しいほうを先に。 */
const MENU_LEVEL_FALLBACK: Record<MenuLevel, readonly MenuLevel[]> = {
  初級: ['初級', '中級', '上級'],
  中級: ['中級', '初級', '上級'],
  上級: ['上級', '中級', '初級'],
};

/** その回に記録した種目（Lv0 を含む）の到達率の中央値から、メニューの難易度を決める。 */
export function menuLevelOf(levels: readonly { key: ExerciseKey; lv: number }[]): MenuLevel {
  const rates = levels.map(({ key, lv }) => lv / exerciseByKey(key).maxLevel).sort((first, second) => first - second);
  const middle = Math.floor(rates.length / 2);
  const median = rates.length % 2 ? rates[middle] ?? 0 : ((rates[middle - 1] ?? 0) + (rates[middle] ?? 0)) / 2;
  // M3 と同じく、小数の誤差で境目を取り違えないよう丸めてから比べる。
  const rounded = Math.round(median * 10000) / 10000;
  if (rounded >= MENU_LEVEL_THRESHOLDS.advanced) return '上級';
  if (rounded >= MENU_LEVEL_THRESHOLDS.intermediate) return '中級';
  return '初級';
}

/** 学年から、メニューの対象区分を決める。小4以上に加え、中学・高校・高校卒業以上もカタログに区分が無いので high に寄せる。 */
export function menuAudienceOf(gradeCode: string): MenuAudience {
  if (GRADES.find((grade) => grade.code === gradeCode)?.ageGroup === 'pre') return 'pre';
  return ['e1', 'e2', 'e3'].includes(gradeCode) ? 'low' : 'high';
}

/** カタログの難易度を初級・中級・上級に寄せる。筋トレ系は中級として扱う。 */
function levelOfMenu(menu: CatalogMenu): MenuLevel {
  return MENU_LEVELS.find((level) => level === menu.difficulty) ?? '中級';
}

/**
 * 方針とメニューの方向性：ブロックのメニューのうち対象区分に合うものを、難易度が合うもの → 隣の難易度の順に並べ、
 * 同じ系列は2件までで先頭から3件選ぶ。同じ難易度の中はマスタの並び（おすすめの順）。
 */
export function areaMenusOf(block: PyramidBlock, audience: MenuAudience, level: MenuLevel): CatalogMenu[] {
  const candidates = BLOCK_MENUS[block].filter((menu) => menu.audiences.includes(audience));
  const ordered = MENU_LEVEL_FALLBACK[level].flatMap((candidateLevel) => candidates.filter((menu) => levelOfMenu(menu) === candidateLevel));
  return ordered.reduce<CatalogMenu[]>((picked, menu) => {
    if (picked.length >= AREA_MENU_COUNT) return picked;
    if (picked.filter((other) => other.series === menu.series).length >= AREA_MENU_SERIES_MAX) return picked;
    return [...picked, menu];
  }, []);
}

/** 測定の裏づけ：年齢の目安より下（M3）の種目。目安の到達率を、その種目の Lv に直して添える。 */
export function riskEvidenceOf(levels: readonly { key: ExerciseKey; lv: number }[], gradeCode: string): ReportRisks['evidence'] {
  const expected = expectedRateOf(gradeCode);
  if (expected === null) return [];
  return levels
    .filter(({ key, lv }) => compareWithGrade(key, lv, gradeCode) === 'below')
    .map(({ key, lv }) => {
      const exercise = exerciseByKey(key);
      return { key, name: exercise.name, lv, maxLv: exercise.maxLevel, expectedLv: Math.round(expected * exercise.maxLevel) };
    });
}
