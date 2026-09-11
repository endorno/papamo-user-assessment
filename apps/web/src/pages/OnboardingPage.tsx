import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import styles from '../styles/auth.module.css';

export function OnboardingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await apiRequest('/me', session, {
        method: 'PUT',
        body: JSON.stringify({ displayName }),
      });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="onboarding-title">
        <p className={styles.eyebrow}>はじめに</p>
        <h1 id="onboarding-title">表示名を登録してください</h1>
        <p className={styles.description}>
          レポートの担当者名として表示されます。あとから変更できます。
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="display-name">表示名</label>
          <input
            id="display-name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={30}
            autoComplete="name"
            placeholder="さとうコーチ"
            required
          />
          <button className={styles.primaryButton} type="submit" disabled={saving}>
            {saving ? '保存中…' : '登録して始める'}
          </button>
        </form>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
