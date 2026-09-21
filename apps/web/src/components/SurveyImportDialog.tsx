import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { COPM_MAX, PPI_QUESTIONS, PPI_SCORE_MAX, WANT_ITEMS, WANT_MAX, type PpiKey } from '@papamo/shared';
import styles from '../styles/page.module.css';

const MAX_GOAL_LENGTH = 100;
/** アンケート1件のなかで複数の回答を並べるときの区切り（design-mock-v2 のCSV仕様）。 */
const MULTI_VALUE_PATTERN = /[｜|,]/;
/** お困り度は0〜5の1桁だけを取り込む。 */
const PPI_ANSWER_PATTERN = new RegExp(`^[0-${PPI_SCORE_MAX}]$`);

export interface SurveyImport {
  troubles: string[];
  wants: string[];
  goals: string[];
  ppi: Partial<Record<PpiKey, number>>;
  ppiNote: string;
}

const PPI_COLUMNS = PPI_QUESTIONS.map(({ key }) => [`ppi_${key}`, key] as const);
const KNOWN_COLUMNS = ['trouble', 'want', 'goal', 'ppi_note', ...PPI_COLUMNS.map(([column]) => column)];

function splitCells(line: string): string[] {
  return line.split('\t').map((cell) => cell.trim());
}

function splitValues(cell: string): string[] {
  return [...new Set(
    cell
      .split(MULTI_VALUE_PATTERN)
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

/**
 * 事前アンケートの回答を貼り付けて読み取る。
 *
 * 1. 列名の行（`trouble` / `want` / `goal` / `ppi_time`… ）と回答の行を貼り付けた場合は、
 *    お困りごと・できるようになりたいこと・目標・ご家庭のお困り度をまとめて取り込む。
 * 2. 列名が見つからない場合は、これまでどおり並んだセルを目標として取り込む。
 */
export function parseSurveyPaste(value: string, troubleOptions: readonly string[]): SurveyImport {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => (
    splitCells(line).some((cell) => KNOWN_COLUMNS.includes(cell.toLowerCase()))
  ));

  if (headerIndex < 0 || !lines[headerIndex + 1]) {
    const goals = [...new Set(lines.flatMap(splitCells).filter(Boolean))];
    return { troubles: [], wants: [], goals, ppi: {}, ppiNote: '' };
  }

  const header = splitCells(lines[headerIndex]!).map((cell) => cell.toLowerCase());
  const answer = splitCells(lines[headerIndex + 1]!);
  const cellOf = (column: string) => {
    const index = header.indexOf(column);
    return index < 0 ? '' : answer[index] ?? '';
  };

  const ppi: Partial<Record<PpiKey, number>> = {};
  for (const [column, key] of PPI_COLUMNS) {
    const raw = cellOf(column);
    if (!PPI_ANSWER_PATTERN.test(raw)) continue;
    ppi[key] = Number(raw);
  }

  const wantIds = new Set<string>(WANT_ITEMS.map((item) => item.id));
  return {
    // マスタにない文言は受け取らない（保存値が文言そのものになるため）。
    troubles: splitValues(cellOf('trouble')).filter((trouble) => troubleOptions.includes(trouble)),
    wants: splitValues(cellOf('want')).filter((id) => wantIds.has(id)).slice(0, WANT_MAX),
    goals: splitValues(cellOf('goal')),
    ppi,
    ppiNote: cellOf('ppi_note'),
  };
}

function summaryOf(result: SurveyImport): string[] {
  const summary: string[] = [];
  if (result.troubles.length) summary.push(`お困りごと ${result.troubles.length}件`);
  if (result.wants.length) summary.push(`できるようになりたいこと ${result.wants.length}件`);
  if (result.goals.length) summary.push(`目標 ${result.goals.length}件`);
  if (Object.keys(result.ppi).length) summary.push(`ご家庭のお困り度 ${Object.keys(result.ppi).length}問`);
  return summary;
}

export function SurveyImportDialog({
  open,
  troubleOptions,
  onCancel,
  onImport,
}: {
  open: boolean;
  troubleOptions: readonly string[];
  onCancel: () => void;
  onImport: (result: SurveyImport) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPastedText('');
      setError(null);
      dialog.showModal();
      textareaRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function importSurvey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseSurveyPaste(pastedText, troubleOptions);
    if (!summaryOf(result).length) {
      setError('取り込める回答が見つかりませんでした。コピーする範囲を確認してください。');
      return;
    }
    if (result.goals.length > COPM_MAX) {
      setError(`目標は${COPM_MAX}件までです。貼り付けるセルを確認してください。`);
      return;
    }
    if (result.goals.some((goal) => goal.length > MAX_GOAL_LENGTH)) {
      setError(`1件の目標は${MAX_GOAL_LENGTH}文字以内にしてください。`);
      return;
    }
    onImport(result);
  }

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.confirmDialog} ${styles.importDialog}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onCancel();
      }}
    >
      <form onSubmit={importSurvey}>
        <h2 id={titleId}>事前アンケートから取り込む</h2>
        <p id={descriptionId}>
          スプレッドシートで回答の範囲を選んでコピーし、そのまま貼り付けてください。
          列名の行（<code>trouble</code> / <code>want</code> / <code>goal</code> / <code>ppi_time</code> など）を含めて貼ると、
          お困りごと・目標・ご家庭のお困り度をまとめて取り込みます。
          目標のセルだけを貼り付けた場合は、目標欄（最大{COPM_MAX}件）に入ります。
        </p>
        <div className={styles.formField}>
          <label htmlFor="survey-paste">コピーした回答</label>
          <textarea
            id="survey-paste"
            ref={textareaRef}
            className={styles.importTextarea}
            value={pastedText}
            onChange={(event) => {
              setPastedText(event.target.value);
              setError(null);
            }}
            rows={7}
            placeholder={'trouble\twant\tgoal\tppi_time\n姿勢がすぐ崩れる／机に伏せる｜忘れ物・なくし物が多い\tw16｜w18\t板書を写すのが間に合うようになる\t4'}
          />
        </div>
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <div className={styles.confirmActions}>
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
          <button className={styles.primaryButton} type="submit">入力欄に取り込む</button>
        </div>
      </form>
    </dialog>
  );
}
