import {
  activeExerciseKeys,
  bandName,
  bandOf,
  COACH_CAUTIONS,
  CORE_EXERCISE_KEYS,
  DOMAIN_MENUS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  ENVIRONMENT_SUPPORT_ITEMS,
  EXERCISE_MENUS,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  exerciseByKey,
  GROWTH_SIGNS,
  isMeasured,
  ladderLabel,
  levelValue,
  LEVEL_NOT_POSSIBLE,
  NEURO_DOMAINS,
  PPI_QUESTIONS,
  PYRAMID_TIERS,
  pyramidTierLabel,
  RISK_NOTES,
  TROUBLE_CATEGORIES,
  troubleDomainOf,
  TUNING_NOTES,
  wantById,
  wantShortText,
  type CoachCautionKey,
  type EngagementKey,
  type ExerciseKey,
  type PpiKey,
  type TuningKey,
} from '../master';
import { addMonthsClamped, nextDueDate } from '../domain/date';
import type {
  CoachFocusRole,
  DomainVerdict,
  ReportContent,
  ReportDomainHit,
  ReportGenerator,
  ReportInput,
  WantPackageStatus,
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

/** 支える種目が上限のこの割合以下なら「土台が届いていない」とみなす。 */
const WANT_FOUNDATION_RATIO = 0.3;

function ppiSnapshot(input: ReportInput, previous = false): Record<PpiKey, number> {
  const data = previous ? input.previous?.data : input.assessment.data;
  if (!data) {
    throw new Error('PPI の比較対象がありません。');
  }

  return Object.fromEntries(
    PPI_QUESTIONS.map(({ key }) => [key, data.ppi[key]]),
  ) as Record<PpiKey, number>;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class RuleBasedReportGenerator implements ReportGenerator {
  readonly id = 'rule_v1';

  async generate(input: ReportInput): Promise<ReportContent> {
    const { data } = input.assessment;
    const keys = activeExerciseKeys(input.assessment.unlockExt);
    const levelOf = (key: ExerciseKey) => data.lv[key];

    // --- 到達レベルの並べ替え（モックの analyze() 相当） ---
    // 実際に測れた種目（Lv1以上）だけを優先テーマ・強みの対象にする。
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
      const delta = prevLv === undefined ? undefined : levelValue(lv) - levelValue(prevLv);
      return {
        key,
        name: exercise.name,
        parentName: exercise.parentName,
        lv,
        maxLv: exercise.maxLevel,
        measured: isMeasured(lv),
        ...(prevLv === undefined ? {} : { prevLv }),
        ...(delta === undefined ? {} : { delta }),
        band: bandName(key, lv),
        ladderLabel: ladderLabel(key, lv),
      };
    });

    const unmeasured = EXERCISES
      .filter((exercise) => !isMeasured(levelOf(exercise.key)))
      .map((exercise) => ({
        key: exercise.key,
        name: exercise.name,
        upcoming: !exercise.core && !input.assessment.unlockExt,
        notPossible: levelOf(exercise.key) === LEVEL_NOT_POSSIBLE,
      }));

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

    const upcomingExercises = (input.assessment.unlockExt ? [] : EXT_EXERCISE_KEYS).map((key) => {
      const exercise = exerciseByKey(key);
      return {
        key,
        name: exercise.name,
        parentName: exercise.parentName,
        about: exercise.about,
      };
    });

    // --- 取り組みの発達と環境調整 ---
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
    const envSupports = ENVIRONMENT_SUPPORT_ITEMS
      .filter((item) => data.envSupports.includes(item.key))
      .reduce<ReportContent['envSupports']>((groups, item) => {
        const group = groups.find((candidate) => candidate.group === item.group);
        if (group) group.items.push(item.text);
        else groups.push({ group: item.group, items: [item.text] });
        return groups;
      }, []);

    // --- お困りごと × 実測の照合 ---
    const troubleCategories = TROUBLE_CATEGORIES[input.child.ageGroup];
    const currentTroubles = [...data.troubles];
    const troublesByCategory = troubleCategories
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
        // 帯の条件（VORなど）に届いていない、あるいは主軸種目を測れていなければ判断できない。
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

    // --- 目標（できるようになりたいこと・COPM） ---
    const wants = data.wants.flatMap((id) => {
      const want = wantById(id);
      return want
        ? [{
            id: want.id,
            group: want.group,
            icon: want.icon,
            text: want.text,
            short: wantShortText(want.text),
            menu: want.menu,
          }]
        : [];
    });
    const previousCopm = new Map(
      (input.previous?.data.copm ?? []).map((goal) => [goal.text, goal]),
    );
    const copm = data.copm.map((goal) => {
      const previous = previousCopm.get(goal.text);
      return {
        ...goal,
        ...(previous
          ? {
              previous: {
                performance: previous.performance,
                satisfaction: previous.satisfaction,
                importance: previous.importance,
              },
              performanceDelta: goal.performance - previous.performance,
              satisfactionDelta: goal.satisfaction - previous.satisfaction,
            }
          : {}),
      };
    });

    // --- 3か月・6か月の見通し ---
    const roadmap = {
      month3Build: growKeys.flatMap((key) => exerciseByKey(key).build).slice(0, 5),
      month3Changes: growKeys.flatMap((key) => exerciseByKey(key).changes3m).slice(0, 5),
      month6Links: growKeys.flatMap((key) => exerciseByKey(key).links).slice(0, 4),
      month6Changes: growKeys.flatMap((key) => exerciseByKey(key).changes6m).slice(0, 4),
    };
    const watchPoints = [
      ...growKeys.flatMap((key) => exerciseByKey(key).changes3m).slice(0, 4),
      ...(data.ppiNote ? [`${data.ppiNote}\u3000…この場面に変化があるか`] : []),
    ];

    const previousTroubles = input.previous?.data.troubles ?? [];
    const changes3m = input.previous
      ? sorted
          .filter((key) => levelValue(levelOf(key)) > levelValue(input.previous?.data.lv[key]))
          .flatMap((key) => exerciseByKey(key).changes3m.slice(0, 2))
          .slice(0, 6)
      : undefined;
    const ppiPrevious = input.previous ? ppiSnapshot(input, true) : undefined;
    const tuningKeys: TuningKey[] = ['priorityRule'];
    if (input.previous) tuningKeys.push('comparison');
    if (engagement.some((axis) => axis.prevLevel !== undefined)) tuningKeys.push('engagementDelta');
    if (copm.some((goal) => goal.previous)) tuningKeys.push('copmDelta');
    if (input.child.ageGroup === 'pre' && domainHits.length) tuningKeys.push('troubleDomainPre');

    // --- コーチ向け（子どもページ） ---
    // 主軸＝最小Lv／次点＝2番目／維持＝最大Lv（モックの low / mid / high）。
    const coachFocus = unique([sorted[0], sorted[1], sorted.at(-1)].filter((key): key is ExerciseKey => key !== undefined))
      .map((key, index) => ({ key, role: COACH_FOCUS_ROLES[index]! }));
    const toCaution = (key: CoachCautionKey, exercises: ExerciseKey[]) => ({ key, ...COACH_CAUTIONS[key], exercises });
    const coachCautions = [
      { key: 'notMeasuredCore' as const, exercises: keys.filter((key) => exerciseByKey(key).core && levelOf(key) === 0) },
      { key: 'notPossible' as const, exercises: keys.filter((key) => levelOf(key) === LEVEL_NOT_POSSIBLE) },
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
      unmeasured,
      conditionNotes,
      upcomingExercises,
      priorities,
      strengths,
      engagement,
      envSupports,
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
      risks: [...RISK_NOTES],
      pyramid: {
        rows: PYRAMID_TIERS.map((row) => ({ tier: row.tier, items: [...row.items] })),
        highlighted,
        root: pyramidRoot,
        rootTierLabel: pyramidTierLabel(pyramidRoot),
        related: pyramidRelated,
        sourceKey: lowestKey,
      },
      link: {
        lowestKey,
        text: isMeasured(levelOf(lowestKey))
          ? `チェックされた困りごとの多くは、${lowestExercise.parentName}（${lowestExercise.name} Lv${levelOf(lowestKey)}／${lowestExercise.maxLevel}）がまだ育っている途中であることと一致しています。${lowestExercise.grow}`
          : `今回は${lowestExercise.name}を測れていないため、困りごととのつながりは次回あらためて確認します。${lowestExercise.grow}`,
      },
      ppi: {
        current: ppiSnapshot(input),
        ...(ppiPrevious ? { previous: ppiPrevious } : {}),
        note: data.ppiNote,
      },
      roadmap,
      wants,
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
          const nextLv = Math.min(exercise.maxLevel, Math.max(1, levelValue(lv) + 1));
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
        memo: data.memo,
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
        wantPackages: data.wants.flatMap((id) => {
          const want = wantById(id);
          if (!want) return [];
          const axisLv = levelOf(want.axis) ?? 0;
          const axisMaxLv = exerciseByKey(want.axis).maxLevel;
          // 支える種目が上限の3割以下なら、パッケージより先に土台を上げる。
          const status: WantPackageStatus = !isMeasured(axisLv)
            ? 'unmeasured'
            : axisLv <= Math.ceil(axisMaxLv * WANT_FOUNDATION_RATIO) ? 'foundationFirst' : 'ready';
          return [{
            id: want.id,
            icon: want.icon,
            short: wantShortText(want.text),
            menu: want.menu,
            axisKey: want.axis,
            axisLv,
            axisMaxLv,
            status,
          }];
        }),
        copmFocus: {
          mostImportant: mostImportantGoal ? { text: mostImportantGoal.text, importance: mostImportantGoal.importance } : null,
          lowSatisfaction: data.copm
            .filter((goal) => goal.performance >= 6 && goal.satisfaction <= 4)
            .map((goal) => goal.text),
        },
      },
    };
  }
}

