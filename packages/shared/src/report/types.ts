import type { GradeSnapshot } from '../domain/grade';
import type { AgeGroup, CoachCautionKey, EngagementKey, ExerciseKey, TuningKey } from '../master';
import type { CompletedAssessmentData, CopmGoal, Honorific } from '../schema';

export interface ChildSnapshot {
  name: string;
  honorific: Honorific;
  grade: string;
  /** 実施日時点の学年。「学年が上がると」の見通しで、いまから何学年先かを数えるのに使う。 */
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

/** 困りごと × 実測の照合結果。verdict はモックの分類をそのまま使う。 */
export type DomainVerdict = '強く一致' | '一致' | '未測定' | '不一致';

export interface ReportDomainHit {
  id: number;
  title: string;
  parentLabel: string;
  parentText: string;
  pyramid: string;
  troubles: string[];
  verdict: DomainVerdict;
  priorityKey: ExerciseKey;
  priorityName: string;
  priorityParentName: string;
  priorityLv: number;
  priorityMaxLv: number;
  /** 主軸種目をその回に記録したか。未開放の4・5種目目なら false（priorityLv は 0 を入れる）。 */
  priorityMeasured: boolean;
}

/** 保護者向けレポート1枚目の、種目ごとの「できている力／次に高めたい力」。 */
export interface ReportAbility {
  key: ExerciseKey;
  can: string;
  next: string;
  /** その種目を支えるピラミッドの要素（①②③）。 */
  foundations: string[];
}

/** ピラミッドで色を付ける理由。both＝目標と測定・お困りごとの両方。 */
export type PyramidSource = 'both' | 'measured' | 'goal';

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
  item: string;
  tier: number;
  source: PyramidSource;
  definition: string;
  effect: string;
  /** この領域に結びつく目標のうち、重要度がいちばん高いもの。結びつく目標が無ければ null。 */
  goalText: string | null;
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
  priorities: { key: ExerciseKey; parentName: string; lv: number; maxLv: number; grow: string; build: string[] }[];
  strengths: { key: ExerciseKey; parentName: string; lv: number; maxLv: number }[];
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
    gone?: string[];
    stayed?: string[];
    added?: string[];
  };
  domainHits: ReportDomainHit[];
  rootDomain: { id: number; title: string; parentLabel: string; parentText: string } | null;
  /** 力加減の基準（固有覚）についての注記を出すか。 */
  proprioceptionNote: boolean;
  /** emphasis は text の中で太字にするキーフレーズ。 */
  risks: { text: string; emphasis: string }[];
  /** 学年が上がったときの見通し。先の時期が無い（中学卒業以上）ときは null。 */
  gradeOutlook: {
    milestones: { label: string; theme: string; gradesAhead: number }[];
    summary: string;
  } | null;
  pyramid: {
    rows: { tier: number; items: string[] }[];
    /** 測定・お困りごと由来で色を付ける要素。 */
    highlighted: string[];
    /** 目標由来で色を付ける要素。 */
    goalItems: string[];
    root: string;
    rootTierLabel: string;
    related: string[];
    sourceKey: ExerciseKey;
  };
  focusAreas: ReportFocusArea[];
  link: { lowestKey: ExerciseKey; text: string };
  roadmap: {
    month3Build: string[];
    month3Changes: string[];
    month6Links: string[];
    month6Changes: string[];
  };
  // ツール導入前の採点（baseline）は previous に移して返す。
  copm: (Omit<CopmGoal, 'baseline'> & {
    /** 目標の達成のために優先する領域（ピラミッドの要素）。結びつけられない目標は空。 */
    areas: string[];
    previous?: { performance: number; satisfaction: number; importance?: number };
    performanceDelta?: number;
    satisfactionDelta?: number;
  })[];
  growthSigns: string[];
  watchPoints: string[];
  nextDue: string;
  /** 6か月レビューの目安日。 */
  nextReview: string;
  tuning: ReportTuningNote[];
  coach: {
    strategies: {
      key: ExerciseKey;
      lv: number;
      band: string;
      nextLv: number;
      nextLabel: string;
      observations: string[];
      note: string;
    }[];
    /** 3か月・6か月に当てるメニュー。主軸＝最小Lv／次点＝2番目／維持＝最大Lv。 */
    plan: {
      focus: {
        key: ExerciseKey;
        role: CoachFocusRole;
        lv: number;
        maxLv: number;
        month3: string[];
        month6: string[];
      }[];
      domainMenus: { id: number; title: string; region: string; menus: string[] }[];
    };
    /** 全種目の見えた動作・自由記入・測定条件（優先テーマ以外も含む）。 */
    exerciseNotes: {
      key: ExerciseKey;
      lv: number;
      observations: string[];
      conditions: string[];
      note: string;
    }[];
    cautions: { key: CoachCautionKey; title: string; text: string; exercises: ExerciseKey[] }[];
    copmFocus: {
      mostImportant: { text: string; importance: number } | null;
      lowSatisfaction: string[];
    };
    /**
     * 目標と課題から導き出した領域ごとのメニュー（コーチ向け「方針とメニューの方向性」）。
     * 目標の「優先する領域」に挙がった領域を、ピラミッドの下の段から並べる。goals は重要度順の目標の文言。
     */
    areaMenus: {
      item: string;
      tier: number;
      goals: string[];
      aim: string;
      menus: ReportAreaMenu[];
    }[];
  };
}

export type CoachFocusRole = 'main' | 'next' | 'keep';

export interface ReportGenerator {
  readonly id: string;
  generate(input: ReportInput): Promise<ReportContent>;
}
