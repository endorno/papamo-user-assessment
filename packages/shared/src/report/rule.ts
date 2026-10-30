import {
  activeExerciseKeys,
  AREA_MENU_AIMS,
  bandName,
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  exerciseByKey,
  isMeasured,
  ladderLabel,
  levelValue,
  PYRAMID_BLOCK_COPY,
  PYRAMID_BLOCKS,
  PYRAMID_TIERS,
  TROUBLE_CATEGORIES,
  TUNING_NOTES,
  type CatalogMenu,
  type EngagementKey,
  type ExerciseKey,
  type PyramidBlock,
  type TuningKey,
} from '../master';
import { addMonthsClamped, nextDueDate } from '../domain/date';
import { isNextCopmGoal, previousCopmGoal } from '../schema/assessment';
import { goalsByImportance } from './goal-order';
import {
  areaMenusOf,
  bandStateOf,
  concernStagesOf,
  focusBlocksOf,
  goalBlocksOf,
  issueBlocksOf,
  menuAudienceOf,
  menuLevelOf,
  rankedBlocksOf,
  riskEvidenceOf,
  troubleBackgroundsOf,
} from './logic';
import type { ReportAreaMenu, ReportContent, ReportGenerator, ReportInput } from './types';

/** 種目の定義順。同 Lv のタイブレークに使う（AGENTS.md §7.2）。 */
const EXERCISE_ORDER = EXERCISES.map((exercise) => exercise.key);

/** コーチ向けの領域ごとのメニューに出す1件。マスタの id・系列・対象区分は出さない。 */
function reportAreaMenuOf({ name, difficulty, form, equipment, parentBurden, category }: CatalogMenu): ReportAreaMenu {
  return { name, difficulty, form, equipment, ...(parentBurden ? { parentBurden } : {}), category };
}

export class RuleBasedReportGenerator implements ReportGenerator {
  readonly id = 'rule_v1';

