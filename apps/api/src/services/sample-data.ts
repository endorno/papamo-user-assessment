import { asc, like } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle } from 'drizzle-orm/d1';
import { ulid } from 'ulid';
import {
  addMonthsClamped,
  assessmentDataCompletedSchema,
  assessmentDataDraftSchema,
  CORE_EXERCISE_KEYS,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  generateShareCode,
  gradeAt,
  MASTER_VERSION,
  reportContentSchema,
  schoolYear,
  TROUBLE_CATEGORIES,
  todayInJst,
  type AssessmentData,
  type CompletedAssessmentData,
  type ExerciseKey,
  type GradeCode,
  type Honorific,
  type PlanKey,
  type SampleDataProfile,
} from '@papamo/shared';

import { assessments, childCoaches, children, coaches, reports } from '../db/schema';
import { isUniqueConstraintError } from '../db/errors';
import type { CoachRecord, Env } from '../env';
import { generateReport } from './report';

const REQUIRED_BACKGROUND_COACH_COUNT = 15;
const SAMPLE_NAME_PREFIX = 'テスト・';
const SAMPLE_NAMES = ['あおい', 'いつき', 'うた', 'えま', 'かえで', 'けい', 'こはる', 'さく', 'しおり', 'すばる', 'そら', 'たくみ', 'ちひろ', 'つむぎ', 'とうま', 'なぎ', 'はる', 'ひなた', 'ふうか', 'まこと'];
const SAMPLE_GOALS = [
  '姿勢を保てる時間を伸ばしたい',
  'ボール遊びを楽しめるようになりたい',
  '切り替えを落ち着いてできるようになりたい',
  '手先を使う活動に自信をつけたい',
  '学校や園で疲れにくくなってほしい',
];
const LONG_PROFILE_GRADES: GradeCode[] = ['e4', 'e5', 'e6', 'j1', 'j2', 'j3'];
const ALL_GRADES: GradeCode[] = ['k0', 'k1', 'k2', 'k3', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3'];
const HONORIFICS: Honorific[] = ['kun', 'chan', 'san'];
const PLAN_KEYS: PlanKey[] = ['base', 'select'];
const UINT32_RANGE = 4_294_967_296;

type Random = () => number;

export interface SampleDataOptions {
  now?: Date;
  random?: Random;
}

export class SampleDataServiceError extends Error {
  constructor(readonly code: 'not_ready', message: string) {
    super(message);
    this.name = 'SampleDataServiceError';
  }
}

function dbFor(env: Env) {
  return drizzle(env.DB, { schema: { assessments, childCoaches, children, coaches, reports } });
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] ?? 0) / UINT32_RANGE;
}

function randomInt(random: Random, minimum: number, maximumExclusive: number): number {
  return minimum + Math.floor(random() * (maximumExclusive - minimum));
}

function pick<T>(random: Random, values: readonly T[]): T {
  const selected = values[randomInt(random, 0, values.length)];
  if (selected === undefined) throw new Error('サンプル値を選択できませんでした。');
  return selected;
}

function selectDistinct<T>(random: Random, values: readonly T[], count: number): T[] {
  const candidates = [...values];
  const selected: T[] = [];
  while (selected.length < count && candidates.length > 0) {
    selected.push(candidates.splice(randomInt(random, 0, candidates.length), 1)[0]!);
  }
  return selected;
}

function shareCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return generateShareCode(bytes);
}

