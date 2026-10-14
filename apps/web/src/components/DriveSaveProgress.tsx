import { useState, type CSSProperties } from 'react';

import { REPORT_DRIVE_STEPS, type ReportDriveStep } from '@papamo/shared';

import styles from './ui.module.css';

const STEP_LABEL: Record<ReportDriveStep, string> = {
  renderParent: '保護者向けのPDFを作っています',
  renderCoach: 'コーチ向けのPDFを作っています',
  upload: 'Googleドライブに保存しています',
};

/**
 * 段階ごとの所要時間の見込み（ミリ秒）。PDFの作成も Drive への送信も途中経過を返さないので、段階の間は
 * この見込みでバーを伸ばす。最初の段階は Browser Run の起動を含む。API が記録する report_drive_timing の実測で直す。
 */
const DRIVE_STEP_EXPECTED_MS: Record<ReportDriveStep, number> = {
  renderParent: 6000,
  renderCoach: 4000,
  upload: 3000,
};

// 見込みより長くかかっても次の段階の分まで進まないよう、段階の中ではここまでで止める。
const STEP_PROGRESS_CEILING = 0.9;

const TOTAL_EXPECTED_MS = REPORT_DRIVE_STEPS.reduce((sum, step) => sum + DRIVE_STEP_EXPECTED_MS[step], 0);

/** 段階の始まりと、段階の中で伸ばす先（全体に対する割合）。 */
function stepRange(step: ReportDriveStep) {
  const index = REPORT_DRIVE_STEPS.indexOf(step);
  const before = REPORT_DRIVE_STEPS.slice(0, index).reduce((sum, item) => sum + DRIVE_STEP_EXPECTED_MS[item], 0);
  const from = before / TOTAL_EXPECTED_MS;
  const to = (before + DRIVE_STEP_EXPECTED_MS[step] * STEP_PROGRESS_CEILING) / TOTAL_EXPECTED_MS;
  return { from, to };
}

/**
 * 段階が変わるたびに作り直して、その段階の伸びを始めから描く。表示が途中から始まったとき（ほかの画面から移ってきたとき）は、
 * 経過した分だけアニメーションを先に進めておく。経過は描き始めに1回だけ測る（描き直すたびに測ると先へ飛ぶため）。
 */
function ProgressFill({ step, stepStartedAt }: { step: ReportDriveStep; stepStartedAt?: number | undefined }) {
  const [elapsedMs] = useState(() => (stepStartedAt === undefined ? 0 : Math.max(0, Date.now() - stepStartedAt)));
  const { from, to } = stepRange(step);
  const style = {
    '--progress-from': from,
    '--progress-to': to,
    '--progress-duration': `${DRIVE_STEP_EXPECTED_MS[step]}ms`,
    '--progress-delay': `${-elapsedMs}ms`,
  } as CSSProperties;
  return <span className={styles.driveProgressFill} style={style} />;
}

export function DriveSaveSpinner() {
  return <span className={styles.driveSpinner} aria-hidden="true" />;
}

/** 保存できたときの印。保存をその場で見届けたときだけ、チェックを描き足す動きをつける。 */
export function DriveSaveDoneMark({ animate = false }: { animate?: boolean }) {
  return (
    <span className={`${styles.driveMark} ${styles.driveMarkDone}`} data-animate={animate || undefined} aria-hidden="true">
      <svg viewBox="0 0 16 16" focusable="false">
        <path d="M3.5 8.5l3 3 6-6.5" />
      </svg>
    </span>
  );
}

export function DriveSaveFailedMark() {
  return <span className={`${styles.driveMark} ${styles.driveMarkFailed}`} aria-hidden="true">!</span>;
}

/** いまの段階（文字と「1/3」）と、段階ごとに伸びるバー。色だけに頼らず、段階は文字でも示す。 */
export function DriveSaveProgress({ step, stepStartedAt }: { step: ReportDriveStep; stepStartedAt?: number | undefined }) {
  const position = REPORT_DRIVE_STEPS.indexOf(step) + 1;
  const label = `${STEP_LABEL[step]}（${position}/${REPORT_DRIVE_STEPS.length}）`;
  return (
    <div className={styles.driveProgress}>
      <span className={styles.driveProgressLabel}>{label}</span>
      <span
        className={styles.driveProgressTrack}
        role="progressbar"
        aria-label="Googleドライブへの保存"
        aria-valuemin={0}
        aria-valuemax={REPORT_DRIVE_STEPS.length}
        aria-valuenow={position - 1}
        aria-valuetext={label}
      >
        <ProgressFill key={step} step={step} stepStartedAt={stepStartedAt} />
      </span>
    </div>
  );
}
