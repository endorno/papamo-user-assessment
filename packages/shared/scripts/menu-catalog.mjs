// メニュー構築サイト（lesson-admin）の Activity の出力から、コーチ向けレポートに出すメニューのマスタを作る。
//
//   node scripts/menu-catalog.mjs candidates <出力フォルダ> [1ブロックあたりの件数]
//     ブロックごとの候補を、当たった理由と説明の冒頭つきで TSV に出す（選ぶときの下調べ用。コミットしない）。
//   node scripts/menu-catalog.mjs build <出力フォルダ>
//     scripts/menu-catalog-selection.json で選んだメニューの名前と属性を出力から写し、
//     src/master/menu-catalog.ts を作り直す。名前の変わったもの・出力に無いものはここで知らせる。
//
// <出力フォルダ> は lesson-admin の tmp/activities-ai-production/<日時> （activities-details.jsonl があるところ）。
// 出力は 15MB あり、リポジトリには置かない。
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const selectionPath = join(packageRoot, 'scripts/menu-catalog-selection.json');
const outputPath = join(packageRoot, 'src/master/menu-catalog.ts');

const [command, exportDir, limitArg] = process.argv.slice(2);
if (!['candidates', 'build'].includes(command) || !exportDir) {
  console.error('使い方: node scripts/menu-catalog.mjs candidates|build <出力フォルダ> [件数]');
  process.exit(1);
}

