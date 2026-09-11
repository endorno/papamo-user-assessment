import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { apiRequest, ApiClientError } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { childrenResponseSchema, type ChildView, type MeResponse } from '@papamo/shared';
import styles from '../App.module.css';

type HealthState = 'idle' | 'checking' | 'ok' | 'error';

function honorificLabel(honorific: ChildView['honorific']) {
  return honorific === 'kun' ? 'くん' : honorific === 'chan' ? 'ちゃん' : 'さん';
}

function stateLabel(child: ChildView) {
  if (typeof child.state === 'object' && child.state && 'label' in child.state) {
    return String(child.state.label);
  }
  return '初回アセスメント未実施';
}

export function HomePage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [children, setChildren] = useState<ChildView[]>([]);
  const [archivedChildren, setArchivedChildren] = useState<ChildView[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [healthState, setHealthState] = useState<HealthState>('idle');

  async function loadChildren(archived = false) {
    if (!session) return;
    const response = await apiRequest<unknown>(`/children${archived ? '?archived=1' : ''}`, session);
    const parsed = childrenResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error('お子さま一覧を読み込めませんでした。');
    if (archived) setArchivedChildren(parsed.data.children);
    else setChildren(parsed.data.children);
  }

  useEffect(() => {
    if (!session) return;
    let active = true;
    void apiRequest<MeResponse>('/me', session)
      .then(async (profile) => {
        if (!active) return;
        if (!profile.displayName) {
          navigate('/onboarding', { replace: true });
          return;
        }
        setMe(profile);
        await loadChildren();
      })
      .catch(async (caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiClientError && caught.status === 401) {
          await signOut();
          navigate('/login', { replace: true });
          return;
        }
        setProfileError(caught instanceof Error ? caught.message : 'コーチ情報を取得できませんでした。');
      });
    return () => {
      active = false;
    };
  }, [navigate, session, signOut]);

  useEffect(() => {
    if (!showArchived || !session) return;
    void loadChildren(true).catch((caught) => setProfileError(caught instanceof Error ? caught.message : 'アーカイブを取得できませんでした。'));
  }, [session, showArchived]);

  async function importChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !shareCode.trim()) return;
    setImportMessage('取り込み中…');
    try {
      await apiRequest('/children/import', session, {
        method: 'POST',
        body: JSON.stringify({ code: shareCode }),
      });
      setShareCode('');
      setImportMessage('お子さまを一覧に追加しました。');
      await loadChildren();
    } catch (caught) {
      setImportMessage(caught instanceof Error ? caught.message : '共有コードを確認してください。');
    }
  }

  async function restoreArchived(childId: string) {
    if (!session) return;
    try {
      await apiRequest(`/children/${childId}/unarchive`, session, { method: 'POST' });
      await Promise.all([loadChildren(), loadChildren(true)]);
    } catch (caught) {
      setProfileError(caught instanceof Error ? caught.message : '復元に失敗しました。');
    }
  }

  async function checkApiHealth() {
    setHealthState('checking');
    try {
      const response = await fetch('/api/health');
      setHealthState(response.ok ? 'ok' : 'error');
    } catch {
      setHealthState('error');
    }
  }

  const statusMessage = {
    idle: 'まだ接続確認をしていません。',
    checking: 'API に接続しています。',
    ok: 'API に接続できました。',
    error: 'API に接続できませんでした。起動状態を確認してください。',
  }[healthState];

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">育</span>
            <span>へやすぽ 育ちマップ</span>
          </div>
          <div className={styles.account}>
            <span>{me?.displayName ?? '読み込み中…'}</span>
            <Link className={styles.accountLink} to="/children/new">＋ 新しいお子さまを登録</Link>
            <button type="button" onClick={() => void signOut()}>ログアウト</button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="welcome-title">
          <p className={styles.eyebrow}>アセスメント・レポートツール</p>
          <h1 id="welcome-title">コーチの記録を、保護者への次の一歩へ。</h1>
          <p className={styles.description}>子どもの現在地を見渡し、次の3か月のレッスンにつなげます。</p>
          {profileError ? <p className={styles.error} role="alert">{profileError}</p> : null}

          {children.length ? (
            <div className={styles.childList} aria-label="担当のお子さま">
              {children.map((child) => (
                <Link className={styles.childCard} key={child.id} to={`/children/${child.id}`}>
                  <span>
                    <strong>{child.name}{honorificLabel(child.honorific)}</strong>
                    <small>{child.grade.name}（{child.grade.ageHint}）</small>
                  </span>
                  <span className={styles.childState}>{stateLabel(child)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>担当のお子さまはまだ登録されていません。</p>
              <Link className={styles.primaryButton} to="/children/new">最初のお子さまを登録する</Link>
            </div>
          )}

          <section className={styles.importPanel} aria-labelledby="import-title">
            <h2 id="import-title">共有コードで取り込む</h2>
            <p>別のコーチから受け取ったコードを入力してください。</p>
            <form className={styles.importForm} onSubmit={(event) => void importChild(event)}>
              <input value={shareCode} onChange={(event) => setShareCode(event.target.value)} placeholder="XXXX-XXXX" aria-label="共有コード" />
              <button className={styles.primaryButton} type="submit" disabled={!shareCode.trim()}>取り込む</button>
            </form>
            {importMessage ? <p className={styles.formMessage} role="status">{importMessage}</p> : null}
          </section>

          <section className={styles.archiveSection} aria-labelledby="archive-title">
            <button className={styles.archiveToggle} type="button" onClick={() => setShowArchived((current) => !current)} aria-expanded={showArchived}>
              {showArchived ? '▾' : '▸'} アーカイブ済みを表示
            </button>
            {showArchived ? (
              archivedChildren.length ? (
                <div className={styles.childList} id="archive-title">
                  {archivedChildren.map((child) => (
                    <div className={styles.archivedCard} key={child.id}>
                      <Link className={styles.childCard} to={`/children/${child.id}`}>
                        <span><strong>{child.name}{honorificLabel(child.honorific)}</strong><small>{child.grade.name}</small></span>
                        <span className={styles.childState}>アーカイブ中</span>
                      </Link>
                      {child.role === 'owner' ? <button className={styles.restoreButton} type="button" onClick={() => void restoreArchived(child.id)}>復元</button> : null}
                    </div>
                  ))}
                </div>
              ) : <p className={styles.muted}>アーカイブ済みのお子さまはいません。</p>
            ) : null}
          </section>

          <div className={styles.actions}>
            <button className={styles.primaryButton} type="button" onClick={() => void checkApiHealth()} disabled={healthState === 'checking'}>
              {healthState === 'checking' ? '確認中…' : 'API 接続を確認'}
            </button>
          </div>
          <p className={styles.status} role="status" aria-live="polite">
            <span className={`${styles.statusDot} ${styles[`statusDot--${healthState}`]}`} aria-hidden="true" />
            {statusMessage}
          </p>
        </section>
      </main>
    </div>
  );
}
