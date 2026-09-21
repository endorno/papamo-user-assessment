import { describe, expect, it } from 'vitest';

import {
  activeExerciseKeys,
  bandName,
  CORE_EXERCISE_KEYS,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  isMeasured,
  ladderLabel,
  LEVEL_NOT_MEASURED,
  LEVEL_NOT_POSSIBLE,
  levelValue,
  MAX_EXERCISE_LEVEL,
  maxLevelOf,
  RADAR_MAX_LEVEL,
} from './exercises';

describe('種目マスタ', () => {
  it('ラダーと帯の上限が種目ごとの maxLevel とそろっている', () => {
    for (const exercise of EXERCISES) {
      expect(exercise.ladder, exercise.key).toHaveLength(exercise.maxLevel);
      expect(exercise.bands.at(-1)?.to, exercise.key).toBe(exercise.maxLevel);
      // 帯は Lv の昇順に並べる（bandOf が最初に超えた帯を返すため）。
      const tops = exercise.bands.map((band) => band.to);
      expect([...tops].sort((a, b) => a - b), exercise.key).toEqual(tops);
    }
  });

  it('レーダーの目盛り上限は全種目の上限と一致する', () => {
    expect(RADAR_MAX_LEVEL).toBe(MAX_EXERCISE_LEVEL);
    expect(MAX_EXERCISE_LEVEL).toBe(Math.max(...EXERCISES.map((exercise) => exercise.maxLevel)));
  });

  it('4・5種目目が未開放なら基本の3種目だけを対象にする', () => {
    expect(activeExerciseKeys(false)).toEqual([...CORE_EXERCISE_KEYS]);
    expect(activeExerciseKeys(true)).toEqual([...CORE_EXERCISE_KEYS, ...EXT_EXERCISE_KEYS]);
    expect(CORE_EXERCISE_KEYS).toHaveLength(3);
    expect(EXT_EXERCISE_KEYS).toHaveLength(2);
  });

  it('未実施・実施不可は「測れた」扱いにせず、比較では0として扱う', () => {
    expect(isMeasured(undefined)).toBe(false);
    expect(isMeasured(LEVEL_NOT_MEASURED)).toBe(false);
    expect(isMeasured(LEVEL_NOT_POSSIBLE)).toBe(false);
    expect(isMeasured(1)).toBe(true);
    expect(levelValue(undefined)).toBe(0);
    expect(levelValue(LEVEL_NOT_POSSIBLE)).toBe(0);
    expect(levelValue(12)).toBe(12);
  });

  it('未実施・実施不可の帯とラダー文言を区別して返す', () => {
    expect(bandName('post', LEVEL_NOT_MEASURED)).toBe('未実施');
    expect(bandName('post', LEVEL_NOT_POSSIBLE)).toBe('実施不可');
    expect(bandName('post', 1)).toBe('17cm一巡');
    expect(ladderLabel('post', LEVEL_NOT_MEASURED)).toContain('未実施');
    expect(ladderLabel('post', LEVEL_NOT_POSSIBLE)).toContain('実施不可');
    expect(ladderLabel('post', 1)).not.toBe('');
    // 上限のLvまでは必ず課題文がある。
    expect(ladderLabel('post', maxLevelOf('post'))).not.toBe('');
  });
});
