import type { AgeGroup, PpiKey } from '../master';
import type { ExerciseKey, PlanKey } from '../master';
import type { AssessmentData, CompletedAssessmentData, Honorific } from '../schema';

export interface ChildSnapshot {
  name: string;
  honorific: Honorific;
  grade: string;
  ageHint: string;
  ageGroup: AgeGroup;
  joinedOn?: string;
  goals: string[];
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
  lv: number;
  prevLv?: number;
  delta?: number;
  band: string;
  ladderLabel: string;
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
    joinedOn?: string;
    seqNo: number;
    assessedOn: string;
    prevAssessedOn?: string;
    coachName: string;
  };
  levels: ReportLevel[];
  upcomingExercises: { key: ExerciseKey; name: string; parentName: string; teaser: string }[];
  priorities: { key: ExerciseKey; parentName: string; lv: number; grow: string; build: string[] }[];
  strengths: { key: ExerciseKey; parentName: string; lv: number }[];
  changes3m?: string[];
  troubles: { current: string[]; gone?: string[]; stayed?: string[]; added?: string[] };
  link: { lowestKey: ExerciseKey; text: string };
  ppi: { current: Record<PpiKey, number>; previous?: Record<PpiKey, number>; note: string };
  plan: { key: PlanKey; name: string; window: string; items: readonly string[] } | null;
  outlook: string[];
  nextDue: string;
  coach: {
    strategies: {
      key: ExerciseKey;
      lv: number;
      band: string;
      nextLv: number;
      nextLabel: string;
      errs: string[];
    }[];
    memo: string;
  };
}

export interface ReportGenerator {
  readonly id: string;
  generate(input: ReportInput): Promise<ReportContent>;
}

export type DraftAssessmentData = AssessmentData;
