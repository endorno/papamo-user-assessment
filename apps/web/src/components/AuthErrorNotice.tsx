import type { ApiClientError } from '../api/client';

import styles from './AuthErrorNotice.module.css';

interface AuthErrorNoticeProps {
  error: ApiClientError;
  fullPage?: boolean;
  onRetry: () => void;
  onLoginAgain: () => void;
}

export function AuthErrorNotice({
  error,
  fullPage = false,
  onRetry,
  onLoginAgain,
}: AuthErrorNoticeProps) {
  const Heading = fullPage ? 'h1' : 'h2';
  const content = (
    <div className={styles.card}>
      <p className={styles.eyebrow}>認証エラー（401）</p>
      <Heading className={styles.title}>ログイン状態を確認できませんでした</Heading>
      <p className={styles.lead}>
        Google のログインは完了していますが、アプリの API がログイン情報を受け付けませんでした。
        画面を閉じずに、まず再試行してください。
      </p>
      <div className={styles.help}>
        <h2>解決しないときの確認</h2>
        <ol>
          <li>API と Web をいったん停止します。</li>
          <li>ローカル Supabase を起動したあと、API と Web を再起動します。</li>
          <li>開発中は、Web と API が同じ Supabase（ポート 15421）を参照しているか確認します。</li>
        </ol>
      </div>
      <div className={styles.actions}>
        <button className={styles.primaryButton} type="button" onClick={onRetry}>
          もう一度確認する
        </button>
        <button className={styles.secondaryButton} type="button" onClick={onLoginAgain}>
          ログイン画面からやり直す
        </button>
      </div>
      <details className={styles.details}>
        <summary>エラーの詳細を表示</summary>
        <p>{error.message}</p>
        <p>API 応答: HTTP {error.status}</p>
      </details>
    </div>
  );

  if (fullPage) {
    return <main className={styles.page} role="alert">{content}</main>;
  }

  return <section className={styles.inline} role="alert">{content}</section>;
}
