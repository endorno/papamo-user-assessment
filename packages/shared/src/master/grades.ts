export const GRADES = [
  { code: 'k0', name: '未就園', ageHint: '2〜3歳', ageGroup: 'pre' },
  { code: 'k1', name: '年少', ageHint: '3〜4歳', ageGroup: 'pre' },
  { code: 'k2', name: '年中', ageHint: '4〜5歳', ageGroup: 'pre' },
  { code: 'k3', name: '年長', ageHint: '5〜6歳', ageGroup: 'pre' },
  { code: 'e1', name: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch' },
  { code: 'e2', name: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch' },
  { code: 'e3', name: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch' },
  { code: 'e4', name: '小学4年生', ageHint: '9〜10歳', ageGroup: 'sch' },
  { code: 'e5', name: '小学5年生', ageHint: '10〜11歳', ageGroup: 'sch' },
  { code: 'e6', name: '小学6年生', ageHint: '11〜12歳', ageGroup: 'sch' },
  { code: 'j1', name: '中学1年生', ageHint: '12〜13歳', ageGroup: 'sch' },
  { code: 'j2', name: '中学2年生', ageHint: '13〜14歳', ageGroup: 'sch' },
  { code: 'j3', name: '中学3年生', ageHint: '14〜15歳', ageGroup: 'sch' },
] as const;

export type GradeCode = (typeof GRADES)[number]['code'];
export type GradeDefinition = (typeof GRADES)[number];

export function gradeByCode(code: GradeCode): GradeDefinition {
  const grade = GRADES.find((candidate) => candidate.code === code);
  if (!grade) {
    throw new Error(`未知の学年: ${code}`);
  }
  return grade;
}