function timestampFor(date: string, sequence = 0): string {
  const seconds = Math.min(sequence, 59).toString().padStart(2, '0');
  return `${date}T03:00:${seconds}.000Z`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assessmentCount(profile: SampleDataProfile, random: Random): number {
  if (profile === 'long') return 12;
  if (profile === 'short') return randomInt(random, 1, 5);
  return 0;
}

function completedData(input: {
  random: Random;
  levels: Record<ExerciseKey, number>;
  activeKeys: readonly ExerciseKey[];
  ageGroup: 'pre' | 'sch';
  goals: string[];
  sequence: number;
}): CompletedAssessmentData {
  const lv = Object.fromEntries(input.activeKeys.map((key) => [key, input.levels[key]]));
  const errs = Object.fromEntries(input.activeKeys.flatMap((key) => {
    const exercise = EXERCISES.find((candidate) => candidate.key === key)!;
    const selected = selectDistinct(input.random, exercise.errors, randomInt(input.random, 0, 3));
    return selected.length > 0 ? [[key, selected]] : [];
  }));
  const troublePool = TROUBLE_CATEGORIES[input.ageGroup].flatMap((category) => [...category.items]);
  const troubles = selectDistinct(input.random, troublePool, randomInt(input.random, 1, 4));
  const plan = input.ageGroup === 'pre' ? 'pre' : pick(input.random, PLAN_KEYS);

  return assessmentDataCompletedSchema.parse({
    lv,
    errs,
    troubles,
    ppi: {
      time: randomInt(input.random, 0, 6),
      emo: randomInt(input.random, 0, 6),
      soc: randomInt(input.random, 0, 6),
      fut: randomInt(input.random, 0, 6),
      nav: randomInt(input.random, 0, 6),
    },
    ppiNote: input.sequence % 3 === 0 ? '家庭での取り組み方も相談したい。' : '',
    plan,
    memo: `サンプル所見（第${input.sequence}回）。継続して経過を確認する。`,
    goals: input.goals,
  });
}

function draftData(random: Random, ageGroup: 'pre' | 'sch'): AssessmentData {
  const keys = selectDistinct(random, CORE_EXERCISE_KEYS, randomInt(random, 1, CORE_EXERCISE_KEYS.length + 1));
  const troublePool = TROUBLE_CATEGORIES[ageGroup].flatMap((category) => [...category.items]);
  return assessmentDataDraftSchema.parse({
    lv: Object.fromEntries(keys.map((key) => [key, randomInt(random, 0, 10)])),
    errs: {},
    troubles: selectDistinct(random, troublePool, 1),
    ppi: { time: randomInt(random, 0, 6), emo: randomInt(random, 0, 6) },
    ppiNote: '',
    plan: ageGroup === 'pre' ? 'pre' : 'base',
    memo: '入力途中のサンプルです。',
    goals: [],
  });
}

export async function getBackgroundCoaches(env: Env): Promise<CoachRecord[]> {
  const rows = await dbFor(env)
    .select()
    .from(coaches)
    .where(like(coaches.email, 'seed-coach-%@example.invalid'))
    .orderBy(asc(coaches.email))
    .all();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.displayName,
  }));
}

export async function sampleDataStatus(env: Env) {
  const backgroundCoachCount = (await getBackgroundCoaches(env)).length;
  return {
    ready: backgroundCoachCount >= REQUIRED_BACKGROUND_COACH_COUNT,
    backgroundCoachCount,
  };
}

