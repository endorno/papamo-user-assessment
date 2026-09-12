import styles from './ui.module.css';

/**
 * 読み込み中のつなぎ。ヘッダーと同じ形の帯を出して、
 * 本文が入ったときに画面が飛び跳ねないようにする。
 */
export function PageSkeleton({ label = '画面を読み込んでいます' }: { label?: string }) {
  return (
    <div className={styles.skeletonPage}>
      <div className={styles.skeletonHeader}>
        <span className={styles.skeletonMark} aria-hidden="true">育</span>
        <span className={styles.skeletonBrand}>育ちマップ</span>
      </div>
      <div className={styles.skeletonMain} aria-label={label} aria-live="polite">
        <span className={styles.skeletonLine} />
        <span className={`${styles.skeletonPanel} ${styles.shimmer}`} />
        <span className={`${styles.skeletonPanel} ${styles.shimmer}`} />
      </div>
    </div>
  );
}