  async generate(input: ReportInput): Promise<ReportContent> {
    const { data } = input.assessment;
    const { gradeCode } = input.child;
    const keys = activeExerciseKeys(input.assessment.unlockExt);
    const levelOf = (key: ExerciseKey) => data.lv[key];
    // その回に記録した種目（Lv0 を含む）。未開放の4・5種目目は含めない。
    const measured = keys.flatMap((key) => {
      const lv = levelOf(key);
      return isMeasured(lv) ? [{ key, lv: lv ?? 0 }] : [];
    });

    const levels: ReportContent['levels'] = keys.map((key) => {
      const exercise = exerciseByKey(key);
      const lv = levelOf(key) ?? 0;
      const prevLv = input.previous?.data.lv[key];
      const delta = prevLv === undefined ? undefined : lv - prevLv;
      return {
        key,
        name: exercise.name,
        parentName: exercise.parentName,
        lv,
        maxLv: exercise.maxLevel,
        ...(prevLv === undefined ? {} : { prevLv }),
        ...(delta === undefined ? {} : { delta }),
        band: bandName(key, lv),
        ladderLabel: ladderLabel(key, lv),
      };
    });

    // 種目ごとの「できている力／次に高めたい力」（M1・M2）。
    const abilities = measured.map(({ key, lv }) => {
      const { passed, current, blocks } = bandStateOf(key, lv);
      return { key, can: passed?.ability ?? null, next: current?.ability ?? null, blocks };
    });

    // 当日の様子（指示理解の難しさなど）は測定条件の注記として別に出す。
    const conditionsOf = (key: ExerciseKey) => {
      const selected = data.observations[key] ?? [];
      return exerciseByKey(key).observations
        .filter((observation) => 'condition' in observation && observation.condition)
        .map((observation) => observation.text)
        .filter((text) => selected.includes(text));
    };
    const conditionNotes = keys.flatMap((key) => {
      const notes = conditionsOf(key);
      return notes.length ? [{ key, name: exerciseByKey(key).name, notes }] : [];
    });

    const upcomingExercises = (input.assessment.unlockExt ? [] : EXT_EXERCISE_KEYS).map((key) => {
      const exercise = exerciseByKey(key);
      return {
        key,
        name: exercise.name,
        parentName: exercise.parentName,
        about: exercise.about,
      };
    });

    // --- 取り組みの発達（入力そのまま。判定には使わない） ---
    const engagement = ENGAGEMENT_AXES.flatMap((axis) => {
      const level = data.engagement[axis.key as EngagementKey];
      if (level === undefined) return [];
      const prevLevel = input.previous?.data.engagement[axis.key as EngagementKey];
      return [{
        key: axis.key,
        title: axis.title,
        subtitle: axis.subtitle,
        level,
        levelCount: ENGAGEMENT_LEVEL_COUNT,
        label: axis.levels[level] ?? '',
        ...(prevLevel === undefined ? {} : { prevLevel, delta: level - prevLevel }),
      }];
    });

    // --- お困りごと ---
    const currentTroubles = [...data.troubles];
    const troublesByCategory = TROUBLE_CATEGORIES
      .map((category) => ({
        id: category.id,
        icon: category.icon,
        title: category.title,
        items: category.items
          .map((item) => item.text)
          .filter((text) => currentTroubles.includes(text)),
      }))
      .filter((category) => category.items.length > 0);

    // --- 目標（COPM）と、目標ごとの優先する領域（M5）。次の3か月の目標だけがピラミッドに効く ---
    const copm = data.copm.map(({ baseline, ...goal }) => {
      const previousGoal = previousCopmGoal(goal, input.previous?.data.copm ?? []);
      const areas = isNextCopmGoal(goal) ? goalBlocksOf(goal.text, goal.memo) : [];
      // 前回の回が無い初回は、ツール導入前（Excel）の採点を前回として並べる（既存会員の目標の変化を見せるため）。
      const previous = previousGoal
        ? {
            performance: previousGoal.performance,
            satisfaction: previousGoal.satisfaction,
            importance: previousGoal.importance,
          }
        : baseline && { ...baseline };
      return {
        ...goal,
        areas,
        ...(previous
          ? {
              previous,
              performanceDelta: goal.performance - previous.performance,
              satisfactionDelta: goal.satisfaction - previous.satisfaction,
            }
          : {}),
      };
    });
    const copmByImportance = goalsByImportance(copm);
    const goalsOf = (block: PyramidBlock) => copmByImportance.filter((goal) => goal.areas.includes(block)).map((goal) => goal.text);

    // --- 発達ピラミッドの2系統（M4・M5）と、最重要にすべき領域 ---
    const goalBlocks = PYRAMID_BLOCKS.filter((block) => copm.some((goal) => goal.areas.includes(block)));
    const issueBlocks = issueBlocksOf(measured, gradeCode, currentTroubles);
    const focusAreas = focusBlocksOf(goalBlocks, issueBlocks).map(({ block, tier, source }) => ({
      block,
      tier,
      source,
      ...PYRAMID_BLOCK_COPY[block],
      goals: goalsOf(block),
    }));
    // メニューは学年の対象区分と、到達率の中央値から決めた難易度で選ぶ（仕様の「ブロック・対象区分・難易度」）。
    const menuAudience = menuAudienceOf(gradeCode);
    const menuLevel = menuLevelOf(measured);
    const areaMenus = rankedBlocksOf(goalBlocks, issueBlocks).map(({ block, tier, source }) => ({
      block,
      tier,
      source,
      goals: goalsOf(block),
      aim: AREA_MENU_AIMS[block],
      menus: areaMenusOf(block, menuAudience, menuLevel).map(reportAreaMenuOf),
    }));

    // --- 今の困りごとが続いた場合に起こりうること（M3・M6）。裏づけも懸念もなければ出さない ---
    const evidence = riskEvidenceOf(measured, gradeCode);
    const stages = concernStagesOf(gradeCode, currentTroubles);
    const risks = evidence.length || stages.length ? { evidence, stages } : null;

    const changes3m = input.previous
      ? [...measured]
          .sort((a, b) => a.lv - b.lv || EXERCISE_ORDER.indexOf(a.key) - EXERCISE_ORDER.indexOf(b.key))
          .filter(({ key, lv }) => lv > levelValue(input.previous?.data.lv[key]))
          .flatMap(({ key }) => exerciseByKey(key).changes3m.slice(0, 2))
          .slice(0, 6)
      : undefined;
    const tuningKeys: TuningKey[] = [];
    if (input.previous) tuningKeys.push('comparison');
    if (engagement.some((axis) => axis.prevLevel !== undefined)) tuningKeys.push('engagementDelta');
    if (copm.some((goal) => goal.previous)) tuningKeys.push('copmDelta');
    if (areaMenus.length) tuningKeys.push('areaMenus');

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
        joinedMonth: input.child.joinedMonth,
        seqNo: input.assessment.seqNo,
        assessedOn: input.assessment.assessedOn,
        ...(input.previous ? { prevAssessedOn: input.previous.assessedOn } : {}),
        coachName: input.coach.displayName,
      },
      levels,
      abilities,
      conditionNotes,
      upcomingExercises,
      engagement,
      ...(changes3m ? { changes3m } : {}),
      troubles: { current: currentTroubles, byCategory: troublesByCategory },
      troubleBackgrounds: troubleBackgroundsOf(currentTroubles),
      risks,
      pyramid: {
        rows: PYRAMID_TIERS.map((row) => ({ tier: row.tier, items: [...row.items] })),
        goalBlocks,
        issueBlocks,
      },
      focusAreas,
      copm,
      nextDue: nextDueDate(input.assessment.assessedOn),
      nextReview: addMonthsClamped(input.assessment.assessedOn, 6),
      tuning: tuningKeys.map((key) => ({ key, ...TUNING_NOTES[key] })),
      coach: {
        // 観察された様子は、見えた動作のチェックか自由記入がある種目だけ出す。
        exerciseNotes: keys.flatMap((key) => {
          const observations = [...(data.observations[key] ?? [])];
          const note = data.observationNotes[key]?.trim() ?? '';
          if (!observations.length && !note) return [];
          return [{ key, lv: levelOf(key) ?? 0, observations, conditions: conditionsOf(key), note }];
        }),
        areaMenus,
      },
    };
  }
}
