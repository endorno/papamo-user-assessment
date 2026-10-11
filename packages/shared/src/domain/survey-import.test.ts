import { describe, expect, it } from 'vitest';

import { WANT_ITEMS } from '../master/goals';
import { SURVEY_SHEET_COLUMNS, SURVEY_SHEET_HEADER, type SurveySheetHeader } from '../master/survey-form';
import { TROUBLE_ITEMS } from '../master/troubles';
import { emptyCopmGoal, parseStoredAssessmentData } from '../schema/assessment';
import {
  applySurveyAnswers,
  parseSurveyRow,
  surveyReplacedFields,
  type SurveyAnswers,
} from './survey-import';

const POSTURE = '姿勢がすぐ崩れる／机に伏せる・寝転がる';
const BALL = 'ボールを投げる・受けるのが苦手';
const columns = SURVEY_SHEET_COLUMNS;

/** 回答シートの1行（列名 → 値）を、スプレッドシートからコピーしたときのタブ区切りにする。 */
function sheetRow(values: Partial<Record<SurveySheetHeader, string>>): string {
  return SURVEY_SHEET_HEADER.map((header) => values[header] ?? '').join('\t');
}

const answeredRow = {
  [columns.answeredAt]: '2026/10/01 10:15:30',
  [columns.childName]: 'はると',
  [columns.troubles]: `${POSTURE}, ${BALL}`,
  [columns.wants]: '球技が上手になりたい, 公園の遊具で遊べるようになりたい',
  [columns.freeWants[0]]: '階段をスムーズに昇り降りできるようになりたい',
  [columns.ppi.time]: '5',
  [columns.ppi.emo]: '4',
  [columns.ppi.soc]: '2',
  [columns.ppi.fut]: '4',
  [columns.ppi.nav]: '3',
  [columns.ppiNote]: '朝、着替えから家を出るまで毎日40分以上かかる',
};

