import { LADDERS } from './ladders';

/**
 * 到達の下限。Lv1 以上はラダーの到達段階そのものを指し、Lv0 は Lv1 に取り組めなかった回を表す。
 * 旧「実施不可」を Lv0 として扱い、旧「未実施」は廃止した（途中で止まっても下書きを保存して後日続けられるため）。
 */
export const MIN_EXERCISE_LEVEL = 0;
/** Lv0 の課題文の代わりに出す文言。ドロップダウンでほかの Lv の課題文と並びをそろえるため。 */
export const LEVEL_ZERO_LABEL = '実施不可';

/** レーダーの目盛り上限。種目ごとの上限（30 または 20）のうち大きいほう。 */
export const RADAR_MAX_LEVEL = 30;

/**
 * 5種目の定義。
 * bands（帯）は Lv のまとまりで、帯ごとに「力の名前」（ability）と、つながるピラミッドのブロック（blocks）を持つ。
 * ability・blocks は「入力からレポート作成までの仕様」の付録B（2026-10-28）。グーパータッチは付録Bの帯（旧ラダー）を、
 * 帯の名前で 2026-10-14 のレベル一覧の帯に当てている。
 */
export const EXERCISES = [
  {
    key: 'post',
    core: true,
    icon: '🧍',
    name: 'ラインウォーク',
    parentName: 'からだを支える力',
    clinicalName: '姿勢制御/動的バランス',
    summary: '狭い足場で体の軸を保ち、頭を動かしても崩れない',
    about: '狭い足場のうえで体の軸を保ち、ぐらついても立て直しながら進む力です。高レベル帯では、頭を動かしながらでも視線と歩みを同時に保てるかを見ます。姿勢に力を使わずに済むほど、見ることや考えることに集中しやすくなります。',
    maxLevel: 30,
    changes3m: ['姿勢が崩れるまでの時間が延びる', '座り直しの回数が減る', '食事や机で伏せることが減る'],
    observations: [
      { text: '体が左右や前後に大きく揺れる' },
      { text: '膝を曲げて重心を落とす' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 7, name: '17cm一巡', ability: '体の軸を保ったまま動く力（目を閉じても保てる）', blocks: ['バランス', '姿勢', '眼球運動'], why: '幅17cmのまま、方向 → 視覚（自由視・注視固定・閉眼）を順に負荷。Lv7で言語の二重課題を加える' },
      { to: 14, name: '8.5cm一巡', ability: '支える面が狭くても、ぐらつきを小さく抑える力', blocks: ['バランス', '姿勢', '前庭覚'], why: '幅8.5cm・タンデムで同じ系列を反復。17cm帯との到達差が足場の狭さとタンデムの影響量。Lv13・14は二重課題つき' },
      { to: 20, name: 'VOR', ability: '頭を動かしながらでも、見たいところを見続ける力', blocks: ['眼球運動', '前庭覚', 'バランス'], why: '頭を動かしても的から視線を外さない。垂直→水平の順に負荷し、各系列の最後に二重課題を置く' },
      { to: 26, name: 'パスート', ability: '動くものを目で追いながら、姿勢を保つ力', blocks: ['眼球運動', '運動のコントロール', 'ボディイメージ'], why: '頭は止めたまま、動く的を目だけで追う（追従性眼球運動）。垂直→水平＋二重課題' },
      { to: 30, name: 'VORc・言語負荷', ability: '体と目を使いながら、同時に考えて話す余裕', blocks: ['眼球運動', '言語機能'], why: '目の条件はVORc水平で固定し、言語課題の重さだけを上げる（しりとり→条件つき→交互カテゴリー→逆唱）' },
    ],
    errorPatterns: [
      { no: 1, category: '保持物', text: '頭上物の落下（Lv5〜14）' },
      { no: 2, category: '範囲', text: '幅逸脱：足の内側縁が幅の外に出る' },
      { no: 3, category: '形式', text: '接地離開：踵とつま先の間が1足長以上あく（Lv3〜。Lv1〜2は接地不問のため計上しない）' },
      { no: 4, category: '条件', text: '条件違反：閉眼で目を開ける／注視固定・VORで視線が的から外れる' },
      { no: 5, category: '代償', text: 'ステップ戦略：幅外へ踏み出す／停止する／後進で振り返る' },
      { no: 6, category: '中断', text: '転倒・支持：手や膝が床につく／保護者が支える' },
    ],
    ladder: LADDERS.post,
  },
  {
    key: 'eyeh',
    core: true,
    icon: '👀',
    name: 'お手玉キャッチ',
    parentName: '見て合わせる力',
    clinicalName: '目と手/左右の連携',
    summary: '落ちてくる位置とタイミングを見積もり、両手・左右で受ける',
    about: '物がどこに、いつ来るかを見積もって手を合わせる力です。高レベル帯では、両手を同時に使ったり、体の真ん中をまたいで左右に持ち替えたりする動きが加わります。',
    maxLevel: 30,
    changes3m: ['キャッチが安定してくる', '投げる方向のばらつきが減る', '目をそらさず追える場面が増える'],
    observations: [
      { text: '投げる高さや方向がばらつく' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 4, name: '反応（相手投げ）', ability: '飛んでくるものを目で捉えて、タイミングを合わせる力', blocks: ['眼球運動', '目と手の連携', '運動のコントロール'], why: '相手が投げた対象への視線定位とタイミング合わせ。広げる→丸める→タオルの順に猶予が減る' },
      { to: 8, name: '一人操作・巧緻', ability: '自分の動きの結果を見て、手を合わせる力', blocks: ['目と手の連携', '運動のコントロール', 'ボディイメージ'], why: '自分で投げた結果を見て受ける。逆手で左右入れ替え、3点キャッチで手指の巧緻性が加わる' },
      { to: 12, name: 'お手玉・注意選択', ability: '重さのあるものを扱い、どれを取るか選ぶ注意の力', blocks: ['眼球運動', '言語機能'], why: '重さのある対象。さらに投げる瞬間の合図でボールかティッシュかを選ぶ、注意の選択と持続' },
      { to: 16, name: '片手・左右操作', ability: '片手ずつを使い分け、体の中心をまたいで持ちかえる力', blocks: ['運動のコントロール', '身体の位置', '目と手の連携'], why: '片手操作の安定性と左右の受け渡し。正中線をまたぐ処理が加わる' },
      { to: 21, name: '両手協調・自然落下', ability: '両手を同時に、タイミングをそろえて使う力', blocks: ['目と手の連携', '運動のコントロール', 'ボディイメージ'], why: '両手同時操作とタイミング一致。自然落下は投げる動作がないぶん予測の手がかりが減る' },
      { to: 26, name: '付加課題・切替', ability: '別のことをしてから、もう一度対象に注意を戻す力', blocks: ['眼球運動', '言語機能'], why: '投げてから別動作を挟み、再び対象へ注意を戻す。注意の切り替え' },
      { to: 30, name: 'ボディイメージ・回転', ability: '見えない位置でも自分の体の位置をつかむ力', blocks: ['身体の位置', '視覚', '目と手の連携'], why: '背面キャッチと回転。視覚に頼れない位置での身体図式と、回転後の空間再定位' },
    ],
    errorPatterns: [
      { no: 1, category: '保持物', text: '—（保持物なし。該当なし）', notApplicable: true },
      { no: 2, category: '範囲', text: '投げる高さ・位置が毎回ばらつき、規定の範囲に収まらない' },
      { no: 3, category: '形式', text: 'キャッチ形式が指定と違う（両手／片手／クロスが守られない）' },
      { no: 4, category: '条件', text: '規定回数・順序を満たさない（5回連続などが続かない）' },
      { no: 5, category: '代償', text: '体ごと大きく移動して捕る／目で追わず胸や腹で受ける' },
      { no: 6, category: '中断', text: '落球が連続して課題が成立しない／中断する' },
    ],
    ladder: LADDERS.eyeh,
  },
  {
    key: 'hand',
    core: true,
    icon: '✋',
    name: 'グーパータッチ',
    parentName: '考えて動かす力',
    clinicalName: '反応選択/運動の切替',
    summary: '相手の手を見て、決まりに合わせて出す手を選ぶ',
    about: '相手の手を見て、出す手をすばやく選ぶ力です。はじめは見たとおりの形をつくり、高レベル帯では「勝つ」「負ける」など決まりに合わせて出す手を選び直します。速さではなく、正しく選べるかを見ています。',
    maxLevel: 30,
    changes3m: ['手の形の作り直しが減る', '力加減を調整できる', '道具の扱いが乱暴でなくなる'],
    observations: [
      { text: '大きく頭を動かす' },
      { text: '両手同時操作が難しい' },
    ],
    bands: [
      { to: 5, name: '目と手の連携', ability: '見た場所に手を正確に出す力', blocks: ['眼球運動', '目と手の連携', '運動のコントロール'], why: '親の手へのタッチ。視線の向け方と基本的な目と手の協調。両手化・移動・振り向きで視線移動の距離が増える' },
      { to: 9, name: '手形の切り替え', ability: '見た形に合わせて、出す手を選ぶ力', blocks: ['身体の位置', '視覚', '目と手の連携'], why: 'Lv6からスライド（または動画）で提示。手の形の選択肢が増え、配置変更で位置に合わせた手の移動が加わる' },
      { to: 11, name: 'じゃんけんルール', ability: '決まりに合わせて、出す手を変換する力', blocks: ['眼球運動', '言語機能'], why: 'すべてグーチョキパーで実施。あいこ→勝つの順にルール変換を加え、混合課題で左右それぞれに適用する' },
      { to: 13, name: '左右別ルール', ability: '2つの決まりを同時に持ちながら動く力', blocks: ['運動のコントロール', '眼球運動', '言語機能'], why: '右手と左手で異なるルールを保持し、同じ刺激・混合課題のそれぞれに対応する' },
      { to: 16, name: '視空間対応・交差', ability: '体の左右を取り違えずに、空間と体を対応づける力', blocks: ['身体の位置', '視覚', '目と手の連携'], why: '腕を交差した状態で刺激と自分の手を対応づける。右手・左手は交差後の位置ではなく身体上の左右' },
      { to: 19, name: '処理速度', ability: '正確さを保ったまま、速く処理する力', blocks: ['運動のコントロール', '眼球運動', '言語機能'], why: '提示時間を通常の5秒から3秒に短縮。正確性を保ったまま短時間で判断して反応する' },
      { to: 24, name: '「負ける」ルール', ability: 'とっさに出る反応を止めて、選び直す力', blocks: ['眼球運動', '言語機能'], why: '出しやすい「勝つ」反応を抑えて負ける手を選ぶ。両手同じ→混合課題→左右別→交差→スピードUPの順に重ねる' },
      { to: 27, name: '視覚性ワーキングメモリ', ability: '見たものを覚えておき、順番どおりに使う力', blocks: ['言語機能', '眼球運動'], why: '2つの刺激を順に提示して消し、6秒を目安に想起して順番に反応する' },
      { to: 30, name: '干渉抑制・ルール切り替え', ability: '目の前の情報につられずに、決まりを優先する力', blocks: ['眼球運動', '言語機能'], why: '「あいこ・勝つ・負ける」の指示を保持し、手の形と一致しない文字の干渉を抑えて反応する' },
    ],
    errorPatterns: [
      { no: 1, category: '保持物', text: 'タオルの上から足が落ちる' },
      { no: 2, category: '範囲', text: '必要以上の身体移動で代償する／立ち位置が毎回動く' },
      { no: 3, category: '形式', text: '手の形が不完全・出した後に作り直す' },
      { no: 4, category: '条件', text: '勝つ／負ける／あいこのルールを取り違える' },
      { no: 5, category: '代償', text: '相手の手を見てから明らかに遅れて出す／左右を同じ手にそろえる' },
      { no: 6, category: '中断', text: 'ルールが保持できず課題が成立しない／中断する' },
    ],
    ladder: LADDERS.hand,
  },
  {
    key: 'sacc',
    core: false,
    icon: '🧠',
    name: 'あしあとものまね',
    parentName: '見つけて覚える力',
    clinicalName: '視空間探索/運動企画',
    summary: '見本の姿勢を再現し、探し出し、順番を覚えておく',
    about: '見本と同じ足の位置・向きをつくる力から始まり、高レベル帯では、たくさん並んだ見本の中から目的のものを探し出し、その順番を覚えておく力までを見ます。読む・写す・探すという場面を支えています。',
    maxLevel: 20,
    changes3m: ['指でなぞらずに探せる', '見本を見て真似できる', '探し物にかかる時間が短くなる'],
    observations: [
      { text: '目だけでなく頭ごと動かして探す' },
      { text: '反応するのに2秒以上かかる' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 5, name: '注視・注意持続', ability: '見本を見続けて、同じように体を置く力', blocks: ['眼球運動', '言語機能'], why: '刺激数の増加に対する注視・姿勢認識・注意の持続' },
      { to: 7, name: '追従性', ability: '動くものを目でなめらかに追う力', blocks: ['眼球運動', '運動のコントロール', 'ボディイメージ'], why: '縦・横の追従性眼球運動（パスート）。旧「視線の安定」軸に相当' },
      { to: 10, name: '跳躍性・回転', ability: '離れた場所へ素早く目を移す力', blocks: ['眼球運動', 'ボディイメージ', '前庭覚'], why: '縦・横の跳躍性眼球運動（サッケード）と回転。視線移動の切り替え' },
      { to: 15, name: '視覚探索・選択', ability: '並んだ中から目当てを見つけて、順にたどる力', blocks: ['身体の位置', '視覚', '目と手の連携'], why: '' },
      { to: 20, name: 'WM・逆順', ability: '見た順番を覚えて、逆からたどる力', blocks: ['言語機能', '運動のコントロール', '眼球運動'], why: '逆順・奇偶・指定数字逆唱。ワーキングメモリと情報処理' },
    ],
    errorPatterns: [
      { no: 1, category: '保持物', text: '—（保持物なし。30クリア後のバランスチャレンジ時のみ計上）', notApplicable: true },
      { no: 2, category: '範囲', text: '見本と足の位置・向きが違う' },
      { no: 3, category: '形式', text: 'ポーズが完成しない・途中で崩れる' },
      { no: 4, category: '条件', text: '指定された順序・ルールと違う順で進む' },
      { no: 5, category: '代償', text: '頭ごと動かして探す／指でなぞる／声に出して数える' },
      { no: 6, category: '中断', text: '中断する／支援者が指示を繰り返す必要がある' },
    ],
    ladder: LADDERS.sacc,
  },
  {
    key: 'inhi',
    core: false,
    icon: '⛔',
    name: '信号ゲーム',
    parentName: '止まる・切り替える力',
    clinicalName: '反応抑制/ルールの切替',
    summary: '合図に合わせて動く・止まる、決まりが変わったら変える',
    about: '合図に合わせて動く・止まる力です。高レベル帯では、途中で決まりが変わっても、それに合わせて反応を変えられるかを見ます。順番を待つ、気持ちを切り替えるという場面につながります。',
    maxLevel: 20,
    changes3m: ['合図より先に動くことが減る', 'ルールの変更についていける', '負けたあとの立て直しが早くなる'],
    observations: [
      { text: '合図より先に動いてしまう' },
      { text: '反応するのに2秒以上かかる' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 5, name: '反応速度・ルール', ability: '合図を見て、決まりどおりに止まる・動く力', blocks: ['運動のコントロール', '眼球運動', '言語機能'], why: '色刺激に対する反応速度と基本的なルール理解' },
      { to: 10, name: '聴覚・視聴覚統合', ability: '見た合図でも聞いた言葉でも動ける力', blocks: ['身体の位置', '目と手の連携', '視覚'], why: '' },
      { to: 15, name: '記憶・ルール変更', ability: '決まりを覚え、途中で変わっても切り替える力', blocks: ['言語機能', '眼球運動'], why: '色系列の記憶・逆行、実施中のルール変更。認知の切り替えとWM' },
      { to: 18, name: '二重課題', ability: '別のことをしながら、同時に決まりを守る力', blocks: ['言語機能', '運動のコントロール', '眼球運動'], why: 'しりとりと並行して色課題を実施。処理資源の分割' },
      { to: 20, name: 'ストループ', ability: '紛らわしい情報を抑えて、決まりを優先する力', blocks: ['言語機能', '眼球運動'], why: '言葉と色の不一致下での反応抑制' },
    ],
    errorPatterns: [
      { no: 1, category: '保持物', text: '—（修正版では保持物なし。旧版Lv17・18の頭上タオル使用時のみ）', notApplicable: true },
      { no: 2, category: '範囲', text: '足踏みが止まる／立ち位置が大きく動く' },
      { no: 3, category: '形式', text: '反応の形が指定と違う（止まる／ゆっくり／ジャンプ／しゃがむの取り違え）' },
      { no: 4, category: '条件', text: 'ルール変更後も前のルールで反応する' },
      { no: 5, category: '代償', text: '合図より先に動く（予測反応）／支援者の口元や手元を見て待つ' },
      { no: 6, category: '中断', text: '課題を放棄する／指示が通らず成立しない' },
    ],
    ladder: LADDERS.inhi,
  },
] as const;

