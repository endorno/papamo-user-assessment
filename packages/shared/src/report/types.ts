import type { GradeSnapshot } from '../domain/grade';
import type { AgeGroup, EngagementKey, ExerciseKey, TuningKey } from '../master';
import type { CompletedAssessmentData, CopmGoal, Honorific } from '../schema';

export interface ChildSnapshot {
  name: string;
  honorific: Honorific;
  grade: string;
  /** 実施日時点の学年。年齢との比較（M3）と学年ラダー（M6）に使う。 */
  gradeCode: GradeSnapshot['code'];
  ageHint: string;
  ageGroup: AgeGroup;
  joinedMonth: string;
}

export interface CompletedAssessment {
  seqNo: number;
  assessedOn: string;
  unlockExt: boolean;
  data: CompletedAssessmentData;
}

export interface MasterData {
  version: string;
}

export interface ReportInput {
  child: ChildSnapshot;
  coach: { displayName: string };
  assessment: CompletedAssessment;
  previous?: CompletedAssessment;
  master: MasterData;
  generatedAt: string;
}

export interface ReportLevel {
  key: ExerciseKey;
  name: string;
  parentName: string;
  lv: number;
  maxLv: number;
  prevLv?: number;
  delta?: number;
  band: string;
  ladderLabel: string;
}

/** 保護者向けレポート1枚目の、種目ごとの「できている力／次に高めたい力」（M1・M2）。 */
export interface ReportAbility {
  key: ExerciseKey;
  /** 通過した最後の帯の力の名前。通過した帯がなければ null。 */
  can: string | null;
  /** 取り組み中の帯の力の名前。最後の帯まで通過していれば null。 */
  next: string | null;
  /** 取り組み中の帯のブロック（①②③）。 */
  blocks: string[];
}

/** ピラミッドで色を付ける理由。goal＝目標ブロック（赤い塗り）／issue＝課題ブロック（青い太枠）／both＝両方。 */
export type PyramidSource = 'both' | 'goal' | 'issue';

/** 困りごとの背景にありそうな力。チェックされたお困りごとをドメインごとに1行にまとめる。 */
export interface ReportTroubleBackground {
  id: number;
  /** 背景にありそうな力。 */
  parentLabel: string;
  /** 優先して見る土台（ブロック）。 */
  block: string;
  /** 表面に見える困りごと（チェックした項目）。 */
  troubles: string[];
}

/** 今の困りごとが続いた場合に起こりうること（M3・M6）。 */
export interface ReportRisks {
  /** 測定の裏づけ。到達率が学年の目安より下の種目。expectedLv は目安の到達率を Lv に直したもの。 */
  evidence: { key: ExerciseKey; name: string; lv: number; maxLv: number; expectedLv: number }[];
  /** 学年が上がったときの懸念。いまの段階の1つ先・3つ先のうち、お困りごとのカテゴリに合う項目がある段階だけ。 */
  stages: { label: string; theme: string; demand: string; gradesAhead: number; concerns: string[] }[];
}

/** コーチ向け「領域ごとのメニュー」の1件。属性は分かっているものだけ入る。 */
export interface ReportAreaMenu {
  name: string;
  difficulty?: string;
  form?: string;
  equipment?: string;
  parentBurden?: string;
  category?: string;
}

/** 保護者向けレポート2枚目の「最重要にすべき領域」。下の段から並べる。 */
export interface ReportFocusArea {
  block: string;
  tier: number;
  source: PyramidSource;
  definition: string;
  effect: string;
  /** このブロックを優先する領域に持つ目標（目標表の並び）。目標由来でなければ空。 */
  goals: string[];
}

export interface ReportTuningNote {
  key: TuningKey;
  label: string;
  note: string;
}

export interface ReportContent {
  kind: 'first' | 'comparison';
  generator: string;
  masterVersion: string;
  generatedAt: string;
  header: {
    childName: string;
    honorific: Honorific;
    grade: string;
    ageHint: string;
    joinedMonth: string;
    seqNo: number;
    assessedOn: string;
    prevAssessedOn?: string;
    coachName: string;
  };
  levels: ReportLevel[];
  abilities: ReportAbility[];
  /** 当日の様子（指示理解の難しさなど）による測定条件の注記。 */
  conditionNotes: { key: ExerciseKey; name: string; notes: string[] }[];
  upcomingExercises: { key: ExerciseKey; name: string; parentName: string; about: string }[];
  engagement: {
    key: EngagementKey;
    title: string;
    subtitle: string;
    level: number;
    levelCount: number;
    label: string;
    prevLevel?: number;
    delta?: number;
  }[];
  changes3m?: string[];
  troubles: {
    current: string[];
    byCategory: { id: string; icon: string; title: string; items: string[] }[];
  };
  troubleBackgrounds: ReportTroubleBackground[];
  /** 裏づけも懸念もなければ null（項目ごと出さない）。 */
  risks: ReportRisks | null;
  pyramid: {
    rows: { tier: number; items: string[] }[];
    /** 目標ブロック（M5）。赤い塗り。 */
    goalBlocks: string[];
    /** 課題ブロック（M4）。青い太枠。 */
    issueBlocks: string[];
  };
  focusAreas: ReportFocusArea[];
  // ツール導入前の採点（baseline）は previous に移して返す。選んだ候補（wantId）は判定にだけ使い、載せない。
  copm: (Omit<CopmGoal, 'baseline' | 'wantId'> & {
    /** 優先する領域（M5。段の低い順のブロック3つまで）。次の3か月の目標だけが持ち、語彙表に当たらなければ空。 */
    areas: string[];
    previous?: { performance: number; satisfaction: number; importance?: number };
    performanceDelta?: number;
    satisfactionDelta?: number;
  })[];
  nextDue: string;
  /** 6か月レビューの目安日。 */
  nextReview: string;
  tuning: ReportTuningNote[];
  coach: {
    /** 観察された様子。見えた動作のチェックか自由記入がある種目だけ。 */
    exerciseNotes: {
      key: ExerciseKey;
      lv: number;
      observations: string[];
      conditions: string[];
      note: string;
    }[];
    /**
     * 方針とメニューの方向性。目標ブロックと課題ブロックのすべてを、最重要にすべき領域と同じ順（両方→目標だけ→課題だけ、
     * 段の低い順）に並べる。goals は目標表の並びの目標の文言。
     */
    areaMenus: {
      block: string;
      tier: number;
      source: PyramidSource;
      goals: string[];
      aim: string;
      menus: ReportAreaMenu[];
    }[];
  };
}

export interface ReportGenerator {
  readonly id: string;
  generate(input: ReportInput): Promise<ReportContent>;
}
