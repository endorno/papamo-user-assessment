import { LADDERS } from './ladders';

/**
 * 到達の下限。Lv1 以上はラダーの到達段階そのものを指し、Lv0 は Lv1 に取り組めなかった回を表す。
 * 旧「実施不可」を Lv0 として扱い、旧「未実施」は廃止した（途中で止まっても下書きを保存して後日続けられるため）。
 */
export const MIN_EXERCISE_LEVEL = 0;
/** Lv0 の課題文の代わりに出す文言。ドロップダウンでほかの Lv の課題文と並びをそろえるため。 */
export const LEVEL_ZERO_LABEL = '実施不可';

/** レーダーの目盛り上限。全種目の maxLevel と同じ 30。 */
export const RADAR_MAX_LEVEL = 30;

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
    grow: '体を支えること自体に力を使っている段階です。長く座る場面や、動きながら見る場面で崩れやすく、疲れやすくなります。筋力の問題ではなく、姿勢を自動で保つ感覚がこれから育つところです。',
    maxLevel: 30,
    pyramidRoot: '前庭覚',
    pyramidRelated: ['姿勢', 'バランス', '姿勢調整'],
    build: ['体の軸を安定させる', '片足で支える時間を伸ばす', '動きながら姿勢を戻す'],
    changes3m: ['姿勢が崩れるまでの時間が延びる', '座り直しの回数が減る', '食事や机で伏せることが減る'],
    links: ['姿勢を保ちながら手を使う', '動きながら見る'],
    changes6m: ['長い時間の授業を最後まで座っていられる', '動いても字が乱れにくくなる'],
    observations: [
      { text: '体が左右や前後に大きく揺れる' },
      { text: '膝を曲げて重心を落とす' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 7, name: '17cm一巡', why: '幅17cmのまま、方向 → 視覚（自由視・注視固定・閉眼）を順に負荷。Lv7で言語の二重課題を加える' },
      { to: 14, name: '8.5cm一巡', why: '幅8.5cm・タンデムで同じ系列を反復。17cm帯との到達差が足場の狭さとタンデムの影響量。Lv13・14は二重課題つき' },
      { to: 20, name: 'VOR', why: '頭を動かしても的から視線を外さない。垂直→水平の順に負荷し、各系列の最後に二重課題を置く' },
      { to: 26, name: 'パスート', why: '頭は止めたまま、動く的を目だけで追う（追従性眼球運動）。垂直→水平＋二重課題' },
      { to: 30, name: 'VORc・言語負荷', why: '目の条件はVORc水平で固定し、言語課題の重さだけを上げる（しりとり→条件つき→交互カテゴリー→逆唱）' },
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
    grow: '距離やタイミングの見積もりが立ちにくく、キャッチがずれる・物にぶつかるという形で出やすくなります。左右の手を別々に使い分ける動きも、これから育つ段階です。',
    maxLevel: 30,
    pyramidRoot: '身体の位置',
    pyramidRelated: ['ボディイメージ', '目と手の連携'],
    build: ['飛んでくるものを目で追う', '手を出すタイミングを合わせる', '左右の手を分けて使う'],
    changes3m: ['キャッチが安定してくる', '投げる方向のばらつきが減る', '目をそらさず追える場面が増える'],
    links: ['目で追いながら体を動かす', '球技や縄跳びに参加する'],
    changes6m: ['ボール遊びに自分から入っていける', '体育の活動に前向きになる'],
    observations: [
      { text: '投げる高さや方向がばらつく', proprioception: true },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 4, name: '反応（相手投げ）', why: '相手が投げた対象への視線定位とタイミング合わせ。広げる→丸める→タオルの順に猶予が減る' },
      { to: 8, name: '一人操作・巧緻', why: '自分で投げた結果を見て受ける。逆手で左右入れ替え、3点キャッチで手指の巧緻性が加わる' },
      { to: 12, name: 'お手玉・注意選択', why: '重さのある対象。さらに投げる瞬間の合図でボールかティッシュかを選ぶ、注意の選択と持続' },
      { to: 16, name: '片手・左右操作', why: '片手操作の安定性と左右の受け渡し。正中線をまたぐ処理が加わる' },
      { to: 21, name: '両手協調・自然落下', why: '両手同時操作とタイミング一致。自然落下は投げる動作がないぶん予測の手がかりが減る' },
      { to: 26, name: '付加課題・切替', why: '投げてから別動作を挟み、再び対象へ注意を戻す。注意の切り替え' },
      { to: 30, name: 'ボディイメージ・回転', why: '背面キャッチと回転。視覚に頼れない位置での身体図式と、回転後の空間再定位' },
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
    grow: 'つい出しやすい手が先に出てしまったり、決まりは分かっていても手が追いつかなかったりします。手先の器用さではなく、出す手を選び直す働きがこれから育つところです。',
    maxLevel: 30,
    pyramidRoot: '固有覚',
    pyramidRelated: ['運動のコントロール', 'ボディイメージ'],
    build: ['手の形を素早く作る', '力の入れ加減・抜き加減', '見てから動くまでを短くする'],
    changes3m: ['手の形の作り直しが減る', '力加減を調整できる', '道具の扱いが乱暴でなくなる'],
    links: ['書く・切るなど道具の操作につなげる', '考えながら手を動かす'],
    changes6m: ['筆圧が安定してくる', '工作や道具の扱いがスムーズになる'],
    observations: [
      { text: '大きく頭を動かす' },
      { text: '両手同時操作が難しい' },
    ],
    bands: [
      { to: 5, name: '目と手の連携', why: '親の手へのタッチ。視線の向け方と基本的な目と手の協調。両手化・移動・振り向きで視線移動の距離が増える' },
      { to: 9, name: '手形の切り替え', why: 'Lv6からスライド（または動画）で提示。手の形の選択肢が増え、配置変更で位置に合わせた手の移動が加わる' },
      { to: 13, name: 'じゃんけんルール', why: 'すべてグーチョキパーで実施。あいこ→勝つの順にルール変換を加え、混合課題で左右それぞれに適用する' },
      { to: 15, name: '左右別ルール', why: '右手と左手で異なるルールを保持し、同じ刺激・混合課題のそれぞれに対応する' },
      { to: 18, name: '視空間対応・交差', why: '腕を交差した状態で刺激と自分の手を対応づける。右手・左手は交差後の位置ではなく身体上の左右' },
      { to: 21, name: '処理速度', why: '提示時間を通常の5秒から3秒に短縮。正確性を保ったまま短時間で判断して反応する' },
      { to: 26, name: '「負ける」ルール', why: '出しやすい「勝つ」反応を抑えて負ける手を選ぶ。両手同じ→混合課題→左右別→交差→スピードUPの順に重ねる' },
      { to: 29, name: '視覚性ワーキングメモリ', why: '2つの刺激を順に提示して消し、6秒を目安に想起して順番に反応する' },
      { to: 30, name: '干渉抑制・ルール切替', why: '「あいこ・勝つ・負ける」の指示を保持し、手の形と一致しない文字の干渉を抑えて反応する' },
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
    grow: '見本の形を写し取るのに時間がかかったり、探し当てた順番を覚えておけなかったりします。板書や教科書で「どこを見ればいいか」を探す場面で疲れやすくなります。',
    maxLevel: 30,
    pyramidRoot: '視覚',
    pyramidRelated: ['眼球運動', '目と手の連携'],
    build: ['見本を見て同じ形をつくる', '目だけで探す', '順番を覚えておく'],
    changes3m: ['指でなぞらずに探せる', '見本を見て真似できる', '探し物にかかる時間が短くなる'],
    links: ['黒板からノートへ写す', '読む・写すの速さにつなげる'],
    changes6m: ['板書を写す時間が短くなる', '音読で行を飛ばしにくくなる'],
    observations: [
      { text: '目だけでなく頭ごと動かして探す' },
      { text: '反応するのに2秒以上かかる' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 5, name: '注視・注意持続', why: '刺激数の増加に対する注視・姿勢認識・注意の持続' },
      { to: 7, name: '追従性', why: '縦・横の追従性眼球運動（パスート）。旧「視線の安定」軸に相当' },
      { to: 10, name: '跳躍性・回転', why: '縦・横の跳躍性眼球運動（サッケード）と回転。視線移動の切り替え' },
      { to: 15, name: '視覚探索・選択', why: '' },
      { to: 20, name: 'WM・逆順', why: '逆順・奇偶・指定数字逆唱。ワーキングメモリと情報処理' },
      { to: 25, name: '探索の拡張', why: '（仮）配置数を25に増やし、色と数字の二条件で探す' },
      { to: 30, name: '系列の再現', why: '（仮）見本の系列を覚えて再現する。反転・逆順まで' },
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
    grow: '合図より先に動いてしまったり、いちど決めたやり方から切り替えにくかったりします。わざとではなく、動きを止めておく働きと、決まりを差し替える働きがこれから育つ段階です。',
    maxLevel: 30,
    pyramidRoot: '前庭覚',
    pyramidRelated: ['運動のコントロール', '学習・情緒／複合運動'],
    build: ['合図で止まる', 'ルールの切り替えに気づく', '待つ時間を伸ばす'],
    changes3m: ['合図より先に動くことが減る', 'ルールの変更についていける', '負けたあとの立て直しが早くなる'],
    links: ['集団のルールの中で動く', '気持ちの切り替えにつなげる'],
    changes6m: ['順番を待てる場面が増える', '切り替えに時間がかからなくなる'],
    observations: [
      { text: '合図より先に動いてしまう' },
      { text: '反応するのに2秒以上かかる' },
      { text: '指示理解の難しさ', condition: true },
    ],
    bands: [
      { to: 5, name: '反応速度・ルール', why: '色刺激に対する反応速度と基本的なルール理解' },
      { to: 10, name: '聴覚・視聴覚統合', why: '' },
      { to: 15, name: '記憶・ルール変更', why: '色系列の記憶・逆行、実施中のルール変更。認知の切り替えとWM' },
      { to: 18, name: '二重課題', why: 'しりとりと並行して色課題を実施。処理資源の分割' },
      { to: 20, name: 'ストループ', why: '言葉と色の不一致下での反応抑制' },
      { to: 25, name: 'ストループ＋切替', why: '（仮）ストループにルール変更・逆行を重ねる' },
      { to: 30, name: '6色・多重負荷', why: '（仮）色数を6に増やし、二重課題とストループを同時に課す' },
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