export type ExerciseKey = (typeof EXERCISES)[number]['key'];
export type ExerciseDefinition = (typeof EXERCISES)[number];

/** 種目をまたいだ到達値の上限。API のレスポンス検証など、種目が決まらない場面で使う。 */
export const MAX_EXERCISE_LEVEL = Math.max(...EXERCISES.map((exercise) => exercise.maxLevel));

export const CORE_EXERCISE_KEYS = EXERCISES.filter((exercise) => exercise.core).map(
  (exercise) => exercise.key,
);
export const EXT_EXERCISE_KEYS = EXERCISES.filter((exercise) => !exercise.core).map(
  (exercise) => exercise.key,
);

/** その回で記録する種目。4・5種目目が未開放なら基本の3種目だけ。 */
export function activeExerciseKeys(unlockExt: boolean): ExerciseKey[] {
  return unlockExt ? [...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS] : [...CORE_EXERCISE_KEYS];
}

export function exerciseByKey(key: ExerciseKey): ExerciseDefinition {
  const exercise = EXERCISES.find((candidate) => candidate.key === key);
  if (!exercise) {
    throw new Error(`未知の種目: ${key}`);
  }
  return exercise;
}

export function maxLevelOf(key: ExerciseKey): number {
  return exerciseByKey(key).maxLevel;
}

