import { gradeAt, type GradeCode, type GradeSnapshot } from '@papamo/shared';

export type ChildRow = {
  id: string;
  shareCode: string;
  ownerShareCode: string;
  createdBy: string;
  name: string;
  honorific: string;
  gender: string;
  gradeCode: string;
  gradeBaseYear: number;
  joinedOn: string;
  extUnlocked: boolean;
  goals: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** goals 列は JSON の文字列配列。壊れた値が入っていても画面を止めない。 */
export function parseGoals(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((goal) => typeof goal === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

/** 学年は基準年度からの自動進級で決まる。列の型が string なのでここで1回だけ絞る。 */
export function gradeOf(
  child: Pick<ChildRow, 'gradeCode' | 'gradeBaseYear'>,
  date: string,
): GradeSnapshot {
  return gradeAt(
    { gradeCode: child.gradeCode as GradeCode, gradeBaseYear: child.gradeBaseYear },
    date,
  );
}
