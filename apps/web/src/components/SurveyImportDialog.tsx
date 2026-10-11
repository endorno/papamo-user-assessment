import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import {
  hasSurveyAnswers,
  parseSurveyRow,
  PPI_QUESTIONS,
  PPI_SCORE_MAX,
  surveyReplacedFields,
  WANT_MAX,
  wantById,
  type AssessmentData,
  type SurveyAnswers,
  type SurveyReplacedField,
  type SurveyResponse,
} from '@papamo/shared';
import styles from '../styles/page.module.css';

const REPLACED_LABELS: Record<SurveyReplacedField, string> = {
  troubles: 'お困りごと',
  wants: 'できるようになりたいこと',
  ppi: 'ご家庭のお困り度',
  ppiNote: 'いま一番負担に感じている場面',
};

// 回答が無かった欄は今の入力のまま残すことを、空欄ではなく言葉で示す。
const NO_ANSWER = '回答なし（今の入力のまま）';

function listOrNoAnswer(values: readonly string[]) {
  return values.length ? values.join('、') : NO_ANSWER;
}

function ppiSummary(answers: SurveyAnswers) {
  const answered = PPI_QUESTIONS.filter(({ key }) => answers.ppi[key] !== undefined);
  if (!answered.length) return NO_ANSWER;
  const summary = answered.map(({ key, name }) => `${name} ${answers.ppi[key]}`).join('・');
  return answered.length < PPI_QUESTIONS.length ? `${summary}（${PPI_QUESTIONS.length}問中${answered.length}問）` : summary;
}

function skippedLines({ skipped }: SurveyResponse): string[] {
  return [
    ...(skipped.troubles.length ? [`選択肢に無いお困りごと：${skipped.troubles.join('、')}`] : []),
    ...(skipped.wants.length ? [`選択肢に無いできるようになりたいこと：${skipped.wants.join('、')}`] : []),
    ...(skipped.overLimit.length
      ? [`${WANT_MAX}つを超えたできるようになりたいこと：${skipped.overLimit.join('、')}（必要なら取り込んだあとで入れ替えてください）`]
      : []),
    ...skipped.ppi.map(({ name, value }) => `ご家庭のお困り度「${name}」：${value}（0〜${PPI_SCORE_MAX}の数字ではありません）`),
    ...skipped.tooLong.map(({ label }) => `${label}：長すぎて入力欄に入りません（要約して手で入力してください）`),
  ];
}

export function SurveyImportDialog({
  open,
  data,
  destination,
  onCancel,
  onImport,
}: {
  open: boolean;
  /** いまの入力。取り込みで置き換わる欄を知らせるのに使う。 */
  data: AssessmentData;
  /** 取り込み先（例「ゆいちゃんの第1回アセスメント」）。回答したお子さまと見比べてもらう。 */
  destination: string;
  onCancel: () => void;
  onImport: (answers: SurveyAnswers) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [pastedText, setPastedText] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setPastedText('');
      dialog.showModal();
      textareaRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // 貼り付けた時点で読み取り、取り込む前に中身を見せる。
  const result = pastedText.trim() ? parseSurveyRow(pastedText) : null;
  const response = result?.ok ? result : null;
  const importable = response && hasSurveyAnswers(response.answers) ? response.answers : null;
  const replaced = importable ? surveyReplacedFields(data, importable) : [];
  const skipped = response ? skippedLines(response) : [];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importable) onImport(importable);
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
      <form onSubmit={submit}>
        <h2 id={titleId}>事前アンケートから取り込む</h2>
        <p id={descriptionId}>
          回答のスプレッドシートで、お子さまの行の行番号（左端の数字）をクリックして行全体を選び、コピーして下の欄に貼り付けてください。
        </p>
        <div className={styles.formField}>
          <label htmlFor="survey-paste">コピーした回答の行</label>
          <textarea
            id="survey-paste"
            ref={textareaRef}
            className={styles.importTextarea}
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            rows={3}
            placeholder="ここに貼り付け（Ctrl+V）"
          />
        </div>
        {result && !result.ok ? <p className={styles.formError} role="alert">{result.error}</p> : null}
        {response ? (
          <section className={styles.importPreview} aria-label="取り込む内容">
            <dl className={styles.importFields}>
              <div>
                <dt>回答したお子さま</dt>
                <dd>{response.childName || '（お名前の回答なし）'}<small>{response.answeredAt} 回答</small></dd>
              </div>
              <div>
                <dt>取り込み先</dt>
                <dd>{destination}</dd>
              </div>
            </dl>
            {importable ? (
              <dl className={styles.importFields}>
                <div><dt>お困りごと</dt><dd>{listOrNoAnswer(importable.troubles)}</dd></div>
                <div>
                  <dt>できるようになりたいこと</dt>
                  <dd>{listOrNoAnswer(importable.wants.map((id) => wantById(id)?.text ?? id))}</dd>
                </div>
                {importable.freeWants.length ? (
                  <div><dt>自由記載（目標欄へ）</dt><dd>{importable.freeWants.join('、')}</dd></div>
                ) : null}
                <div><dt>ご家庭のお困り度</dt><dd>{ppiSummary(importable)}</dd></div>
                <div><dt>いま一番負担に感じている場面</dt><dd>{importable.ppiNote || NO_ANSWER}</dd></div>
              </dl>
            ) : (
              <p className={styles.importWarning}>この行には取り込める回答がありません。</p>
            )}
            {replaced.length ? (
              <p className={styles.importWarning}>
                いま入力されている{replaced.map((field) => REPLACED_LABELS[field]).join('・')}は、この回答で置き換わります。
              </p>
            ) : null}
            {skipped.length ? (
              <div className={styles.importSkipped}>
                <strong>取り込まない回答</strong>
                <ul>{skipped.map((line) => <li key={line}>{line}</li>)}</ul>
              </div>
            ) : null}
          </section>
        ) : null}
        <div className={styles.confirmActions}>
          <button className={styles.secondaryButton} type="button" onClick={onCancel}>キャンセル</button>
          <button className={styles.primaryButton} type="submit" disabled={!importable}>この内容で取り込む</button>
        </div>
      </form>
    </dialog>
  );
}
