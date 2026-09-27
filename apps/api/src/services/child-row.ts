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
  joinedMonth: string;
  extUnlocked: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

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
