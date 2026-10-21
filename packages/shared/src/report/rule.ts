import {
  activeExerciseKeys,
  AREA_MENU_PLANS,
  bandName,
  bandOf,
  COACH_CAUTIONS,
  CORE_EXERCISE_KEYS,
  DOMAIN_MENUS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  EXERCISE_MENUS,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  exerciseByKey,
  GRADE_OUTLOOK,
  GRADES,
  GROWTH_SIGNS,
  isMeasured,
  ladderLabel,
  levelValue,
  MIN_EXERCISE_LEVEL,
  NEURO_DOMAINS,
  PYRAMID_ELEMENT_COPY,
  PYRAMID_TIERS,
  pyramidTierLabel,
  RISK_NOTES,
  TROUBLE_CATEGORIES,
  troubleDomainOf,
  TUNING_NOTES,
  WANT_ITEMS,
  wantToGoalText,
  type CoachCautionKey,
  type EngagementKey,
  type ExerciseKey,
  type PyramidItem,
  type TuningKey,
} from '../master';
import { addMonthsClamped, nextDueDate } from '../domain/date';
import { goalsByImportance } from './goal-order';
import type {
  CoachFocusRole,
  DomainVerdict,
  PyramidSource,
  ReportAreaMenu,
  ReportContent,
  ReportDomainHit,
  ReportGenerator,
  ReportInput,
} from './types';

/** 種目の定義順。同 Lv のタイブレークに使う（AGENTS.md §7.2）。 */
const EXERCISE_ORDER = EXERCISES.map((exercise) => exercise.key);

const VERDICT_ORDER: DomainVerdict[] = ['強く一致', '一致', '未測定', '不一致'];

const COACH_FOCUS_ROLES: CoachFocusRole[] = ['main', 'next', 'keep'];

/** 当てるメニューの件数。主軸を厚く、次点・維持は絞る（モックの配分）。 */
const FOCUS_MENU_COUNT: Record<CoachFocusRole, { month3: number; month6: number }> = {
  main: { month3: 5, month6: 5 },
  next: { month3: 2, month6: 2 },
  keep: { month3: 1, month6: 2 },
};

/** 種目ごとの基盤（①②③）と「最重要にすべき領域」、コーチ向けの領域ごとのメニューに出す数。 */
const FOUNDATION_COUNT = 3;
const FOCUS_AREA_COUNT = 3;
const AREA_MENU_COUNT = 3;

/** 最重要にすべき領域を選ぶ順（暫定）。目標と測定の両方に出た要素を先にする。 */
const PYRAMID_SOURCE_ORDER: PyramidSource[] = ['both', 'measured', 'goal'];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** その種目を支えるピラミッドの要素。根っこ（いちばん下の段）を先にする。 */
function foundationsOf(key: ExerciseKey): string[] {
  const exercise = exerciseByKey(key);
  return unique([exercise.pyramidRoot, ...exercise.pyramidRelated]).slice(0, FOUNDATION_COUNT);
}

/**
 * 目標の達成のために優先する領域。ピラミッドの目標由来も、目標欄の文言からだけ決める。
 * 【暫定】目標の文言のキーワードで判定する方式に差し替えるまで、候補（できるようになりたいこと）から入れた仮の文言と
 * 一致したときだけ、その項目を主に支える種目の基盤を返す。
 */
function goalAreasOf(text: string): string[] {
  const want = WANT_ITEMS.find((item) => wantToGoalText(item.text) === text.trim());
  return want ? foundationsOf(want.axis) : [];
}

/**
 * 領域に当てるメニュー。仮マスタ（AREA_MENU_PLANS）に無い領域は、その領域にあたる照合の追加メニューか、
 * その領域を土台に持つ種目のメニューから名前だけを出す（属性は分からない）。
 */
function areaMenusOf(item: string): ReportAreaMenu[] {
  const plan = AREA_MENU_PLANS[item as PyramidItem];
  if (plan?.menus) return plan.menus.slice(0, AREA_MENU_COUNT).map((menu) => ({ ...menu }));
  const domain = NEURO_DOMAINS.find((candidate) => candidate.pyramid === item);
  const exercise = EXERCISES.find((candidate) => foundationsOf(candidate.key).includes(item));
  const names = domain ? DOMAIN_MENUS[domain.id] ?? [] : exercise ? EXERCISE_MENUS[exercise.key].base : [];
  return names.slice(0, AREA_MENU_COUNT).map((name) => ({ name }));
}

