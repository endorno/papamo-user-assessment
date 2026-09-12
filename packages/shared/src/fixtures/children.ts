import type { AgeGroup } from '../master';
import type { AssessmentData, CompletedAssessmentData, Honorific } from '../schema';

export interface ChildFixture {
  id: string;
  name: string;
  honorific: Honorific;
  grade: string;
  ageHint: string;
  ageGroup: AgeGroup;
  joinedOn: string;
  extUnlocked: boolean;
  goals: string[];
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
  { id: 'c1', name: 'はると', honorific: 'kun', grade: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch', joinedOn: '2026-02-20', extUnlocked: false, goals: ['板書を写すのが間に合うようにしたい', 'すぐにあきらめず最後までやりきってほしい'] },
  { id: 'c2', name: 'ゆい', honorific: 'chan', grade: '年中', ageHint: '4〜5歳', ageGroup: 'pre', joinedOn: '2026-06-28', extUnlocked: false, goals: ['転びにくくなってほしい', 'おともだちとボール遊びができるように'] },
  { id: 'c3', name: 'そうた', honorific: 'kun', grade: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch', joinedOn: '2026-08-20', extUnlocked: false, goals: ['音読で行を飛ばさないようにしたい', '体育のドッジボールに参加できるように'] },
  { id: 'c4', name: 'あおい', honorific: 'chan', grade: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch', joinedOn: '2026-05-25', extUnlocked: false, goals: ['字をきれいに書けるようになりたい'] },
  { id: 'c6', name: 'みお', honorific: 'chan', grade: '小学4年生', ageHint: '9〜10歳', ageGroup: 'sch', joinedOn: '2025-11-15', extUnlocked: true, goals: ['ノートを最後まで写せるようになりたい', '忘れ物を減らしたい'] },
  { id: 'c5', name: 'りん', honorific: 'chan', grade: '年長', ageHint: '5〜6歳', ageGroup: 'pre', joinedOn: '2026-09-02', extUnlocked: false, goals: ['来年の入学までに、椅子に座って話が聞けるように'] },
];

function goalsOf(childId: string): string[] {
  return [...(CHILD_FIXTURES.find(({ id }) => id === childId)?.goals ?? [])];
}

export const ASSESSMENT_FIXTURES: AssessmentFixture[] = [
  {
    id: 'a1', childId: 'c1', seqNo: 1, assessedOn: '2026-05-30', status: 'done', unlockExt: false,
    data: {
      lv: { post: 5, eyeh: 4, hand: 6 },
      errs: { post: ['幅からはみ出す', '頭上物を落とす'], eyeh: ['投げる高さがばらつく'], hand: ['手の形を作り直す'] },
      troubles: ['黒板を写すのが遅い・間に合わない', '落ち着いて座っていられない', '姿勢がすぐ崩れる／机に伏せる', '字を書くと線がガタガタ／筆圧が不安定'],
      ppi: { time: 4, emo: 3, soc: 2, fut: 4, nav: 4 },
      ppiNote: '宿題のときに姿勢が崩れて、毎日声をかけるのがつらい',
      plan: 'base', memo: '初回。緊張が強く、後半は集中が切れやすい。ラインウォークは17cmで踏み外しが多く、頭上物を持たせると顕著。', goals: goalsOf('c1'),
    },
  },
  {
    id: 'a2', childId: 'c1', seqNo: 2, assessedOn: '2026-08-29', status: 'done', unlockExt: false, previousId: 'a1',
    data: {
      lv: { post: 9, eyeh: 7, hand: 8 },
      errs: { post: ['頭上物を落とす'], eyeh: ['投げる高さがばらつく'], hand: [] },
      troubles: ['黒板を写すのが遅い・間に合わない', '姿勢がすぐ崩れる／机に伏せる'],
      ppi: { time: 3, emo: 2, soc: 2, fut: 3, nav: 2 },
      ppiNote: '座り直しは減った。板書はまだ最後まで写せない日がある',
      plan: 'select', memo: '2回目。8.5cm帯に入った。じゃんけんの「勝つ」まで安定。保護者の表情が明るい。', goals: goalsOf('c1'),
    },
  },
  {
    id: 'a3', childId: 'c2', seqNo: 1, assessedOn: '2026-07-12', status: 'done', unlockExt: false,
    data: {
      lv: { post: 3, eyeh: 6, hand: 2 },
      errs: { post: ['踵とつま先が離れる', '途中で止まる・振り返る'], eyeh: [], hand: ['タオルから足が落ちる', '手の形を作り直す'] },
      troubles: ['転びやすい・つまずきやすい', '床に座ると背中が丸まる・すぐ寝転ぶ', '遊びをやめて次に移るのに時間がかかる'],
      ppi: { time: 2, emo: 3, soc: 1, fut: 3, nav: 4 },
      ppiNote: '園から「気になる」と言われたが、何をすればいいか分からない',
      plan: 'pre', memo: '初回。歌に合わせると集中が続く。手の形づくりに時間がかかる。', goals: goalsOf('c2'),
    },
  },
  {
    id: 'a4', childId: 'c3', seqNo: 1, assessedOn: '2026-09-03', status: 'draft', unlockExt: false,
    data: {
      lv: { post: 11, eyeh: 9 },
      errs: { post: ['途中で止まる・振り返る'], eyeh: ['体ごと動いて捕る'], hand: [] },
      troubles: [], ppi: {}, ppiNote: '', plan: null, memo: '', goals: [],
    },
  },
  {
    id: 'a5', childId: 'c4', seqNo: 1, assessedOn: '2026-06-08', status: 'done', unlockExt: false,
    data: {
      lv: { post: 7, eyeh: 8, hand: 5 },
      errs: { post: ['幅からはみ出す'], eyeh: [], hand: ['明らかに遅れて出す', 'ルールを取り違える'] },
      troubles: ['字を書くと線がガタガタ／筆圧が不安定', '力加減が極端（強すぎる・弱すぎる）', '忘れ物・なくし物が多い'],
      ppi: { time: 3, emo: 4, soc: 3, fut: 3, nav: 3 },
      ppiNote: '', plan: 'base', memo: '初回。手の力加減の極端さが強い。', goals: goalsOf('c4'),
    },
  },
  {
    id: 'm1', childId: 'c6', seqNo: 1, assessedOn: '2025-12-06', status: 'done', unlockExt: false,
    data: {
      lv: { post: 6, eyeh: 8, hand: 5 },
      errs: { post: ['幅からはみ出す'], eyeh: [], hand: ['手の形を作り直す', 'ルールを取り違える'] },
      troubles: ['黒板を写すのが遅い・間に合わない', 'ふたつの指示を同時に持っていられない', '忘れ物・なくし物が多い', '姿勢がすぐ崩れる／机に伏せる'],
      ppi: { time: 3, emo: 4, soc: 3, fut: 4, nav: 4 },
      ppiNote: '連絡帳を写せず、毎日私が先生に確認している',
      plan: 'base', memo: '初回。理解は早いが手が追いつかない。姿勢は17cmで崩れる。', goals: goalsOf('c6'),
    },
  },
  {
    id: 'm2', childId: 'c6', seqNo: 2, assessedOn: '2026-03-07', status: 'done', unlockExt: false, previousId: 'm1',
    data: {
      lv: { post: 9, eyeh: 10, hand: 8 },
      errs: { post: ['頭上物を落とす'], eyeh: ['投げる高さがばらつく'], hand: ['ルールを取り違える'] },
      troubles: ['黒板を写すのが遅い・間に合わない', '忘れ物・なくし物が多い', '姿勢がすぐ崩れる／机に伏せる'],
      ppi: { time: 3, emo: 3, soc: 2, fut: 3, nav: 3 },
      ppiNote: '', plan: 'select', memo: '2回目。8.5cm帯へ。じゃんけん「勝つ」まで安定。', goals: goalsOf('c6'),
    },
  },
  {
    id: 'm3', childId: 'c6', seqNo: 3, assessedOn: '2026-06-20', status: 'done', unlockExt: true, previousId: 'm2',
    data: {
      lv: { post: 12, eyeh: 12, hand: 10, sacc: 7, inhi: 5 },
      errs: { post: [], eyeh: ['投げる高さがばらつく'], hand: ['明らかに遅れて出す'], sacc: ['頭ごと動かして探す'], inhi: ['合図より先に動く'] },
      troubles: ['黒板を写すのが遅い・間に合わない', '忘れ物・なくし物が多い'],
      ppi: { time: 2, emo: 2, soc: 2, fut: 3, nav: 2 },
      ppiNote: '板書は最後まで写せる日が増えた',
      plan: 'select', memo: '3回目。4・5種目目を開放。あしあとは追従性の帯、信号は反応速度の帯からスタート。', goals: goalsOf('c6'),
    },
  },
];
