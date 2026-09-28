import {
  MASTER_VERSION,
  RuleBasedReportGenerator,
  type CompletedAssessmentData,
  type Honorific,
} from '@papamo/shared';

import type { CoachRecord, Env } from '../env';
import { gradeOf, type ChildRow } from './child-row';

export function getReportGenerator(env: Env) {
  if (env.REPORT_GENERATOR === 'rule_v1') {
    return new RuleBasedReportGenerator();
  }
  throw new Error(`未知のレポート生成器です: ${env.REPORT_GENERATOR}`);
}

export async function generateReport(input: {
  env: Env;
  child: ChildRow;
  coach: CoachRecord;
  assessment: { seqNo: number; assessedOn: string; unlockExt: boolean; data: CompletedAssessmentData };
  previous?: { seqNo: number; assessedOn: string; unlockExt: boolean; data: CompletedAssessmentData };
  generatedAt: string;
}) {
  const grade = gradeOf(input.child, input.assessment.assessedOn);
  const generator = getReportGenerator(input.env);
  return generator.generate({
    child: {
      name: input.child.name,
      honorific: input.child.honorific as Honorific,
      grade: grade.name,
      ageHint: grade.ageHint,
      ageGroup: grade.ageGroup,
      joinedMonth: input.child.joinedMonth,
    },
    coach: { displayName: input.coach.displayName ?? input.coach.email },
    assessment: input.assessment,
    previous: input.previous,
    master: { version: MASTER_VERSION },
    generatedAt: input.generatedAt,
  });
}