const activities = readFileSync(join(exportDir, 'activities-details.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

// --- 候補の当たりをつける手がかり（ブロックごと）。点の高い順に並べるだけで、採否は人が説明を読んで決める ---
const has = (activity, key) => activity.contents?.[key]?.['存在'] === true;
const purpose = (activity, key) => (activity.attributes?.purpose ?? []).includes(key);
const text = (activity) => `${activity.name} ${activity.description ?? ''}`;

/** [点, 理由, 当たり判定] の並び。 */
const BLOCK_SIGNALS = {
  前庭覚: [
    [3, '目的:前庭感覚刺激', (a) => purpose(a, '前庭感覚刺激')],
    [3, 'カテゴリ:前庭覚', (a) => a.category.startsWith('前庭覚')],
    [2, '語:回転・揺れ・逆さ', (a) => /回転|回る|くるくる|ゆらゆら|揺ら|揺れ|逆さ|前転|後転|ブランコ|トランポリン/.test(text(a))],
  ],
  固有覚: [
    [1, '目的:固有感覚刺激', (a) => purpose(a, '固有感覚刺激')],
    [2, '動作:押す・引く', (a) => has(a, '手で押す') || has(a, '手で引く')],
    [3, 'サブ:押す・引く・ぶら下がる', (a) => /押す|引く|ぶら下がる/.test(a.sub_category ?? '')],
    [2, '語:綱引き・押し合い・踏ん張る', (a) => /綱引き|押し合|引っ張|踏ん張|重い|相撲|すもう/.test(text(a))],
  ],
  触覚: [
    [3, '目的:触覚刺激', (a) => purpose(a, '触覚刺激')],
    [2, '語:触る・感触・足裏', (a) => /触る|触れ|感触|足裏|裸足|くすぐ|なで|さす|手のひらで|背中に/.test(text(a))],
  ],
  視覚: [
    [3, 'カテゴリ:ビジョントレーニング', (a) => a.category === 'ビジョントレーニング'],
    [1, '要素:ビジョントレーニング', (a) => has(a, 'ビジョントレーニング')],
    [2, '語:色・形・数字を見分ける', (a) => /色|形|数字|記号|見つけ|探|見比べ|見分け/.test(text(a))],
  ],
  聴覚: [
    [3, '語:合図・音・声', (a) => /合図|音|声|聞|言われた|掛け声|かけ声|手拍子|音楽|太鼓|笛/.test(text(a))],
    [1, '要素:リズム感', (a) => has(a, 'リズム感')],
  ],
  姿勢: [
    [3, 'サブ:体幹・お腹の力', (a) => /体幹・全身|お腹の力|腹圧/.test(a.sub_category ?? '')],
    [1, '効果:体幹の姿勢保持', (a) => a.effects?.['体幹']?.['姿勢保持']?.['効果'] === true],
    [2, '語:姿勢・体幹・キープ', (a) => /姿勢|体幹|背筋|キープ|四つ這い|四つん這い|座った/.test(text(a))],
  ],
  バランス: [
    [3, 'カテゴリ:バランス・片足立ち', (a) => ['バランス', '片足立ち'].includes(a.category)],
    [2, '動作:片足立ち', (a) => has(a, '片足立ち')],
    [1, '動作:バランスをとる', (a) => has(a, 'バランスをとる')],
    [2, '語:片足・綱渡り', (a) => /片足|綱渡り|ぐらぐら/.test(text(a))],
  ],
  身体の位置: [
    [3, 'サブ:トンネル・避ける', (a) => /トンネル|避ける/.test(a.sub_category ?? '')],
    [2, '動作:くぐる・跨ぐ', (a) => has(a, 'くぐる') || has(a, '跨ぐ')],
    [1, '要素:空間認知', (a) => has(a, '空間認知')],
    [2, '語:くぐる・よける・距離', (a) => /くぐ|跨|またい|よけ|避け|距離|隙間|ぶつからない|位置/.test(text(a))],
  ],
  眼球運動: [
    [3, 'カテゴリ:注視・追視', (a) => a.category.startsWith('注意の持続')],
    [2, '要素:ビジョントレーニング', (a) => has(a, 'ビジョントレーニング')],
    [2, '語:目で追う・見続ける', (a) => /追視|目で追|目だけ|視線|見続け|注視|目を離さ/.test(text(a))],
  ],
  姿勢調整: [
    [3, 'サブ:バランス歩き・片足で動く', (a) => /バランス歩き|片足で動く|足乗せ歩き|バランスボール/.test(a.sub_category ?? '')],
    [2, '動作:動きながらバランス', (a) => has(a, 'バランスをとる') && (has(a, 'ジャンプ') || has(a, 'ステップ') || has(a, '歩く'))],
    [2, '語:着地・動きながら', (a) => /着地|ピタッ|止まる|動きながら|バランスボール/.test(text(a))],
  ],
  ボディイメージ: [
    [3, 'カテゴリ:ボディイメージ・模倣', (a) => ['ボディイメージが弱い', '模倣'].includes(a.category)],
    [1, '要素:ボディイメージ', (a) => has(a, 'ボディイメージ')],
    [2, '語:まね・ポーズ・体の部位', (a) => /まね|真似|模倣|ポーズ|どこを|体の部位|鏡/.test(text(a))],
  ],
  運動のコントロール: [
    [3, 'カテゴリ:力の調整', (a) => a.category === '力の調整'],
    [1, '要素:力のコントロール', (a) => has(a, '力のコントロール')],
    [1, '要素:タイミング', (a) => has(a, 'タイミング')],
    [2, '語:力加減・そっと・ゆっくり', (a) => /力加減|加減|そっと|ゆっくり|優しく|やさしく|強さ/.test(text(a))],
  ],
  目と手の連携: [
    [3, 'カテゴリ:手のコントロール・微細運動', (a) => ['手のコントロール', '微細運動', '三点持ち、握る力'].includes(a.category)],
    [2, '動作:キャッチ', (a) => has(a, 'ボールをキャッチする')],
    [1, '動作:投げる・トス', (a) => has(a, 'ボールを投げる') || has(a, 'トスする')],
    [2, '語:狙う・つまむ・書く', (a) => /狙|的|つまむ|洗濯バサミ|書く|箸|はし|キャッチ/.test(text(a))],
  ],
  言語機能: [
    [1, '要素:二重課題', (a) => has(a, '二重課題')],
    [1, '要素:遂行機能', (a) => has(a, '遂行機能')],
    [3, '語:言いながら・数える・言葉', (a) => /言いながら|数え|言う|言って|言葉|しりとり|答え|口で|声に出/.test(text(a))],
  ],
  '学習・情緒／複合運動': [
    [2, '要素:切り替え力', (a) => has(a, '切り替え力')],
    [1, '要素:遂行機能', (a) => has(a, '遂行機能')],
    [3, '語:ルール・止まる・待つ', (a) => /ルール|だるまさん|ストップ|止まる|待つ|待って|じゃんけん|反応|合図/.test(text(a))],
  ],
};

const trimmedName = (activity) => activity.name.trim();

/** 出力の対象年齢 → マスタの対象区分。 */
const AUDIENCE_BY_AGE = { 未就学児向け: 'pre', 小学校低学年向け: 'low', 小学校高学年向け: 'high' };

// 名前に「（未就学児限定）」「（低学年以下限定）」とあるのに、対象年齢がそれより広いものがある。名前のほうを優先する。
function audiencesOf(activity) {
  const name = trimmedName(activity);
  return Object.entries(AUDIENCE_BY_AGE)
    .filter(([age]) => (activity.attributes.age ?? []).includes(age))
    .map(([, audience]) => audience)
    .filter((audience) => !(name.includes('未就学児限定') && audience !== 'pre'))
    .filter((audience) => !(name.includes('低学年以下限定') && audience === 'high'));
}

function categoryOf(activity) {
  return [activity.category, activity.sub_category].map((value) => (value ?? '').trim()).filter(Boolean).join('／');
}

// 「その他の道具」は自由記述が短ければその名前（タオルなど）を出す。長い記述は紙面で読みにくいので出さない。
const EQUIPMENT_TEXT_MAX = 12;

function equipmentOf(activity) {
  const other = (activity.attributes.otherEquipment ?? '').replace(/（[^）]*）/g, '').trim();
  const names = (activity.attributes.equipment ?? []).map((name) => (
    name === 'その他の道具' && other && other !== 'なし' && other.length <= EQUIPMENT_TEXT_MAX ? other : name
  ));
  return names.length ? names.join('・') : '道具なし';
}

function menuOf(activity, series) {
  return {
    id: activity.id,
    name: trimmedName(activity),
    series,
    difficulty: activity.attributes.difficulty,
    audiences: audiencesOf(activity),
    form: activity.attributes.member?.alone === 'できる' ? '一人でも' : '親子で',
    equipment: equipmentOf(activity),
    ...(activity.attributes.parent?.burden === '多い' ? { parentBurden: '多' } : {}),
    category: categoryOf(activity),
  };
}

/** 系列の初期値：名前の「_」より前から、末尾の丸数字・（Lv…）・（未就学児限定）を落としたもの。比べるだけなので NFC にそろえる。 */
function defaultSeriesOf(name) {
  return name.normalize('NFC').split('_')[0].replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[①-⑳0-9０-９]+$/, '').trim();
}

function scoreOf(activity, block) {
  const hits = BLOCK_SIGNALS[block].filter(([, , matches]) => matches(activity));
  return { score: hits.reduce((sum, [point]) => sum + point, 0), reasons: hits.map(([, reason]) => reason) };
}

if (command === 'candidates') {
  const limit = Number(limitArg ?? 40);
  const rows = [['block', 'score', 'id', 'name', 'difficulty', 'ages', 'alone', 'category', 'reasons', 'description']];
  for (const block of Object.keys(BLOCK_SIGNALS)) {
    activities
      .map((activity) => ({ activity, ...scoreOf(activity, block) }))
      .filter(({ score }) => score > 0)
      .sort((first, second) => second.score - first.score || trimmedName(first.activity).localeCompare(trimmedName(second.activity), 'ja'))
      .slice(0, limit)
      .forEach(({ activity, score, reasons }) => {
        rows.push([
          block,
          score,
          activity.id,
          trimmedName(activity),
          activity.attributes.difficulty,
          audiencesOf(activity).join('・'),
          activity.attributes.member?.alone ?? '',
          categoryOf(activity),
          reasons.join('／'),
          (activity.description ?? '').replace(/\s+/g, ' ').slice(0, 120),
        ]);
      });
  }
  process.stdout.write(`${rows.map((row) => row.join('\t')).join('\n')}\n`);
  process.exit(0);
}

// --- build：選んだメニューを出力から写してマスタを作る ---

const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
const byId = new Map(activities.map((activity) => [activity.id, activity]));
const problems = [];
const blocks = Object.entries(selection.blocks).map(([block, entries]) => [
  block,
  entries.flatMap((entry) => {
    const activity = byId.get(entry.id);
    if (!activity) {
      problems.push(`${block}：${entry.name}（${entry.id}）が出力にありません（アーカイブされた可能性）`);
      return [];
    }
    // DB には濁点が分かれた形（NFD）の名前がある。マスタは検索で当たるよう DB の文字列のまま持ち、ここでは見た目で比べる。
    if (trimmedName(activity).normalize('NFC') !== entry.name.normalize('NFC')) {
      problems.push(`${block}：${entry.name}（${entry.id}）の名前が「${trimmedName(activity)}」に変わっています`);
    }
    return [menuOf(activity, entry.series ?? defaultSeriesOf(trimmedName(activity)))];
  }),
]);

const quote = (value) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const menuLiteral = (menu) => `{ ${Object.entries(menu)
  .map(([key, value]) => `${key}: ${Array.isArray(value) ? `[${value.map(quote).join(', ')}]` : quote(value)}`)
  .join(', ')} }`;
const source = `// このファイルは scripts/menu-catalog.mjs build で作る。直接は直さず、scripts/menu-catalog-selection.json を直して作り直す。
import type { PyramidBlock } from './domains';
import type { CatalogMenu } from './menus';

/** メニュー構築サイトの出力日。名前と属性はこの時点のもの。 */
export const MENU_CATALOG_EXPORTED_AT = ${quote(selection.exportedAt)};

/** ブロックごとのメニュー。並びがおすすめの順。1つのメニューは1つのブロックにだけ置く。 */
export const BLOCK_MENUS: Record<PyramidBlock, readonly CatalogMenu[]> = {
${blocks.map(([block, menus]) => `  ${quote(block)}: [\n${menus.map((menu) => `    ${menuLiteral(menu)},`).join('\n')}\n  ],`).join('\n')}
};
`;
writeFileSync(outputPath, source);
problems.forEach((problem) => console.warn(problem));
console.log(`${outputPath} に ${blocks.reduce((sum, [, menus]) => sum + menus.length, 0)} 件を書き出しました。`);