export async function createSampleChild(
  env: Env,
  owner: CoachRecord,
  profile: SampleDataProfile,
  options: SampleDataOptions = {},
) {
  const random = options.random ?? secureRandom;
  const today = todayInJst(options.now);
  const backgroundCoaches = await getBackgroundCoaches(env);
  if (backgroundCoaches.length < REQUIRED_BACKGROUND_COACH_COUNT) {
    throw new SampleDataServiceError(
      'not_ready',
      '先に非本番用シードを実行して、背景コーチを作成してください。',
    );
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const db = dbFor(env);
    const childId = ulid();
    const gradeCode = pick(random, profile === 'long' ? LONG_PROFILE_GRADES : ALL_GRADES);
    const gradeBaseYear = schoolYear(today);
    const goals = selectDistinct(random, SAMPLE_GOALS, randomInt(random, 1, 4));
    const doneCount = assessmentCount(profile, random);
    const latestOffset = doneCount > 0 ? -randomInt(random, 0, 6) : 0;
    const firstAssessedOn = doneCount > 0
      ? addMonthsClamped(today, latestOffset - ((doneCount - 1) * 3))
      : today;
    const joinedOn = addMonthsClamped(firstAssessedOn, -randomInt(random, 0, 4));
    const unlockExtended = profile === 'long'
      ? random() < 0.5
      : doneCount >= 3 && random() < 0.25;
    const memberCount = randomInt(random, 0, 3);
    const members = selectDistinct(random, backgroundCoaches, memberCount);
    const availableCoaches = [owner, ...members];
    const childTimestamp = timestampFor(joinedOn);
    const childRow: typeof children.$inferInsert = {
      id: childId,
      shareCode: shareCode(),
      ownerShareCode: shareCode(),
      createdBy: owner.id,
      name: `${SAMPLE_NAME_PREFIX}${pick(random, SAMPLE_NAMES)}${randomInt(random, 100, 1000)}`,
      honorific: pick(random, HONORIFICS),
      gradeCode,
      gradeBaseYear,
      joinedOn,
      extUnlocked: unlockExtended,
      goals: JSON.stringify(goals),
      archivedAt: null,
      createdAt: childTimestamp,
      updatedAt: timestampFor(today),
    };
    const statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] = [
      db.insert(children).values(childRow),
      db.insert(childCoaches).values([
        { childId, coachId: owner.id, role: 'owner', createdAt: childTimestamp },
        ...members.map((coach) => ({ childId, coachId: coach.id, role: 'member', createdAt: childTimestamp })),
      ]),
    ];

    const levels = Object.fromEntries(
      EXERCISES.map((exercise) => [exercise.key, randomInt(random, 1, 7)]),
    ) as Record<ExerciseKey, number>;
    let previous: {
      id: string;
      seqNo: number;
      assessedOn: string;
      unlockExt: boolean;
      data: CompletedAssessmentData;
    } | undefined;

    for (let index = 0; index < doneCount; index += 1) {
      const sequence = index + 1;
      const assessedOn = addMonthsClamped(firstAssessedOn, index * 3);
      const unlockExt = unlockExtended && sequence >= (profile === 'long' ? 4 : 3);
      const activeKeys = unlockExt
        ? [...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS]
        : CORE_EXERCISE_KEYS;
      for (const key of activeKeys) {
        if (index > 0) levels[key] = clamp(levels[key] + pick(random, [-1, 0, 0, 1, 1, 2]), 0, 20);
      }
      const ageGroup = gradeAt({ gradeCode, gradeBaseYear }, assessedOn).ageGroup;
      const data = completedData({ random, levels, activeKeys, ageGroup, goals, sequence });
      const assessmentCoach = pick(random, availableCoaches);
      const assessmentId = ulid();
      const completedAt = timestampFor(assessedOn, sequence);
      const assessment = {
        id: assessmentId,
        seqNo: sequence,
        assessedOn,
        unlockExt,
        data,
      };
      const content = reportContentSchema.parse(await generateReport({
        env,
        child: childRow as typeof children.$inferSelect,
        coach: assessmentCoach,
        assessment,
        previous,
        generatedAt: completedAt,
      }));

      statements.push(db.insert(assessments).values({
        id: assessmentId,
        childId,
        seqNo: sequence,
        status: 'done',
        assessedOn,
        coachId: assessmentCoach.id,
        unlockExt,
        prevAssessmentId: previous?.id ?? null,
        masterVersion: MASTER_VERSION,
        data: JSON.stringify(data),
        revision: 1,
        mutationId: assessmentId,
        createdAt: completedAt,
        updatedAt: completedAt,
        completedAt,
      }));
      statements.push(db.insert(reports).values({
        id: ulid(),
        assessmentId,
        assessmentRevision: 1,
        generator: content.generator,
        content: JSON.stringify(content),
        createdAt: completedAt,
        updatedAt: completedAt,
      }));
      previous = assessment;
    }

    if (profile === 'new' && random() < 0.5) {
      const assessmentId = ulid();
      const ageGroup = gradeAt({ gradeCode, gradeBaseYear }, today).ageGroup;
      statements.push(db.insert(assessments).values({
        id: assessmentId,
        childId,
        seqNo: 1,
        status: 'draft',
        assessedOn: today,
        coachId: owner.id,
        unlockExt: false,
        prevAssessmentId: null,
        masterVersion: MASTER_VERSION,
        data: JSON.stringify(draftData(random, ageGroup)),
        revision: 1,
        mutationId: assessmentId,
        createdAt: timestampFor(today),
        updatedAt: timestampFor(today),
        completedAt: null,
      }));
    }

    try {
      await db.batch(statements);
      return { childId, profile };
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === 4) throw error;
    }
  }

  throw new Error('サンプルデータの識別子を生成できませんでした。');
}
