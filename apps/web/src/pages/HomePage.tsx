import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  childrenResponseSchema,
  EXERCISES,
  todayInJst,
  type ChildView,
  type MeResponse,
} from '@papamo/shared';
import { apiRequest, ApiClientError } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { ChildStatusBadge } from '../components/ChildStatusBadge';
import { formatJapaneseDate, honorificLabel } from '../utils/display';
import styles from '../App.module.css';

type ImportFeedback = { kind: 'success' | 'error'; message: string } | null;

function formatShareCodeInput(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '')
    .slice(0, 8);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

function childActionLabel(child: ChildView) {
  if (child.state?.key === 'draft') return '入力を続ける';
  if (child.state?.key === 'due' || child.state?.key === 'first') return '確認する';
  return '子どもページへ';
}

function ChildCard({ child }: { child: ChildView }) {
  const assessment = child.latestAssessment;
  const exercises = assessment
    ? EXERCISES.filter((exercise) => exercise.core || assessment.unlockExt)
    : [];

  return (
    <Link
      className={`${styles.childCard} ${child.state ? styles[`childCard--${child.state.key}`] : ''}`}
      to={`/children/${child.id}`}
    >
      <div className={styles.childCardTop}>
        <div className={styles.childIdentity}>
          <span className={styles.face} aria-hidden="true">{child.name.charAt(0)}</span>
          <span>
            <strong>{child.name}<small>{honorificLabel(child.honorific)}</small></strong>
            <span className={styles.childMeta}>{child.grade.name}（{child.grade.ageHint}）</span>
          </span>
        </div>
        <ChildStatusBadge state={child.state} />
      </div>
      <div className={styles.levelChips} aria-label={assessment ? `第${assessment.seqNo}回の入力状況` : 'アセスメント未実施'}>
        {assessment ? exercises.map((exercise) => {
          const level = assessment.lv[exercise.key];
          return (
            <span className={level === undefined ? styles.levelChipTodo : styles.levelChip} key={exercise.key}>
              <span aria-hidden="true">{exercise.icon}</span> {level === undefined ? '未入力' : `Lv${level}`}
            </span>
          );
        }) : <span className={styles.cardHint}>初回は基本の3種目から始めます。</span>}
        {assessment && !assessment.unlockExt ? <span className={styles.levelChipLocked}>4・5種目目は未開放</span> : null}
      </div>
      <div className={styles.childCardFooter}>
        <span>{assessment ? `第${assessment.seqNo}回 ${formatJapaneseDate(assessment.assessedOn)}${assessment.status === 'draft' ? '（入力中）' : ''}` : 'アセスメントはまだありません'}</span>
        <strong>{childActionLabel(child)} <span aria-hidden="true">›</span></strong>
      </div>
    </Link>
  );
}

function ChildrenSection({ title, children }: { title: string; children: ChildView[] }) {
  const headingId = title === 'まずやること' ? 'todo-children' : 'settled-children';
  return (
    <section className={styles.listSection} aria-labelledby={headingId}>
      <div className={styles.sectionTitle}>
        <h2 id={headingId}>{title}</h2>
        <span>{children.length}名</span>
      </div>
      <div className={styles.childGrid}>
        {children.map((child) => <ChildCard child={child} key={child.id} />)}
      </div>
    </section>
  );
}

