import { COPM_MAX, WANT_ITEMS, WANT_MAX, wantById, wantToGoalText } from '../master/goals';
import { PPI_QUESTIONS, PPI_SCORE_MAX, type PpiKey } from '../master/ppi';
import { SURVEY_SHEET_COLUMNS, SURVEY_SHEET_HEADER, type SurveySheetHeader } from '../master/survey-form';
import { TROUBLE_ITEMS } from '../master/troubles';
import { emptyCopmGoal, TEXT_LIMITS, type AssessmentData } from '../schema/assessment';

/**
 * チェックボックスの回答の区切り。Googleフォームは選んだ選択肢を「, 」でつないで1つのセルに入れる。
 * マスタの文言には含まれない（survey-import.test.ts で確かめている）。
 */
const CHOICE_SEPARATOR = ',';
const PPI_ANSWER_PATTERN = new RegExp(`^[0-${PPI_SCORE_MAX}]$`);
// 回答シートのタイムスタンプ（日本の表示形式 2026/10/01 10:00:00 と、米国式 10/1/2026 10:00:00）。
const TIMESTAMP_PATTERN = /^(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4})/;

export interface SurveyAnswers {
  /** マスタの文言（保存値）。 */
  troubles: string[];
  /** できるようになりたいことの id。 */
  wants: string[];
  /** 自由記載。目標（COPM）の文言として入れる。 */
  freeWants: string[];
  ppi: Partial<Record<PpiKey, number>>;
  ppiNote: string;
}

/** 回答にはあったが取り込まない値。取り込む前にコーチへ見せる。 */
export interface SurveySkipped {
  /** マスタの文言と一致しなかったお困りごと。 */
  troubles: string[];
  /** マスタの文言と一致しなかったできるようになりたいこと。 */
  wants: string[];
  /** 自由記載と合わせて上限（4つ）を超えた分。 */
  overLimit: string[];
  /** 0〜5 の整数として読めなかったお困り度。 */
  ppi: { key: PpiKey; name: string; value: string }[];
  /** 入力欄の文字数の上限を超えた自由記述（入力欄に入らないため、コーチが要約して入れる）。 */
  tooLong: { label: string; value: string }[];
}

export interface SurveyResponse {
  /** 回答シートのタイムスタンプ（表示のまま）。 */
  answeredAt: string;
  /** フォームに書かれたお子さまのお名前。取り込み先と取り違えていないかをコーチが見比べる。 */
  childName: string;
  answers: SurveyAnswers;
  skipped: SurveySkipped;
}

export type SurveyParseResult = ({ ok: true } & SurveyResponse) | { ok: false; error: string };

/**
 * タブ区切りの表として読む。スプレッドシートからのコピーは、改行・タブ・引用符を含むセルだけ "…" で囲まれる。
 * 引用符はセルの先頭にあるときだけ囲みとして扱う（文中の " はそのまま残す）。
 */
function parseTabSeparated(text: string): string[][] {
  const source = text.replace(/\r\n?/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;
    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }
    if (char === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
      continue;
    }
    if (char === '\t' || char === '\n') {
      row.push(cell);
      cell = '';
      atCellStart = true;
      if (char === '\n') {
        rows.push(row);
        row = [];
      }
      continue;
    }
    cell += char;
    atCellStart = false;
  }
  row.push(cell);
  rows.push(row);
  return rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some(Boolean));
}

/** 回答シートの列名から、貼り付けた行のセルを引く。列の位置は SURVEY_SHEET_HEADER の並びで決まる。 */
function cellIn(row: readonly string[], header: SurveySheetHeader): string {
  return row[SURVEY_SHEET_HEADER.indexOf(header)] ?? '';
}

// 1行目（列名）も一緒にコピーされた場合は読み飛ばす。
function isHeaderRow(row: readonly string[]): boolean {
  return cellIn(row, SURVEY_SHEET_COLUMNS.answeredAt) === SURVEY_SHEET_COLUMNS.answeredAt;
}

function splitChoices(cell: string): string[] {
  return [...new Set(cell.split(CHOICE_SEPARATOR).map((value) => value.trim()).filter(Boolean))];
}

// フォームの選択肢を作るときの全角・半角や空白の違いは吸収する。
function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '');
}

const TROUBLE_BY_TEXT = new Map(TROUBLE_ITEMS.map((text) => [normalize(text), text]));
const WANT_ID_BY_TEXT = new Map<string, string>(WANT_ITEMS.map((item) => [normalize(item.text), item.id]));

/**
 * 事前アンケートの回答シートからコピーした1人分の行を読み取る。
 * 列は SURVEY_SHEET_HEADER の並びで決まり、回答が空のセルは「回答なし」として扱う（取り込み先の欄に触らない）。
 */
