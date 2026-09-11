import { gradeByCode, GRADES, type GradeCode } from '../master/grades';
import { schoolYear } from './date';

export interface GradeSnapshot {
  code: GradeCode | 'graduated';
  name: string;
  ageHint: string;
  ageGroup: 'pre' | 'sch';
  graduated: boolean;
}

export function gradeAt(
  child: { gradeCode: GradeCode; gradeBaseYear: number },
  today: string,
): GradeSnapshot {
  const baseIndex = GRADES.findIndex((grade) => grade.code === child.gradeCode);
  const offset = schoolYear(today) - child.gradeBaseYear;
  const index = Math.min(baseIndex + offset, GRADES.length - 1);
  const grade = GRADES[Math.max(0, index)];
  if (!grade) {
    throw new Error(`学年の計算に失敗しました: ${child.gradeCode}`);
  }

  if (baseIndex + offset >= GRADES.length) {
    return {
      code: 'graduated',
      name: '中学卒業以上',
      ageHint: '15歳以上',
      ageGroup: 'sch',
      graduated: true,
    };
  }

  return { ...grade, graduated: false };
}

export function ageGroupForGrade(code: GradeCode): 'pre' | 'sch' {
  return gradeByCode(code).ageGroup;
}