function parsed(text: string) {
  const result = parseSurveyRow(text);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function errorOf(text: string) {
  const result = parseSurveyRow(text);
  if (result.ok) throw new Error('読み取れてしまった');
  return result.error;
}

describe('事前アンケートの回答シートの列', () => {
  it('列名が重ならず、取り込みで読む列はすべて1行目にある', () => {
    expect(new Set(SURVEY_SHEET_HEADER).size).toBe(SURVEY_SHEET_HEADER.length);
    const used = [
      columns.answeredAt, columns.childName, columns.troubles, columns.wants,
      ...columns.freeWants, ...Object.values(columns.ppi), columns.ppiNote,
    ];
    for (const header of used) expect(SURVEY_SHEET_HEADER).toContain(header);
  });

  it('選択肢の文言に区切りの「,」が含まれない（含まれると1つの回答が分かれてしまう）', () => {
    for (const text of [...TROUBLE_ITEMS, ...WANT_ITEMS.map((item) => item.text)]) {
      expect(text).not.toContain(',');
    }
  });
});

describe('parseSurveyRow', () => {
  it('コピーした行を列名の並びで読み、選択肢の文言をマスタに照合する', () => {
    const result = parsed(sheetRow(answeredRow));

    expect(result.answeredAt).toBe('2026/10/01 10:15:30');
    expect(result.childName).toBe('はると');
    expect(result.answers).toEqual({
      troubles: [POSTURE, BALL],
      wants: ['w9', 'w23'],
      freeWants: ['階段をスムーズに昇り降りできるようになりたい'],
      ppi: { time: 5, emo: 4, soc: 2, fut: 4, nav: 3 },
      ppiNote: '朝、着替えから家を出るまで毎日40分以上かかる',
    });
    expect(result.skipped).toEqual({ troubles: [], wants: [], overLimit: [], ppi: [], tooLong: [] });
  });

  it('1行目（列名）ごとコピーした場合と、右に列が足されたシートからコピーした場合も読む', () => {
    const header = SURVEY_SHEET_HEADER.join('\t');
    expect(parsed(`${header}\n${sheetRow(answeredRow)}`).childName).toBe('はると');
    // 運用で右端に「担当」などの列を足しても、読む列の位置は変わらない。
    expect(parsed(`${sheetRow(answeredRow)}\tさとう\t済`).answers.ppi.nav).toBe(3);
  });

  it('改行を含む記述のセル（スプレッドシートが引用符で囲む）を1つのセルとして読む', () => {
    const row = sheetRow({ ...answeredRow, [columns.ppiNote]: 'PLACEHOLDER' })
      .replace('PLACEHOLDER', '"朝の支度で\n毎日 ""もう嫌"" と言う"');

    expect(parsed(row).answers.ppiNote).toBe('朝の支度で\n毎日 "もう嫌" と言う');
  });

  it('マスタに無い値・0〜5 でないお困り度・長すぎる記述は取り込まずに返す', () => {
    const { answers, skipped } = parsed(sheetRow({
      ...answeredRow,
      [columns.troubles]: `${POSTURE}, 存在しない困りごと`,
      [columns.wants]: '球技が上手になりたい, ボールを蹴る・打つ',
      [columns.ppi.time]: '３',
      [columns.ppi.emo]: '6',
      [columns.ppiNote]: 'あ'.repeat(201),
    }));

    expect(answers.troubles).toEqual([POSTURE]);
    expect(answers.wants).toEqual(['w9']);
    // 全角の数字は読む。
    expect(answers.ppi.time).toBe(3);
    expect(answers.ppi.emo).toBeUndefined();
    expect(answers.ppiNote).toBe('');
    expect(skipped.troubles).toEqual(['存在しない困りごと']);
    expect(skipped.wants).toEqual(['ボールを蹴る・打つ']);
    expect(skipped.ppi).toEqual([{ key: 'emo', name: '感情の負担', value: '6' }]);
    expect(skipped.tooLong.map(({ label }) => label)).toEqual(['いま一番負担に感じている場面']);
  });

  it('できるようになりたいことは自由記載と合わせて4つまで取り込み、超えた分を返す', () => {
    const { answers, skipped } = parsed(sheetRow({
      ...answeredRow,
      [columns.wants]: '縄跳びが跳べるようになりたい, 鉄棒ができるようになりたい, 跳び箱が跳べるようになりたい',
      [columns.freeWants[0]]: '階段を昇り降りしたい',
      [columns.freeWants[1]]: '開脚したい',
    }));

    expect(answers.wants).toEqual(['w1', 'w2', 'w3']);
    expect(answers.freeWants).toEqual(['階段を昇り降りしたい']);
    expect(skipped.overLimit).toEqual(['開脚したい']);
  });

  it('行の一部だけのコピーや、別のお子さまの回答が混ざる貼り付けは止める', () => {
    expect(errorOf(SURVEY_SHEET_HEADER.join('\t'))).toMatch('回答の行が見つかりません');
    expect(errorOf(`${sheetRow(answeredRow)}\n${sheetRow(answeredRow)}`)).toMatch('1人分');
    // タイムスタンプの列を外してコピーすると、列が1つずつずれる。
    expect(errorOf(sheetRow(answeredRow).split('\t').slice(1).join('\t'))).toMatch('行全体をコピーしてください');
  });
});

describe('applySurveyAnswers', () => {
  const empty = parseStoredAssessmentData({});
  const answers: SurveyAnswers = {
    troubles: [POSTURE],
    wants: ['w9'],
    freeWants: ['階段を昇り降りできるようになりたい'],
    ppi: { time: 5, emo: 4 },
    ppiNote: '朝の支度',
  };

  it('回答があった欄を置き換え、選んだ項目の仮の文言と自由記載を目標欄に足す', () => {
    const { data, goalsNotAdded } = applySurveyAnswers({ ...empty, troubles: [BALL], ppi: { nav: 1 }, memo: '所見' }, answers);

    expect(data.troubles).toEqual([POSTURE]);
    expect(data.wants).toEqual(['w9']);
    expect(data.copm.map(({ text }) => text)).toEqual(['球技が上手になる', '階段を昇り降りできるようになりたい']);
    // 回答の無かった設問・欄はコーチの入力のまま残す。
    expect(data.ppi).toEqual({ nav: 1, time: 5, emo: 4 });
    expect(data.ppiNote).toBe('朝の支度');
    expect(data.memo).toBe('所見');
    expect(goalsNotAdded).toEqual([]);
  });

  it('回答の無い欄には触らない', () => {
    const { data } = applySurveyAnswers(
      { ...empty, troubles: [BALL], ppiNote: '手入力' },
      { troubles: [], wants: [], freeWants: [], ppi: { time: 2 }, ppiNote: '' },
    );

    expect(data.troubles).toEqual([BALL]);
    expect(data.ppiNote).toBe('手入力');
  });

  it('同じ文言の目標は重ねず、目標欄に空きが無ければ入れずに返す', () => {
    const manual = ['球技が上手になる', 'a', 'b', 'c'].map((text) => emptyCopmGoal(text));
    const { data, goalsNotAdded } = applySurveyAnswers({ ...empty, copm: manual }, answers);

    expect(data.copm).toEqual(manual);
    expect(goalsNotAdded).toEqual(['階段を昇り降りできるようになりたい']);
  });

  it('置き換わる手入力があるときだけ知らせる', () => {
    expect(surveyReplacedFields(empty, answers)).toEqual([]);
    expect(surveyReplacedFields({ ...empty, troubles: [POSTURE], ppi: { time: 5 } }, answers)).toEqual([]);
    expect(surveyReplacedFields({ ...empty, troubles: [BALL], wants: ['w1'], ppi: { emo: 1 }, ppiNote: '別の場面' }, answers))
      .toEqual(['troubles', 'wants', 'ppi', 'ppiNote']);
  });
});