export function HomePage() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [children, setChildren] = useState<ChildView[]>([]);
  const [archivedChildren, setArchivedChildren] = useState<ChildView[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<ImportFeedback>(null);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadChildren = useCallback(async (archived = false) => {
    if (!session) return;
    const response = await apiRequest<unknown>(`/children${archived ? '?archived=1' : ''}`, session);
    const parsed = childrenResponseSchema.safeParse(response);
    if (!parsed.success) throw new Error('お子さま一覧を読み込めませんでした。');
    if (archived) setArchivedChildren(parsed.data.children);
    else setChildren(parsed.data.children);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
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
        setPageError(caught instanceof Error ? caught.message : '一覧を取得できませんでした。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadChildren, navigate, session, signOut]);

  useEffect(() => {
    if (!showArchived || !session) return;
    setArchivedLoading(true);
    void loadChildren(true)
      .catch((caught) => setPageError(caught instanceof Error ? caught.message : 'アーカイブを取得できませんでした。'))
      .finally(() => setArchivedLoading(false));
  }, [loadChildren, session, showArchived]);

  async function importChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || shareCode.length !== 9) return;
    setImporting(true);
    setImportFeedback(null);
    try {
      await apiRequest('/children/import', session, {
        method: 'POST',
        body: JSON.stringify({ code: shareCode }),
      });
      setShareCode('');
      setImportFeedback({ kind: 'success', message: 'お子さまを担当一覧に追加しました。' });
      await loadChildren();
    } catch (caught) {
      setImportFeedback({
        kind: 'error',
        message: caught instanceof Error ? caught.message : '共有コードを確認してください。',
      });
    } finally {
      setImporting(false);
    }
  }

  async function restoreArchived(childId: string) {
    if (!session) return;
    setPageError(null);
    try {
      await apiRequest(`/children/${childId}/unarchive`, session, { method: 'POST' });
      await Promise.all([loadChildren(), loadChildren(true)]);
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : '復元に失敗しました。');
    }
  }

  const todoChildren = children.filter((child) => (child.state?.order ?? 2) < 2);
  const settledChildren = children.filter((child) => (child.state?.order ?? 2) >= 2);

  return (
    <div className={styles.app}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども' }]} coachName={me?.displayName} />
      <main className={styles.main}>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>アセスメント・レポート</p>
            <h1>担当の子ども</h1>
            <p>{formatJapaneseDate(todayInJst())}の状況です。まず必要な記録から確認しましょう。</p>
          </div>
          <div className={styles.pageActions}>
            <button className={styles.secondaryButton} type="button" aria-expanded={showImport} onClick={() => setShowImport((current) => !current)}>
              共有コードで取り込む
            </button>
            <Link className={styles.primaryButton} to="/children/new">＋ 新しいお子さまを登録</Link>
          </div>
        </div>

        {showImport ? (
          <section className={styles.importPanel} aria-labelledby="import-title">
            <div>
              <h2 id="import-title">共有コードで担当に追加</h2>
              <p>別のコーチから受け取った8文字のコードを入力してください。</p>
            </div>
            <form className={styles.importForm} onSubmit={(event) => void importChild(event)}>
              <label htmlFor="share-code">共有コード</label>
              <div>
                <input
                  id="share-code"
                  value={shareCode}
                  onChange={(event) => setShareCode(formatShareCodeInput(event.target.value))}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  inputMode="text"
                />
                <button className={styles.primaryButton} type="submit" disabled={shareCode.length !== 9 || importing}>
                  {importing ? '取り込み中…' : '取り込む'}
                </button>
              </div>
            </form>
            {importFeedback ? (
              <p className={importFeedback.kind === 'error' ? styles.error : styles.success} role={importFeedback.kind === 'error' ? 'alert' : 'status'}>
                {importFeedback.message}
              </p>
            ) : null}
          </section>
        ) : null}

        {pageError ? (
          <div className={styles.errorBanner} role="alert">
            <p>{pageError}</p>
            <button type="button" onClick={() => window.location.reload()}>もう一度読み込む</button>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loadingGrid} aria-label="担当のお子さまを読み込み中" aria-live="polite">
            <div /><div /><div />
          </div>
        ) : children.length ? (
          <>
            {todoChildren.length ? <ChildrenSection title="まずやること" children={todoChildren} /> : (
              <section className={styles.allDone}>
                <strong>いま対応が必要な記録はありません</strong>
                <p>次回予定が近づくと、ここに表示されます。</p>
              </section>
            )}
            {settledChildren.length ? <ChildrenSection title="次の予定まで余裕あり" children={settledChildren} /> : null}
          </>
        ) : (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">🧭</span>
            <h2>最初のお子さまを登録しましょう</h2>
            <p>登録後、そのまま初回アセスメントを始められます。</p>
            <Link className={styles.primaryButton} to="/children/new">お子さまを登録する</Link>
          </section>
        )}

        <section className={styles.archiveSection} aria-labelledby="archive-heading">
          <button className={styles.archiveToggle} type="button" onClick={() => setShowArchived((current) => !current)} aria-expanded={showArchived}>
            <span aria-hidden="true">{showArchived ? '▾' : '▸'}</span>
            <span id="archive-heading">アーカイブした子ども{showArchived && !archivedLoading ? `（${archivedChildren.length}名）` : ''}</span>
          </button>
          {showArchived ? (
            archivedLoading ? <p className={styles.muted}>読み込み中…</p> : archivedChildren.length ? (
              <div className={styles.archivedList}>
                {archivedChildren.map((child) => (
                  <div className={styles.archivedCard} key={child.id}>
                    <Link to={`/children/${child.id}`}>
                      <strong>{child.name}{honorificLabel(child.honorific)}</strong>
                      <span>{child.grade.name}・アーカイブ中</span>
                    </Link>
                    {child.role === 'owner' ? <button type="button" onClick={() => void restoreArchived(child.id)}>復元</button> : <span>オーナーのみ復元できます</span>}
                  </div>
                ))}
              </div>
            ) : <p className={styles.muted}>アーカイブしたお子さまはいません。</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
