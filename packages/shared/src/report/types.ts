import type { AgeGroup, CoachCautionKey, EngagementKey, ExerciseKey, PpiKey, TuningKey } from '../master';
import type { CompletedAssessmentData, CopmGoal, Honorific } from '../schema';

export interface ChildSnapshot {
  name: string;
  honorific: Honorific;
  grade: string;
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
  /** Lv1 以上で実際に測れた回かどうか。0＝未実施／-1＝実施不可は false。 */
  measured: boolean;
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
  priorityMeasured: boolean;
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
  /** 今回測っていない／実施できなかった種目（図の注記に使う）。 */
  unmeasured: { key: ExerciseKey; name: string; upcoming: boolean; notPossible: boolean }[];
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
  envSupports: { group: string; items: string[] }[];
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
  risks: string[];
  pyramid: {
    rows: { tier: number; items: string[] }[];
    highlighted: string[];
    root: string;
    rootTierLabel: string;
    related: string[];
    sourceKey: ExerciseKey;
  };
  link: { lowestKey: ExerciseKey; text: string };
  ppi: { current: Record<PpiKey, number>; previous?: Record<PpiKey, number>; note: string };
  roadmap: {
    month3Build: string[];
    month3Changes: string[];
    month6Links: string[];
    month6Changes: string[];
  };
  wants: { id: string; group: string; icon: string; text: string; short: string; menu: string }[];
  copm: (CopmGoal & {
    previous?: { performance: number; satisfaction: number; importance: number };
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
    memo: string;
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
    wantPackages: {
      id: string;
      icon: string;
      short: string;
      menu: string;
      axisKey: ExerciseKey;
      axisLv: number;
      axisMaxLv: number;
      status: WantPackageStatus;
    }[];
    copmFocus: {
      mostImportant: { text: string; importance: number } | null;
      lowSatisfaction: string[];
    };
  };
}

export type CoachFocusRole = 'main' | 'next' | 'keep';

/** ready＝着手可／foundationFirst＝土台が届いていない／unmeasured＝支える種目が未実施。 */
export type WantPackageStatus = 'ready' | 'foundationFirst' | 'unmeasured';

export interface ReportGenerator {
  readonly id: string;
  generate(input: ReportInput): Promise<ReportContent>;
}
