import type { TroubleCategory } from './troubles';

/**
 * 学年マスタ。年少〜高校3年生をこの順に並べ、進級は添字で数える（4/1 に自動で進級）。
 * expectedRate＝その学年の到達率（Lv÷種目の上限）の目安。年齢との比較（仕様の M3・付録C）に使う。
 * 未就園は「入力からレポート作成までの仕様」に合わせて外した（2026-10-28）。
 */
export const GRADES = [
  { code: 'k1', name: '年少', ageHint: '3〜4歳', ageGroup: 'pre', expectedRate: 0.10 },
  { code: 'k2', name: '年中', ageHint: '4〜5歳', ageGroup: 'pre', expectedRate: 0.17 },
  { code: 'k3', name: '年長', ageHint: '5〜6歳', ageGroup: 'pre', expectedRate: 0.25 },
  { code: 'e1', name: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch', expectedRate: 0.32 },
  { code: 'e2', name: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch', expectedRate: 0.40 },
  { code: 'e3', name: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch', expectedRate: 0.47 },
  { code: 'e4', name: '小学4年生', ageHint: '9〜10歳', ageGroup: 'sch', expectedRate: 0.55 },
  { code: 'e5', name: '小学5年生', ageHint: '10〜11歳', ageGroup: 'sch', expectedRate: 0.62 },
  { code: 'e6', name: '小学6年生', ageHint: '11〜12歳', ageGroup: 'sch', expectedRate: 0.68 },
  { code: 'j1', name: '中学1年生', ageHint: '12〜13歳', ageGroup: 'sch', expectedRate: 0.74 },
  { code: 'j2', name: '中学2年生', ageHint: '13〜14歳', ageGroup: 'sch', expectedRate: 0.78 },
  { code: 'j3', name: '中学3年生', ageHint: '14〜15歳', ageGroup: 'sch', expectedRate: 0.82 },
  { code: 'h1', name: '高校1年生', ageHint: '15〜16歳', ageGroup: 'sch', expectedRate: 0.85 },
  { code: 'h2', name: '高校2年生', ageHint: '16〜17歳', ageGroup: 'sch', expectedRate: 0.87 },
  { code: 'h3', name: '高校3年生', ageHint: '17〜18歳', ageGroup: 'sch', expectedRate: 0.90 },
] as const;

export type GradeCode = (typeof GRADES)[number]['code'];
/** 就学（sch）／未就学（pre）。学年から決まる。 */
export type AgeGroup = (typeof GRADES)[number]['ageGroup'];

/**
 * 学年ラダー11段階（仕様の M6・付録G）。段階ごとのテーマ・求められる力と、起きやすいこと（お困りごとのカテゴリ A〜E つき）。
 * 学年が上がったときの懸念は、いまの段階の1つ先と3つ先から、チェックしたお困りごとのカテゴリに合う項目を選ぶ。
 */
export const GRADE_STAGES: readonly {
  label: string;
  grades: readonly GradeCode[];
  theme: string;
  demand: string;
  concerns: readonly { text: string; category: TroubleCategory['id'] }[];
}[] = [
  {
    label: '年少',
    grades: ['k1'],
    theme: '自己調整のはじまり',
    demand: '初めての集団生活の中で、自分の気持ちと体をコントロールする力',
    concerns: [
      { text: 'かんしゃくが増える', category: 'B' },
      { text: '切り替えが苦手になる', category: 'B' },
      { text: '落ち着いて座っていられない', category: 'C' },
      { text: '友だちと遊びにくい', category: 'B' },
      { text: '感覚の過敏やこだわりが出やすい', category: 'C' },
    ],
  },
  {
    label: '年中',
    grades: ['k2'],
    theme: '実行機能の芽生え',
    demand: 'ルールを理解し、順番を待ち、友だちと協力する力',
    concerns: [
      { text: '待てない・割り込みが増える', category: 'B' },
      { text: '衝動的に動いてしまう', category: 'B' },
      { text: '不器用さが目立ってくる', category: 'D' },
      { text: '指示が入りにくくなる', category: 'A' },
      { text: '集中が続かない', category: 'B' },
    ],
  },
  {
    label: '年長',
    grades: ['k3'],
    theme: '就学レディネス',
    demand: '座る・聞く・書くの土台をつくる時期',
    concerns: [
      { text: '就学への不安が強くなる', category: 'B' },
      { text: '姿勢が崩れやすくなる', category: 'C' },
      { text: '鉛筆の操作が苦手になる', category: 'D' },
      { text: '先生の話を聞き取りにくくなる', category: 'A' },
      { text: '集中が続かない', category: 'B' },
    ],
  },
  {
    label: '小1',
    grades: ['e1'],
    theme: '学校適応',
    demand: '授業・宿題・体育・友だち関係など、新しいことが一気に始まる時期',
    concerns: [
      { text: '授業中に座っていられない', category: 'C' },
      { text: '学校へ行き渋る', category: 'B' },
      { text: '宿題に時間がかかる', category: 'A' },
      { text: '板書を写すのが苦手になる', category: 'A' },
      { text: '忘れ物が多くなる', category: 'E' },
    ],
  },
  {
    label: '小2',
    grades: ['e2'],
    theme: '自己効力感の形成',
    demand: '「自分はできる」という自信を育てる時期',
    concerns: [
      { text: '字を書くのが苦手になる', category: 'D' },
      { text: 'ケアレスミスが増える', category: 'A' },
      { text: '忘れ物が増える', category: 'E' },
      { text: '自信をなくしやすくなる', category: 'B' },
      { text: '「勉強が嫌い」が始まる', category: 'A' },
    ],
  },
  {
    label: '小3',
    grades: ['e3'],
    theme: '抽象思考への移行',
    demand: '具体的な内容から、抽象的な内容へ進む時期',
    concerns: [
      { text: '話についていけなくなる', category: 'A' },
      { text: '集中が続かない', category: 'B' },
      { text: '疲れやすくなる', category: 'C' },
      { text: '宿題に時間がかかる', category: 'A' },
      { text: 'テストで実力を出せない', category: 'A' },
    ],
  },
  {
    label: '小4',
    grades: ['e4'],
    theme: '自己意識・仲間意識の発達',
    demand: '自分と周りを比べ始め、友達関係が複雑になる時期',
    concerns: [
      { text: '友だちとのトラブルが増える', category: 'B' },
      { text: '自己肯定感が下がる', category: 'B' },
      { text: '不器用さが目立つ', category: 'D' },
      { text: '空気が読めないと言われる', category: 'B' },
      { text: '学校へ行きたがらなくなる', category: 'B' },
    ],
  },
  {
    label: '小5',
    grades: ['e5'],
    theme: '実行機能・自己管理の発達',
    demand: '役割や責任が増え、自分で考え計画して行動する力が求められる時期',
    concerns: [
      { text: '提出物の管理ができない', category: 'E' },
      { text: '勉強量についていけない', category: 'A' },
      { text: '感情の起伏が大きくなる', category: 'B' },
      { text: 'イライラ・不安が強くなる', category: 'B' },
      { text: '睡眠のリズムが乱れやすい', category: 'C' },
    ],
  },
  {
    label: '小6',
    grades: ['e6'],
    theme: '自立への移行',
    demand: '中学校生活に向けて、心も身体も準備する時期',
    concerns: [
      { text: '中学校への不安が強くなる', category: 'B' },
      { text: '学習意欲が下がる', category: 'A' },
      { text: '人間関係の悩みが増える', category: 'B' },
      { text: '自己肯定感が下がる', category: 'B' },
      { text: '受験のストレスが強くなる', category: 'B' },
    ],
  },
  {
    label: '中学',
    grades: ['j1', 'j2', 'j3'],
    theme: '思春期の確立',
    demand: '心も身体も大きく変化し、自分らしさと将来について考え始める時期',
    concerns: [
      { text: '不安やイライラが強くなる', category: 'B' },
      { text: '勉強と部活の両立が難しくなる', category: 'E' },
      { text: '集中が続かない', category: 'B' },
      { text: '人間関係の悩みが増える', category: 'B' },
      { text: '疲れや頭痛などの体調不良が出る', category: 'C' },
    ],
  },
  {
    label: '高校',
    grades: ['h1', 'h2', 'h3'],
    theme: '自己実現と将来設計',
    demand: '将来の目標に向かって、自分で選び自分で動く力が求められる時期',
    concerns: [
      { text: '受験のストレス・不安が強くなる', category: 'B' },
      { text: '睡眠の乱れ・疲労が出る', category: 'C' },
      { text: 'モチベーションが下がる', category: 'B' },
      { text: '自信が持てなくなる', category: 'B' },
      { text: 'スマホ・SNSに頼りやすくなる', category: 'B' },
    ],
  },
];

/** その学年が学年ラダーの何段階目か。学年マスタに無い（高校卒業以上）なら -1。 */
export function gradeStageIndexOf(code: string): number {
  return GRADE_STAGES.findIndex((stage) => stage.grades.some((grade) => grade === code));
}