/** 学年が上がったときの見通し。いまの学年より先の時期だけを、何学年先かとともに返す。 */
function gradeOutlookOf(gradeCode: ReportInput['child']['gradeCode']): ReportContent['gradeOutlook'] {
  const current = GRADES.findIndex((grade) => grade.code === gradeCode);
  if (current < 0) return null;
  const milestones = GRADE_OUTLOOK.milestones.flatMap(({ label, theme, gradeCode: milestoneCode, yearsAfter }) => {
    const gradesAhead = GRADES.findIndex((grade) => grade.code === milestoneCode) + yearsAfter - current;
    return gradesAhead >= 1 ? [{ label, theme, gradesAhead }] : [];
  });
  return milestones.length ? { milestones, summary: GRADE_OUTLOOK.summary } : null;
}

export class RuleBasedReportGenerator implements ReportGenerator {
  readonly id = 'rule_v1';

  async generate(input: ReportInput): Promise<ReportContent> {
    const { data } = input.assessment;
    const keys = activeExerciseKeys(input.assessment.unlockExt);
    const levelOf = (key: ExerciseKey) => data.lv[key];

    // --- 到達レベルの並べ替え（モックの analyze() 相当） ---
    // Lv0 も到達の一つとして扱い、その回に記録した種目をすべて優先テーマ・強みの対象にする。
    const measuredKeys = keys.filter((key) => isMeasured(levelOf(key)));
    const sorted = [...measuredKeys].sort((a, b) => (
      levelValue(levelOf(a)) - levelValue(levelOf(b))
      || EXERCISE_ORDER.indexOf(a) - EXERCISE_ORDER.indexOf(b)
    ));
    const lowestKey: ExerciseKey = sorted[0] ?? keys[0] ?? CORE_EXERCISE_KEYS[0]!;
    const rank = new Map(sorted.map((key, index) => [key, index]));
    // 下位半分かつ Lv10 以下なら「困りごとの背景」として弱い土台とみなす。
    const bottomCount = Math.max(1, Math.ceil(sorted.length / 2));
    const isWeak = (key: ExerciseKey) => {
      const level = levelOf(key);
      return isMeasured(level) && (rank.get(key) ?? Infinity) < bottomCount && (level ?? 0) <= 10;
    };

    const priorityCount = Math.min(3, Math.max(1, sorted.length - 1));
    const priorityKeys = sorted.slice(0, priorityCount);
    // 強みは Lv 降順。同 Lv は種目定義順で並べる（暗黙の安定ソートに頼らない）。
    const strengthKeys = sorted.slice(priorityCount).sort((a, b) => (
      levelValue(levelOf(b)) - levelValue(levelOf(a))
      || EXERCISE_ORDER.indexOf(a) - EXERCISE_ORDER.indexOf(b)
    ));
    // 3か月・6か月の見通しは優先テーマの上位2つから組み立てる。
    const growKeys = unique(priorityKeys.slice(0, 2));

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

    // 力加減の基準（固有覚）の所見が出た種目。
    const proprioceptionKeys = keys.filter((key) => {
      const selected = data.observations[key] ?? [];
      return exerciseByKey(key).observations.some(
        (observation) => 'proprioception' in observation
          && observation.proprioception
          && selected.includes(observation.text),
      );
    });
    const proprioceptionNote = proprioceptionKeys.length > 0;

    const priorities = priorityKeys.map((key) => {
      const exercise = exerciseByKey(key);
      return {
        key,
        parentName: exercise.parentName,
        lv: levelOf(key) ?? 0,
        maxLv: exercise.maxLevel,
        grow: exercise.grow,
        build: [...exercise.build],
      };
    });
    const strengths = strengthKeys.map((key) => {
      const exercise = exerciseByKey(key);
      return {
        key,
        parentName: exercise.parentName,
        lv: levelOf(key) ?? 0,
        maxLv: exercise.maxLevel,
      };
    });

    // 種目ごとの「できている力／次に高めたい力」（保護者向け1枚目）。
    // 【暫定】Lv に応じた文言のマスタが届くまで、種目ごとの固定の文言（概要と、育てる力の1つ目）を出す。
    const abilities = keys.map((key) => {
      const exercise = exerciseByKey(key);
      return { key, can: exercise.summary, next: exercise.build[0] ?? '', foundations: foundationsOf(key) };
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

    // --- 取り組みの発達 ---
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

    // --- お困りごと × 実測の照合 ---
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

    const domainHits: ReportDomainHit[] = NEURO_DOMAINS
      .flatMap((domain) => {
        const troubles = currentTroubles.filter((text) => troubleDomainOf(text) === domain.id);
        if (!troubles.length) return [];
        const priorityLevel = levelOf(domain.priorityKey);
        const weak = isWeak(domain.priorityKey);
        // 帯の条件（VORなど）に届いていない、あるいは主軸種目が未開放で記録がなければ判断できない。
        const bandUnreached = domain.bandCheck
          ? bandOf(domain.bandCheck.key, levelOf(domain.bandCheck.key) ?? 0)?.name !== domain.bandCheck.band
          : false;
        const unmeasuredPriority = !isMeasured(priorityLevel);
        let verdict: DomainVerdict;
        if (weak && (priorityLevel ?? 0) <= 6) verdict = '強く一致';
        else if (weak) verdict = '一致';
        else if (bandUnreached || unmeasuredPriority) verdict = '未測定';
        else verdict = '不一致';
        const exercise = exerciseByKey(domain.priorityKey);
        return [{
          id: domain.id,
          title: domain.title,
          parentLabel: domain.parentLabel,
          parentText: domain.parentText,
          pyramid: domain.pyramid,
          troubles,
          verdict,
          priorityKey: domain.priorityKey,
          priorityName: exercise.name,
          priorityParentName: exercise.parentName,
          priorityLv: priorityLevel ?? 0,
          priorityMaxLv: exercise.maxLevel,
          priorityMeasured: isMeasured(priorityLevel),
        }];
      })
      .sort((a, b) => VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict));
    const rootHit = domainHits.find((hit) => hit.verdict === '強く一致')
      ?? domainHits.find((hit) => hit.verdict === '一致')
      ?? null;

    // --- 育ちのピラミッド ---
    const lowestExercise = exerciseByKey(lowestKey);
    const pyramidRoot = lowestExercise.pyramidRoot;
    const pyramidRelated = [...lowestExercise.pyramidRelated];
    const highlighted = unique([
      pyramidRoot,
      ...pyramidRelated,
      ...domainHits.map((hit) => hit.pyramid),
    ]);

    // --- 目標（COPM） ---
    const previousCopm = new Map(
      (input.previous?.data.copm ?? []).map((goal) => [goal.text, goal]),
    );
    const copm = data.copm.map(({ baseline, ...goal }) => {
      const previousGoal = previousCopm.get(goal.text);
      const areas = goalAreasOf(goal.text);
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

    // --- ピラミッドの2系統と、最重要にすべき領域 ---
    // 【暫定】測定・お困りごと由来＝いちばん低い種目の要素と照合した領域（highlighted）。
    // 目標由来＝目標の「優先する領域」（目標欄の文言だけから決める）。
    const goalItems = unique(copm.flatMap((goal) => goal.areas));
    const sourceOf = (item: string): PyramidSource | null => {
      const goal = goalItems.includes(item);
      const measured = highlighted.includes(item);
      if (goal && measured) return 'both';
      if (measured) return 'measured';
      return goal ? 'goal' : null;
    };
    const copmByImportance = goalsByImportance(copm);
    const pyramidCells = PYRAMID_TIERS.flatMap((row) => row.items.map((item, position) => ({ item, tier: row.tier, position })));
    const byPosition = (first: { tier: number; position: number }, second: { tier: number; position: number }) => (
      first.tier - second.tier || first.position - second.position
    );
    const focusAreas = pyramidCells
      .flatMap((cell) => {
        const source = sourceOf(cell.item);
        return source ? [{ ...cell, source }] : [];
      })
      .sort((first, second) => (
        PYRAMID_SOURCE_ORDER.indexOf(first.source) - PYRAMID_SOURCE_ORDER.indexOf(second.source) || byPosition(first, second)
      ))
      .slice(0, FOCUS_AREA_COUNT)
      .sort(byPosition)
      .map(({ item, tier, source }) => ({
        item,
        tier,
        source,
        ...PYRAMID_ELEMENT_COPY[item as PyramidItem],
        goalText: copmByImportance.find((goal) => goal.areas.includes(item))?.text ?? null,
      }));

    // コーチ向けの領域ごとのメニュー。【暫定】目標の「優先する領域」だけを、ピラミッドの下の段から並べる
    // （測定・お困りごとだけで色が付いた領域は出さない。変更依頼 2026-10-19 の仕様）。
    const areaMenus = pyramidCells
      .filter((cell) => goalItems.includes(cell.item))
      .map(({ item, tier }) => ({
        item,
        tier,
        goals: copmByImportance.filter((goal) => goal.areas.includes(item)).map((goal) => goal.text),
        aim: AREA_MENU_PLANS[item as PyramidItem]?.aim ?? '',
        menus: areaMenusOf(item),
      }));

    // --- 3か月・6か月の見通し ---
    const roadmap = {
      month3Build: growKeys.flatMap((key) => exerciseByKey(key).build).slice(0, 5),
      month3Changes: growKeys.flatMap((key) => exerciseByKey(key).changes3m).slice(0, 5),
      month6Links: growKeys.flatMap((key) => exerciseByKey(key).links).slice(0, 4),
      month6Changes: growKeys.flatMap((key) => exerciseByKey(key).changes6m).slice(0, 4),
    };
    const watchPoints = growKeys.flatMap((key) => exerciseByKey(key).changes3m).slice(0, 4);

    const previousTroubles = input.previous?.data.troubles ?? [];
    const changes3m = input.previous
      ? sorted
          .filter((key) => levelValue(levelOf(key)) > levelValue(input.previous?.data.lv[key]))
          .flatMap((key) => exerciseByKey(key).changes3m.slice(0, 2))
          .slice(0, 6)
      : undefined;
    const gradeOutlook = gradeOutlookOf(input.child.gradeCode);
    const tuningKeys: TuningKey[] = ['priorityRule', 'abilityCopy', 'focusAreas', 'pyramidSources', 'areaMenus'];
    if (input.previous) tuningKeys.push('comparison');
    if (engagement.some((axis) => axis.prevLevel !== undefined)) tuningKeys.push('engagementDelta');
    if (copm.length) tuningKeys.push('goalAreas');
    if (copm.some((goal) => goal.previous)) tuningKeys.push('copmDelta');
    if (domainHits.length) tuningKeys.push('riskCopy');
    if (gradeOutlook) tuningKeys.push('gradeOutlook');

    // --- コーチ向け（areaMenus はレポート先頭の「方針とメニューの方向性」に使う。plan・copmFocus は
    // 旧メニュー提案の表示をやめたが、ロジックの整理が済むまで残す） ---
    // 主軸＝最小Lv／次点＝2番目／維持＝最大Lv（モックの low / mid / high）。
    const coachFocus = unique([sorted[0], sorted[1], sorted.at(-1)].filter((key): key is ExerciseKey => key !== undefined))
      .map((key, index) => ({ key, role: COACH_FOCUS_ROLES[index]! }));
    const toCaution = (key: CoachCautionKey, exercises: ExerciseKey[]) => ({ key, ...COACH_CAUTIONS[key], exercises });
    const coachCautions = [
      { key: 'levelZero' as const, exercises: keys.filter((key) => levelOf(key) === MIN_EXERCISE_LEVEL) },
      { key: 'condition' as const, exercises: conditionNotes.map((note) => note.key) },
      { key: 'saccWorkingMemory' as const, exercises: keys.filter((key) => key === 'sacc' && bandOf(key, levelOf(key) ?? 0)?.name === 'WM・逆順') },
      { key: 'inhiEarly' as const, exercises: keys.filter((key) => key === 'inhi' && isMeasured(levelOf(key)) && (levelOf(key) ?? 0) <= 6) },
      { key: 'proprioception' as const, exercises: proprioceptionKeys },
      { key: 'postVor' as const, exercises: keys.filter((key) => key === 'post' && bandOf(key, levelOf(key) ?? 0)?.name === 'VOR') },
    ]
      .filter(({ exercises }) => exercises.length > 0)
      .map(({ key, exercises }) => toCaution(key, exercises))
      .concat(toCaution('parentBelief', []));
    // 重要度が同じなら入力順で先の目標を採る。
    const mostImportantGoal = data.copm.reduce<(typeof data.copm)[number] | null>(
      (best, goal) => (best === null || goal.importance > best.importance ? goal : best),
      null,
    );

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
      priorities,
      strengths,
      engagement,
      ...(changes3m ? { changes3m } : {}),
      troubles: {
        current: currentTroubles,
        byCategory: troublesByCategory,
        ...(input.previous
          ? {
              gone: previousTroubles.filter((trouble) => !currentTroubles.includes(trouble)),
              stayed: currentTroubles.filter((trouble) => previousTroubles.includes(trouble)),
              added: currentTroubles.filter((trouble) => !previousTroubles.includes(trouble)),
            }
          : {}),
      },
      domainHits,
      rootDomain: rootHit
        ? {
            id: rootHit.id,
            title: rootHit.title,
            parentLabel: rootHit.parentLabel,
            parentText: rootHit.parentText,
          }
        : null,
      proprioceptionNote,
      risks: RISK_NOTES.map((note) => ({ ...note })),
      gradeOutlook,
      pyramid: {
        rows: PYRAMID_TIERS.map((row) => ({ tier: row.tier, items: [...row.items] })),
        highlighted,
        goalItems,
        root: pyramidRoot,
        rootTierLabel: pyramidTierLabel(pyramidRoot),
        related: pyramidRelated,
        sourceKey: lowestKey,
      },
      focusAreas,
      link: {
        lowestKey,
        text: `チェックされた困りごとの多くは、${lowestExercise.parentName}（${lowestExercise.name} Lv${levelValue(levelOf(lowestKey))}／${lowestExercise.maxLevel}）がまだ育っている途中であることと一致しています。${lowestExercise.grow}`,
      },
      roadmap,
      copm,
      growthSigns: [...GROWTH_SIGNS],
      watchPoints,
      nextDue: nextDueDate(input.assessment.assessedOn),
      nextReview: addMonthsClamped(input.assessment.assessedOn, 6),
      tuning: tuningKeys.map((key) => ({ key, ...TUNING_NOTES[key] })),
      coach: {
        strategies: priorityKeys.map((key) => {
          const exercise = exerciseByKey(key);
          const lv = levelOf(key) ?? 0;
          const nextLv = Math.min(exercise.maxLevel, lv + 1);
          return {
            key,
            lv,
            band: bandName(key, lv),
            nextLv,
            nextLabel: ladderLabel(key, nextLv),
            observations: [...(data.observations[key] ?? [])],
            note: data.observationNotes[key] ?? '',
          };
        }),
        plan: {
          focus: coachFocus.map(({ key, role }) => {
            const exercise = exerciseByKey(key);
            const menus = EXERCISE_MENUS[key];
            return {
              key,
              role,
              lv: levelOf(key) ?? 0,
              maxLv: exercise.maxLevel,
              month3: menus.base.slice(0, FOCUS_MENU_COUNT[role].month3),
              month6: menus.dev.slice(0, FOCUS_MENU_COUNT[role].month6),
            };
          }),
          domainMenus: domainHits
            .filter((hit) => hit.verdict === '強く一致' || hit.verdict === '一致')
            .slice(0, 2)
            .map((hit) => ({
              id: hit.id,
              title: hit.title,
              region: NEURO_DOMAINS.find((domain) => domain.id === hit.id)?.region ?? '',
              menus: (DOMAIN_MENUS[hit.id] ?? []).slice(0, 3),
            })),
        },
        exerciseNotes: keys.map((key) => ({
          key,
          lv: levelOf(key) ?? 0,
          observations: [...(data.observations[key] ?? [])],
          conditions: conditionsOf(key),
          note: data.observationNotes[key] ?? '',
        })),
        cautions: coachCautions,
        copmFocus: {
          mostImportant: mostImportantGoal ? { text: mostImportantGoal.text, importance: mostImportantGoal.importance } : null,
          lowSatisfaction: data.copm
            .filter((goal) => goal.performance >= 6 && goal.satisfaction <= 4)
            .map((goal) => goal.text),
        },
        areaMenus,
      },
    };
  }
}

