import {
  bandOf,
  CORE_EXERCISE_KEYS,
  exerciseByKey,
  EXT_EXERCISE_KEYS,
  ladderLabel,
  PPI_QUESTIONS,
  PLANS,
  type ExerciseKey,
  type PpiKey,
  type PlanKey,
} from '../master';
import { nextDueDate } from '../domain/date';
import type { ReportContent, ReportGenerator, ReportInput } from './types';

function activeKeys(unlockExt: boolean): ExerciseKey[] {
  return unlockExt ? [...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS] : [...CORE_EXERCISE_KEYS];
}

function ppiSnapshot(input: ReportInput, previous = false): Record<PpiKey, number> {
  const data = previous ? input.previous?.data : input.assessment.data;
  if (!data) {
    throw new Error('PPI の比較対象がありません。');
  }

  return Object.fromEntries(
    PPI_QUESTIONS.map(({ key }) => [key, data.ppi[key]]),
  ) as Record<PpiKey, number>;
}

export class RuleBasedReportGenerator implements ReportGenerator {
  readonly id = 'rule_v1';

  async generate(input: ReportInput): Promise<ReportContent> {
    const keys = activeKeys(input.assessment.unlockExt);
    const levels = keys.map((key) => ({
      key,
      lv: input.assessment.data.lv[key] ?? 0,
      previous: input.previous?.data.lv[key],
      order: keys.indexOf(key),
    }));
    const sorted = [...levels].sort(
      (a, b) => a.lv - b.lv || a.order - b.order,
    );
    const priorityCount = Math.min(3, Math.max(1, sorted.length - 1));
    const priorityLevels = sorted.slice(0, priorityCount);
    const strengthLevels = sorted.slice(priorityCount).sort(
      (a, b) => b.lv - a.lv || a.order - b.order,
    );
    const lowestKey: ExerciseKey = sorted[0]?.key ?? CORE_EXERCISE_KEYS[0]!;
    const reportLevels: ReportContent['levels'] = levels.map((level) => {
      const delta = level.previous === undefined ? undefined : level.lv - level.previous;
      return {
        key: level.key,
        lv: level.lv,
        ...(level.previous === undefined ? {} : { prevLv: level.previous }),
        ...(delta === undefined ? {} : { delta }),
        band: bandOf(level.key, level.lv).name,
        ladderLabel: ladderLabel(level.key, level.lv),
      };
    });

    const priorities = priorityLevels.map((level) => {
      const exercise = exerciseByKey(level.key);
      return {
        key: level.key,
        parentName: exercise.parentName,
        lv: level.lv,
        grow: exercise.grow,
        build: [...exercise.build],
      };
    });
    const strengths = strengthLevels.map((level) => ({
      key: level.key,
      parentName: exerciseByKey(level.key).parentName,
      lv: level.lv,
    }));

    const upcomingExercises = (input.assessment.unlockExt ? [] : EXT_EXERCISE_KEYS).map((key) => {
        const exercise = exerciseByKey(key);
        return {
          key,
          name: exercise.name,
          parentName: exercise.parentName,
          teaser: 'teaser' in exercise ? exercise.teaser : '',
        };
      });

    const previousTroubles = input.previous?.data.troubles ?? [];
    const currentTroubles = [...input.assessment.data.troubles];
    const changes3m = input.previous
      ? priorityLevels.concat(strengthLevels)
          .filter((level) => (level.previous ?? level.lv) < level.lv)
          .flatMap((level) => exerciseByKey(level.key).changes3m.slice(0, 2))
          .slice(0, 6)
      : undefined;
    const ppiPrevious = input.previous ? ppiSnapshot(input, true) : undefined;
    const planKey = input.assessment.data.plan as PlanKey;
    const plan = planKey
      ? { key: planKey, ...PLANS[planKey] }
      : null;

    const outlook = priorities
      .slice(0, 2)
      .flatMap(({ key }) => exerciseByKey(key).changes3m.slice(0, 2));

    return {
      kind: input.previous ? 'comparison' : 'first',
      generator: this.id,
      masterVersion: input.master.version,
      generatedAt: input.generatedAt,
      header: {
        childName: input.child.name,
        honorific: input.child.honorific,
        grade: input.child.grade,
        ageHint: input.child.ageHint,
        ...(input.child.joinedOn ? { joinedOn: input.child.joinedOn } : {}),
        seqNo: input.assessment.seqNo,
        assessedOn: input.assessment.assessedOn,
        ...(input.previous ? { prevAssessedOn: input.previous.assessedOn } : {}),
        coachName: input.coach.displayName,
      },
      levels: reportLevels,
      upcomingExercises,
      priorities,
      strengths,
      ...(changes3m ? { changes3m } : {}),
      troubles: {
        current: currentTroubles,
        ...(input.previous
          ? {
              gone: previousTroubles.filter((trouble) => !currentTroubles.includes(trouble)),
              stayed: currentTroubles.filter((trouble) => previousTroubles.includes(trouble)),
              added: currentTroubles.filter((trouble) => !previousTroubles.includes(trouble)),
            }
          : {}),
      },
      link: {
        lowestKey,
        text: `チェックされた困りごとの多くは、${exerciseByKey(lowestKey).parentName}（${exerciseByKey(lowestKey).name} Lv${input.assessment.data.lv[lowestKey] ?? 0}）がまだ育っている途中であることと一致しています。${exerciseByKey(lowestKey).grow}`,
      },
      ppi: {
        current: ppiSnapshot(input),
        ...(ppiPrevious ? { previous: ppiPrevious } : {}),
        note: input.assessment.data.ppiNote,
      },
      plan,
      outlook,
      nextDue: nextDueDate(input.assessment.assessedOn),
      coach: {
        strategies: priorityLevels.map((level) => {
          const nextLv = Math.min(20, Math.max(1, level.lv + 1));
          return {
            key: level.key,
            lv: level.lv,
            band: bandOf(level.key, level.lv).name,
            nextLv,
            nextLabel: ladderLabel(level.key, nextLv),
            errs: [...(input.assessment.data.errs[level.key] ?? [])],
          };
        }),
        memo: input.assessment.data.memo,
      },
    };
  }
}
