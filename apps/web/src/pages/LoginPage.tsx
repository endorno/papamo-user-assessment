import { useState } from 'react';

import { useAuth } from '../auth/SupabaseAuthProvider';
import styles from '../styles/auth.module.css';

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  async function handleLogin() {
    setSigningIn(true);
    setError(await signInWithGoogle());
    setSigningIn(false);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            育
          </span>
          <span>へやすぽ 育ちマップ</span>
        </div>
        <p className={styles.eyebrow}>コーチ向けアセスメント・レポートツール</p>
        <h1 id="login-title">コーチとしてログイン</h1>
        <p className={styles.description}>
          へやすぽ コーチ管理と同じ Google アカウントでログインできます。
        </p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={handleLogin}
          disabled={signingIn}
        >
          {signingIn ? 'ログイン中…' : 'Google でログイン'}
        </button>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.notice}>
          コーチの追加・変更・退職の手続きは、コーチ管理サイトで行ってください。
        </p>
      </section>
    </main>
  );
}
