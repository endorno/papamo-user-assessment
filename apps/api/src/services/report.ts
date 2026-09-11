import { MASTER_VERSION, gradeAt, RuleBasedReportGenerator, type CompletedAssessmentData } from '@papamo/shared';

import type { CoachRecord, Env } from '../env';
import type { ChildRow } from './types';

export function getReportGenerator(env: Env) {
  if (env.REPORT_GENERATOR === 'rule_v1') {
    return new RuleBasedReportGenerator();
  }
  throw new Error(`未知のレポート生成器です: ${env.REPORT_GENERATOR}`);
}

function parseGoals(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((goal) => typeof goal === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export async function generateReport(input: {
  env: Env;
  child: ChildRow;
  coach: CoachRecord;
  assessment: { seqNo: number; assessedOn: string; unlockExt: boolean; data: CompletedAssessmentData };
  previous?: { seqNo: number; assessedOn: string; unlockExt: boolean; data: CompletedAssessmentData };
  generatedAt: string;
}) {
  const grade = gradeAt(
    { gradeCode: input.child.gradeCode as Parameters<typeof gradeAt>[0]['gradeCode'], gradeBaseYear: input.child.gradeBaseYear },
    input.assessment.assessedOn,
  );
  const generator = getReportGenerator(input.env);
  return generator.generate({
    child: {
      name: input.child.name,
      honorific: input.child.honorific as 'kun' | 'chan' | 'san',
      grade: grade.name,
      ageHint: grade.ageHint,
      ageGroup: grade.ageGroup,
      goals: parseGoals(input.child.goals),
    },
    coach: { displayName: input.coach.displayName ?? input.coach.email },
    assessment: input.assessment,
    previous: input.previous,
    master: { version: MASTER_VERSION },
    generatedAt: input.generatedAt,
  });
}