/** Lv1 以上のときだけ帯を返す。Lv0 はどの帯にも届いていない。 */
export function bandOf(key: ExerciseKey, level: number) {
  if (level <= 0) return null;
  const exercise = exerciseByKey(key);
  return exercise.bands.find((band) => level <= band.to) ?? exercise.bands.at(-1)!;
}

export type ExerciseBand = ExerciseDefinition['bands'][number];

/**
 * 帯の位置（仕様の M1）。上限まで届いた帯を「通過」、その次の帯を「取り組み中」とする。
 * 例：Lv12（8.5cm一巡 Lv8〜14）は 17cm一巡を通過、8.5cm一巡が取り組み中。Lv14 なら 8.5cm一巡を通過、VOR が取り組み中。
 * Lv0 は通過した帯がなく、最初の帯が取り組み中。種目の上限まで届いたら、取り組み中の帯はない。
 */
export function bandPositionOf(key: ExerciseKey, level: number): { passed: ExerciseBand | null; current: ExerciseBand | null } {
  const { bands } = exerciseByKey(key);
  const passedCount = bands.filter((band) => band.to <= level).length;
  return { passed: bands[passedCount - 1] ?? null, current: bands[passedCount] ?? null };
}

export function bandName(key: ExerciseKey, level: number): string {
  return bandOf(key, level)?.name ?? `Lv${level}`;
}

/** Lv0 には課題文がないため「実施不可」を返す。 */
export function ladderLabel(key: ExerciseKey, level: number): string {
  if (level <= MIN_EXERCISE_LEVEL) return LEVEL_ZERO_LABEL;
  return exerciseByKey(key).ladder[level - 1] ?? '';
}

/** レーダーや大小比較で使う値。記録していない種目（未開放など）は 0 として扱う。 */
export function levelValue(level: number | undefined): number {
  return level ?? 0;
}

/** その回で到達を記録したか。未開放の4・5種目目は記録しない。 */
export function isMeasured(level: number | undefined): boolean {
  return level !== undefined;
}
