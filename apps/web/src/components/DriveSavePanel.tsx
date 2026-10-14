import { Link, useLocation } from 'react-router';

import type { DriveSaveTask } from '../app/DriveSaveContext';
import { DriveSaveDoneMark, DriveSaveFailedMark, DriveSaveProgress, DriveSaveSpinner } from './DriveSaveProgress';
import styles from './ui.module.css';

function PanelItem({ task, onHide }: { task: DriveSaveTask; onHide: () => void }) {
  const title = {
    saving: 'Googleドライブに保存中',
    saved: 'Googleドライブに保存しました',
    failed: 'Googleドライブに保存できませんでした',
  }[task.status];
  return (
    <section className={styles.drivePanelItem} data-status={task.status} aria-label={`${task.label}のレポートの保存`}>
      <div className={styles.drivePanelHead}>
        {task.status === 'saving' ? <DriveSaveSpinner /> : null}
        {task.status === 'saved' ? <DriveSaveDoneMark animate /> : null}
        {task.status === 'failed' ? <DriveSaveFailedMark /> : null}
        <strong>{title}</strong>
        <button
          className={styles.drivePanelClose}
          type="button"
          aria-label={task.status === 'saving' ? '閉じる（保存は続きます）' : '閉じる'}
          title={task.status === 'saving' ? '閉じても保存は続きます' : undefined}
          onClick={onHide}
        >
          ×
        </button>
      </div>
      <p className={styles.drivePanelLabel}>{task.label}のレポート</p>
      {task.status === 'saving' ? <DriveSaveProgress step={task.step} stepStartedAt={task.stepStartedAt} /> : null}
      {task.status === 'saved' && task.drive?.folderUrl ? (
        <a className={styles.drivePanelAction} href={task.drive.folderUrl} target="_blank" rel="noopener noreferrer">フォルダを開く</a>
      ) : null}
      {task.status === 'failed' ? (
        <>
          <p className={styles.drivePanelMessage}>{task.error?.message}</p>
          {/* 紙面はレポート画面で組み立てるので、保存し直すにはレポートを開く（開くと自動で保存し直す）。 */}
          <Link className={styles.drivePanelAction} to={`/reports/${task.assessmentId}`}>レポートを開いて保存し直す</Link>
        </>
      ) : null}
    </section>
  );
}

/**
 * ほかの画面に移っても、Googleドライブへの保存の進み具合と結果が見えるようにする（画面右上、ヘッダーの下）。
 * そのレポートの画面では紙面の上の帯で同じことを示すので、ここには出さない。
 */
export function DriveSavePanel({ tasks, onHide }: { tasks: Readonly<Record<string, DriveSaveTask>>; onHide: (assessmentId: string) => void }) {
  const { pathname } = useLocation();
  const visible = Object.values(tasks)
    .filter((task) => task.inPanel && pathname !== `/reports/${task.assessmentId}`)
    .sort((left, right) => left.key - right.key);
  return (
    // 読み上げのため、保存が無いときも枠は置いておく（下中央の通知の status と取り違えないよう role は付けない）。
    <div className={styles.drivePanel} aria-live="polite" data-print-hidden>
      {visible.map((task) => <PanelItem key={task.key} task={task} onHide={() => onHide(task.assessmentId)} />)}
    </div>
  );
}