export function parseSurveyRow(text: string): SurveyParseResult {
  const rows = parseTabSeparated(text).filter((row) => !isHeaderRow(row));
  if (!rows.length) return { ok: false, error: '回答の行が見つかりません。お子さまの回答の行をコピーしてください。' };
  // 別のお子さまの回答を混ぜないよう、1人分だけを受ける。
  if (rows.length > 1) return { ok: false, error: '回答は1人分（1行）だけを貼り付けてください。' };
  const row = rows[0]!;
  const cellOf = (header: SurveySheetHeader) => cellIn(row, header);

  // 行の一部だけをコピーすると列の位置がずれるため、先頭のタイムスタンプで行全体かどうかを確かめる。
  const answeredAt = cellOf(SURVEY_SHEET_COLUMNS.answeredAt);
  if (!TIMESTAMP_PATTERN.test(answeredAt)) {
    return {
      ok: false,
      error: '行全体をコピーしてください。スプレッドシートの左端の行番号をクリックすると、行全体を選べます。',
    };
  }

  const skipped: SurveySkipped = { troubles: [], wants: [], overLimit: [], ppi: [], tooLong: [] };

  const troubles: string[] = [];
  for (const value of splitChoices(cellOf(SURVEY_SHEET_COLUMNS.troubles))) {
    const trouble = TROUBLE_BY_TEXT.get(normalize(value));
    if (!trouble) {
      skipped.troubles.push(value);
      continue;
    }
    if (!troubles.includes(trouble)) troubles.push(trouble);
  }

  // できるようになりたいことは、自由記載と合わせて4つまで。先に並んでいるものを残す。
  const wants: string[] = [];
  for (const value of splitChoices(cellOf(SURVEY_SHEET_COLUMNS.wants))) {
    const id = WANT_ID_BY_TEXT.get(normalize(value));
    if (!id) {
      skipped.wants.push(value);
      continue;
    }
    if (wants.includes(id)) continue;
    if (wants.length >= WANT_MAX) {
      skipped.overLimit.push(wantById(id)!.text);
      continue;
    }
    wants.push(id);
  }
  const freeWants: string[] = [];
  for (const header of SURVEY_SHEET_COLUMNS.freeWants) {
    const value = cellOf(header);
    if (!value || freeWants.includes(value)) continue;
    if (value.length > TEXT_LIMITS.copmText) {
      skipped.tooLong.push({ label: 'できるようになりたいこと（自由記載）', value });
      continue;
    }
    if (wants.length + freeWants.length >= WANT_MAX) skipped.overLimit.push(value);
    else freeWants.push(value);
  }

  const ppi: Partial<Record<PpiKey, number>> = {};
  for (const { key, name } of PPI_QUESTIONS) {
    const raw = cellOf(SURVEY_SHEET_COLUMNS.ppi[key]);
    if (!raw) continue;
    const value = raw.normalize('NFKC');
    if (PPI_ANSWER_PATTERN.test(value)) ppi[key] = Number(value);
    else skipped.ppi.push({ key, name, value: raw });
  }

  let ppiNote = cellOf(SURVEY_SHEET_COLUMNS.ppiNote);
  if (ppiNote.length > TEXT_LIMITS.ppiNote) {
    skipped.tooLong.push({ label: 'いま一番負担に感じている場面', value: ppiNote });
    ppiNote = '';
  }

  return {
    ok: true,
    answeredAt,
    childName: cellOf(SURVEY_SHEET_COLUMNS.childName),
    answers: { troubles, wants, freeWants, ppi, ppiNote },
    skipped,
  };
}

export function hasSurveyAnswers(answers: SurveyAnswers): boolean {
  return Boolean(
    answers.troubles.length
    || answers.wants.length
    || answers.freeWants.length
    || Object.keys(answers.ppi).length
    || answers.ppiNote,
  );
}

/** 目標欄に入れる文言。選んだ項目は仮の文言に直し、自由記載はそのまま使う。 */
export function surveyGoalTexts(answers: SurveyAnswers): string[] {
  const texts = [
    ...answers.wants.map((id) => wantById(id)).filter((item) => item !== null).map((item) => wantToGoalText(item.text)),
    ...answers.freeWants,
  ];
  return [...new Set(texts)];
}

export type SurveyReplacedField = 'troubles' | 'wants' | 'ppi' | 'ppiNote';

const sameSet = (first: readonly string[], second: readonly string[]) => (
  first.length === second.length && first.every((value) => second.includes(value))
);

/** 取り込むと置き換わる、いまの入力（取り込む前にコーチへ知らせる）。 */
export function surveyReplacedFields(data: AssessmentData, answers: SurveyAnswers): SurveyReplacedField[] {
  const replaced: SurveyReplacedField[] = [];
  if (answers.troubles.length && data.troubles.length && !sameSet(data.troubles, answers.troubles)) replaced.push('troubles');
  if (answers.wants.length && data.wants.length && !sameSet(data.wants, answers.wants)) replaced.push('wants');
  const ppiKeys = Object.keys(answers.ppi) as PpiKey[];
  if (ppiKeys.some((key) => data.ppi[key] !== undefined && data.ppi[key] !== answers.ppi[key])) replaced.push('ppi');
  if (answers.ppiNote && data.ppiNote.trim() && data.ppiNote !== answers.ppiNote) replaced.push('ppiNote');
  return replaced;
}

export interface SurveyApplyResult {
  data: AssessmentData;
  /** 目標欄に空きがなく入れられなかった文言。 */
  goalsNotAdded: string[];
}

/**
 * 回答を入力に反映する。回答があった欄は置き換え、回答が無かった欄には触らない（コーチの手入力を消さない）。
 * 目標は、同じ文言の行が無いものだけを空き行に足す（できるようになりたいことを手で選んだときと同じ）。
 */
export function applySurveyAnswers(data: AssessmentData, answers: SurveyAnswers): SurveyApplyResult {
  const next: AssessmentData = { ...data };
  if (answers.troubles.length) next.troubles = [...answers.troubles];
  if (answers.wants.length) next.wants = [...answers.wants];
  if (Object.keys(answers.ppi).length) next.ppi = { ...data.ppi, ...answers.ppi };
  if (answers.ppiNote) next.ppiNote = answers.ppiNote;

  const copm = [...data.copm];
  const goalsNotAdded: string[] = [];
  for (const text of surveyGoalTexts(answers)) {
    if (copm.some((goal) => goal.text === text)) continue;
    if (copm.length >= COPM_MAX) {
      goalsNotAdded.push(text);
      continue;
    }
    copm.push(emptyCopmGoal(text));
  }
  next.copm = copm;
  return { data: next, goalsNotAdded };
}
