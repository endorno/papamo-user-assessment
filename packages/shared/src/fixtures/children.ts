import type { AgeGroup } from '../master';
import type { AssessmentData, CompletedAssessmentData, CopmGoal, Honorific } from '../schema';

export interface ChildFixture {
  id: string;
  name: string;
  honorific: Honorific;
  grade: string;
  ageHint: string;
  ageGroup: AgeGroup;
  joinedOn: string;
  extUnlocked: boolean;
}

interface AssessmentFixtureBase {
  id: string;
  childId: string;
  seqNo: number;
  assessedOn: string;
  unlockExt: boolean;
  previousId?: string;
}

export type AssessmentFixture =
  | (AssessmentFixtureBase & { status: 'done'; data: CompletedAssessmentData })
  | (AssessmentFixtureBase & { status: 'draft'; data: AssessmentData });

export const CHILD_FIXTURES: ChildFixture[] = [
  { id: 'c1', name: 'はると', honorific: 'kun', grade: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch', joinedOn: '2026-02-20', extUnlocked: false },
  { id: 'c2', name: 'ゆい', honorific: 'chan', grade: '年中', ageHint: '4〜5歳', ageGroup: 'pre', joinedOn: '2026-06-28', extUnlocked: false },
  { id: 'c3', name: 'そうた', honorific: 'kun', grade: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch', joinedOn: '2026-08-20', extUnlocked: false },
  { id: 'c4', name: 'あおい', honorific: 'chan', grade: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch', joinedOn: '2026-05-25', extUnlocked: false },
  { id: 'c6', name: 'みお', honorific: 'chan', grade: '小学4年生', ageHint: '9〜10歳', ageGroup: 'sch', joinedOn: '2025-11-15', extUnlocked: true },
  { id: 'c5', name: 'りん', honorific: 'chan', grade: '年長', ageHint: '5〜6歳', ageGroup: 'pre', joinedOn: '2026-09-02', extUnlocked: false },
];

const FIXTURE_GOALS: Record<string, string[]> = {
  c1: ['板書を写すのが間に合うようになる', 'すぐにあきらめず最後までやりきる'],
  c2: ['転びにくくなる', 'おともだちとボール遊びができるようになる'],
  c3: ['音読で行を飛ばさず読めるようになる', '体育のドッジボールに参加する'],
  c4: ['字をきれいに書けるようになる'],
  c6: ['ノートを最後まで写せるようになる', '忘れ物を減らす'],
  c5: ['来年の入学までに、椅子に座って話が聞けるようになる'],
};

function goalsOf(childId: string): string[] {
  return [...(FIXTURE_GOALS[childId] ?? [])];
}

/** COPM の採点はコーチが聞き取った値。ここでは回ごとの動きが見えるよう固定値を置く。 */
function copmOf(
  childId: string,
  scores: [performance: number, satisfaction: number, importance: number][],
  memos: string[] = [],
): CopmGoal[] {
  return goalsOf(childId).map((text, index) => {
    const [performance, satisfaction, importance] = scores[index] ?? [5, 5, 5];
    return { text, memo: memos[index] ?? '', performance, satisfaction, importance };
  });
}

export const ASSESSMENT_FIXTURES: AssessmentFixture[] = [
  {
    id: 'a1', childId: 'c1', seqNo: 1, assessedOn: '2026-05-30', status: 'done', unlockExt: false,
    data: {
      lv: { post: 5, eyeh: 4, hand: 6 },
      observations: { post: ['体が左右や前後に大きく揺れる', '膝を曲げて重心を落とす'], eyeh: ['投げる高さや方向がばらつく'], hand: ['大きく頭を動かす'] },
      observationNotes: { post: 'Lv5で頭上物が2試行とも落下。後進になると振り返る動作が出る。' },
      engagement: { dur: 1, sup: 2, mot: 1, rec: 1 },
      envSupports: ['e-vis', 'e-cnt', 'e-fav'],
      troubles: ['黒板を写すのが遅い・間に合わない', '落ち着いて座っていられない', '姿勢がすぐ崩れる／机に伏せる', '字を書くと線がガタガタ／筆圧が不安定'],
      wants: ['w16', 'w18'],
      copm: copmOf('c1', [[3, 2, 9], [4, 3, 7]], ['連絡帳が写しきれない日が週3日ほど']),
      ppi: { time: 4, emo: 3, soc: 2, fut: 4, nav: 4 },
      ppiNote: '宿題のときに姿勢が崩れて、毎日声をかけるのがつらい',
      memo: '初回。緊張が強く、後半は集中が切れやすい。ラインウォークは17cmで踏み外しが多く、頭上物を持たせると顕著。',
    },
  },
  {
    id: 'a2', childId: 'c1', seqNo: 2, assessedOn: '2026-08-29', status: 'done', unlockExt: false, previousId: 'a1',
    data: {
      lv: { post: 9, eyeh: 7, hand: 8 },
      observations: { post: ['膝を曲げて重心を落とす'], eyeh: ['投げる高さや方向がばらつく'], hand: [] },
      observationNotes: {},
      engagement: { dur: 3, sup: 3, mot: 2, rec: 2 },
      envSupports: ['e-cnt', 'e-cmp'],
      troubles: ['黒板を写すのが遅い・間に合わない', '姿勢がすぐ崩れる／机に伏せる'],
      wants: ['w16', 'w18'],
      copm: copmOf('c1', [[5, 5, 9], [6, 6, 7]], ['写せる日が増えてきた']),
      ppi: { time: 3, emo: 2, soc: 2, fut: 3, nav: 2 },
      ppiNote: '座り直しは減った。板書はまだ最後まで写せない日がある',
      memo: '2回目。8.5cm帯に入った。じゃんけんの「勝つ」まで安定。保護者の表情が明るい。',
    },
  },
  {
    id: 'a3', childId: 'c2', seqNo: 1, assessedOn: '2026-07-12', status: 'done', unlockExt: false,
    data: {
      lv: { post: 3, eyeh: 6, hand: 2 },
      observations: { post: ['体が左右や前後に大きく揺れる'], eyeh: [], hand: ['両手同時操作が難しい'] },
      observationNotes: { hand: '手の形をつくるまでに時間がかかる。歌に合わせると動きが出る。' },
      engagement: { dur: 2, sup: 1, mot: 1, rec: 2 },
      envSupports: ['e-dem', 'e-sto', 'e-tgt'],
      troubles: ['転びやすい・つまずきやすい', '床に座ると背中が丸まる・すぐ寝転ぶ', '遊びをやめて次に移るのに時間がかかる'],
      wants: ['w9', 'w15'],
      copm: copmOf('c2', [[3, 3, 8], [2, 2, 9]]),
      ppi: { time: 2, emo: 3, soc: 1, fut: 3, nav: 4 },
      ppiNote: '園から「気になる」と言われたが、何をすればいいか分からない',
      memo: '初回。歌に合わせると集中が続く。手の形づくりに時間がかかる。',
    },
  },
  {
    id: 'a4', childId: 'c3', seqNo: 1, assessedOn: '2026-09-03', status: 'draft', unlockExt: false,
    data: {
      lv: { post: 11, eyeh: 9 },
      observations: { post: ['膝を曲げて重心を落とす'], eyeh: ['投げる高さや方向がばらつく'], hand: [] },
      observationNotes: {},
      engagement: { dur: 2 },
      envSupports: [],
      troubles: [], wants: [], copm: [], ppi: {}, ppiNote: '', memo: '',
    },
  },
  {
    id: 'a5', childId: 'c4', seqNo: 1, assessedOn: '2026-06-08', status: 'done', unlockExt: false,
    data: {
      lv: { post: 7, eyeh: 8, hand: 5 },
      observations: { post: ['体が左右や前後に大きく揺れる'], eyeh: [], hand: ['大きく頭を動かす', '両手同時操作が難しい'] },
      observationNotes: {},
      engagement: { dur: 3, sup: 4, mot: 2, rec: 3 },
      envSupports: ['e-ord', 'e-esy'],
      troubles: ['字を書くと線がガタガタ／筆圧が不安定', '力加減が極端（強すぎる・弱すぎる）', '忘れ物・なくし物が多い'],
      wants: ['w12'],
      copm: copmOf('c4', [[4, 3, 10]], ['宿題のたびに書き直しになる']),
      ppi: { time: 3, emo: 4, soc: 3, fut: 3, nav: 3 },
      ppiNote: '', memo: '初回。手の力加減の極端さが強い。',
    },
  },
  {
    id: 'm1', childId: 'c6', seqNo: 1, assessedOn: '2025-12-06', status: 'done', unlockExt: false,
    data: {
      lv: { post: 6, eyeh: 8, hand: 5 },
      observations: { post: ['体が左右や前後に大きく揺れる'], eyeh: [], hand: ['大きく頭を動かす'] },
      observationNotes: {},
      engagement: { dur: 2, sup: 3, mot: 2, rec: 2 },
      envSupports: ['e-vis', 'e-pre'],
      troubles: ['黒板を写すのが遅い・間に合わない', 'ふたつの指示を同時に持っていられない', '忘れ物・なくし物が多い', '姿勢がすぐ崩れる／机に伏せる'],
      wants: ['w16', 'w21'],
      copm: copmOf('c6', [[3, 2, 10], [3, 3, 8]], ['連絡帳を私が先生に確認している']),
      ppi: { time: 3, emo: 4, soc: 3, fut: 4, nav: 4 },
      ppiNote: '連絡帳を写せず、毎日私が先生に確認している',
      memo: '初回。理解は早いが手が追いつかない。姿勢は17cmで崩れる。',
    },
  },
  {
    id: 'm2', childId: 'c6', seqNo: 2, assessedOn: '2026-03-07', status: 'done', unlockExt: false, previousId: 'm1',
    data: {
      lv: { post: 9, eyeh: 10, hand: 8 },
      observations: { post: ['膝を曲げて重心を落とす'], eyeh: ['投げる高さや方向がばらつく'], hand: ['大きく頭を動かす'] },
      observationNotes: {},
      engagement: { dur: 3, sup: 3, mot: 3, rec: 2 },
      envSupports: ['e-pre', 'e-cmp'],
      troubles: ['黒板を写すのが遅い・間に合わない', '忘れ物・なくし物が多い', '姿勢がすぐ崩れる／机に伏せる'],
      wants: ['w16', 'w21'],
      copm: copmOf('c6', [[5, 4, 10], [4, 4, 8]]),
      ppi: { time: 3, emo: 3, soc: 2, fut: 3, nav: 3 },
      ppiNote: '', memo: '2回目。8.5cm帯へ。じゃんけん「勝つ」まで安定。',
    },
  },
  {
    id: 'm3', childId: 'c6', seqNo: 3, assessedOn: '2026-06-20', status: 'done', unlockExt: true, previousId: 'm2',
    data: {
      lv: { post: 12, eyeh: 12, hand: 10, sacc: 7, inhi: 5 },
      observations: { post: [], eyeh: ['投げる高さや方向がばらつく'], hand: ['大きく頭を動かす'], sacc: ['目だけでなく頭ごと動かして探す'], inhi: ['合図より先に動いてしまう'] },
      observationNotes: { sacc: '数字の配置がランダムになると、指でなぞる動作が戻る。' },
      engagement: { dur: 4, sup: 4, mot: 3, rec: 3 },
      envSupports: ['e-cmp', 'e-rol'],
      troubles: ['黒板を写すのが遅い・間に合わない', '忘れ物・なくし物が多い'],
      wants: ['w16', 'w21'],
      copm: copmOf('c6', [[7, 7, 10], [5, 5, 8]], ['板書は最後まで写せる日が増えた']),
      ppi: { time: 2, emo: 2, soc: 2, fut: 3, nav: 2 },
      ppiNote: '板書は最後まで写せる日が増えた',
      memo: '3回目。4・5種目目を開放。あしあとは追従性の帯、信号は反応速度の帯からスタート。',
    },
  },
];
