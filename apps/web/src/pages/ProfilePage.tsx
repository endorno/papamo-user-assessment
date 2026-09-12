import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import { meResponseSchema } from '@papamo/shared';
import { apiRequest } from '../api/client';
import { useMe } from '../app/MeContext';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/Toast';
import styles from '../styles/page.module.css';

export function ProfilePage() {
  const { session } = useAuth();
  const { me, setMe } = useMe();
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(me?.displayName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const response = await apiRequest<unknown>('/me', session, {
        method: 'PUT',
        body: JSON.stringify({ displayName }),
      });
      const parsed = meResponseSchema.safeParse(response);
      if (!parsed.success) throw new Error('保存結果を読み込めませんでした。');
      setMe(parsed.data);
      setDisplayName(parsed.data.displayName ?? '');
      showToast('表示名を保存しました。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '表示名を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: '表示名の変更' }]} />
      <main className={styles.page}>
        <section className={`${styles.panel} ${styles.narrowPanel}`} aria-labelledby="profile-title">
          <p className={styles.eyebrow}>コーチ設定</p>
          <h1 id="profile-title">表示名の変更</h1>
          <p className={styles.lead}>保護者向けレポートの「担当」に表示されます。</p>
          {me ? (
            <form className={styles.profileForm} onSubmit={(event) => void save(event)}>
              <div className={styles.formField}>
                <label htmlFor="profile-email">ログイン中のメールアドレス</label>
                <input id="profile-email" value={me.email} readOnly />
                <small>アカウント情報の変更はコーチ管理サイトで行ってください。</small>
              </div>
              <div className={styles.formField}>
                <label htmlFor="profile-name">表示名</label>
                <input id="profile-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={30} required />
              </div>
              {error ? <p className={styles.formError} role="alert">{error}</p> : null}
              <div className={styles.formActions}>
                <Link className={styles.secondaryButton} to="/">一覧に戻る</Link>
                <button className={styles.primaryButton} type="submit" disabled={saving || !displayName.trim()}>{saving ? '保存中…' : '表示名を保存'}</button>
              </div>
            </form>
          ) : <p className={styles.muted}>読み込み中…</p>}
        </section>
      </main>
    </div>
  );
}
