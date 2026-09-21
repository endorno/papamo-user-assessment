import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  childImportResponseSchema,
  childrenResponseSchema,
  EXERCISES,
  LEVEL_NOT_MEASURED,
  LEVEL_NOT_POSSIBLE,
  sampleChildCreateResponseSchema,
  sampleDataStatusResponseSchema,
  todayInJst,
  type ChildView,
  type SampleDataProfile,
  type SampleDataStatusResponse,
} from '@papamo/shared';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { ChildStatusBadge } from '../components/ChildStatusBadge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { formatJapaneseDate, honorificLabel } from '../utils/display';
import styles from '../App.module.css';

/** これ以上増えると目で探すのが辛くなるので、しぼり込みを出す。 */
const FILTER_THRESHOLD = 8;
const SAMPLE_PROFILE_CYCLE: SampleDataProfile[] = [
  'long', 'long', 'long', 'long', 'long', 'long', 'long',
  'short', 'short', 'new',
];
const SAMPLE_CREATE_CONCURRENCY = 3;

function randomSampleProfile(): SampleDataProfile {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  const percentage = (value[0] ?? 0) % 10;
  if (percentage < 7) return 'long';
  if (percentage < 9) return 'short';
  return 'new';
}

function sampleProfiles(count: number): SampleDataProfile[] {
  if (count === 1) return [randomSampleProfile()];
  return Array.from({ length: count }, (_, index) => SAMPLE_PROFILE_CYCLE[index % SAMPLE_PROFILE_CYCLE.length]!);
}

function formatShareCodeInput(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]/g, '')
    .slice(0, 8);
  return normalized.length > 4 ? `${normalized.slice(0, 4)}-${normalized.slice(4)}` : normalized;
}

function childActionLabel(child: ChildView) {
  if (child.state?.key === 'draft') return '入力を続ける';
  if (child.state?.key === 'first') return '初回を始める';
  if (child.state?.key === 'due') return '確認する';
  return '子どもページへ';
}

/** 入力中の回はカードから直接その回を開く。ラベルと行き先を一致させる。 */
function childLinkTarget(child: ChildView) {
  const assessment = child.latestAssessment;
  return child.state?.key === 'draft' && assessment?.status === 'draft'
    ? `/assessments/${assessment.id}`
    : `/children/${child.id}`;
}

function ChildCard({ child, highlighted }: { child: ChildView; highlighted: boolean }) {
  const assessment = child.latestAssessment;
  const exercises = assessment
    ? EXERCISES.filter((exercise) => exercise.core || assessment.unlockExt)
    : [];

  return (
    <Link
      className={[
        styles.childCard,
        child.state ? styles[`childCard--${child.state.key}`] : '',
        highlighted ? styles.childCardHighlight : '',
      ].filter(Boolean).join(' ')}
      to={childLinkTarget(child)}
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
          // -1 実施不可 / 0 未実施 は Lv 表記にしない。
          const label = level === undefined ? '未入力'
            : level === LEVEL_NOT_POSSIBLE ? '実施不可'
              : level === LEVEL_NOT_MEASURED ? '未実施'
                : `Lv${level}`;
          return (
            <span className={level === undefined ? styles.levelChipTodo : styles.levelChip} key={exercise.key}>
              <span aria-hidden="true">{exercise.icon}</span> {label}
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

function ChildrenSection({
  title,
  children,
  highlightedId,
}: {
  title: string;
  children: ChildView[];
  highlightedId: string | null;
}) {
  const headingId = title === '初回アセスメント未実施'
    ? 'new-children'
    : title === 'まずやること'
      ? 'todo-children'
      : 'settled-children';
  return (
    <section className={styles.listSection} aria-labelledby={headingId}>
      <div className={styles.sectionTitle}>
        <h2 id={headingId}>{title}</h2>
        <span>{children.length}名</span>
      </div>
      <div className={styles.childGrid}>
        {children.map((child) => (
          <ChildCard child={child} highlighted={child.id === highlightedId} key={child.id} />
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [children, setChildren] = useState<ChildView[]>([]);
  const [archivedChildren, setArchivedChildren] = useState<ChildView[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [pageError, setPageError] = useState<string | null>(null);
  const [sampleDataStatus, setSampleDataStatus] = useState<SampleDataStatusResponse | null>(null);
  const [sampleCount, setSampleCount] = useState<number | null>(null);
  const [sampleProgress, setSampleProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [generatingSamples, setGeneratingSamples] = useState(false);

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
    void loadChildren()
      .catch((caught: unknown) => {
        if (active) setPageError(caught instanceof Error ? caught.message : '一覧を取得できませんでした。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadChildren, session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void apiRequest<unknown>('/dev-tools/sample-data', session)
      .then((response) => {
        const parsed = sampleDataStatusResponseSchema.safeParse(response);
        if (active && parsed.success) setSampleDataStatus(parsed.data);
      })
      .catch(() => {
        // 本番の404を含め、機能が無効な環境では何も表示しない。
      });
    return () => {
      active = false;
    };
  }, [session]);

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
    setImportError(null);
    try {
      const response = await apiRequest<unknown>('/children/import', session, {
        method: 'POST',
        body: JSON.stringify({ code: shareCode }),
      });
      const parsed = childImportResponseSchema.safeParse(response);
      if (!parsed.success) throw new Error('取り込み結果を読み込めませんでした。');
      const { child, ownershipTransferred } = parsed.data;
      const childName = `${child.name}${honorificLabel(child.honorific)}`;
      setShareCode('');
      setShowImport(false);
      setHighlightedId(child.id);
      showToast(
        ownershipTransferred
          ? `${childName}のオーナーになりました。前のオーナーは担当メンバーになります。`
          : `${childName}を担当に追加しました。`,
        { action: { label: 'ページを開く', onClick: () => void navigate(`/children/${child.id}`) } },
      );
      await loadChildren();
    } catch (caught) {
      setImportError(caught instanceof Error ? caught.message : '共有コードを確認してください。');
    } finally {
      setImporting(false);
    }
  }

  async function restoreArchived(child: ChildView) {
    if (!session) return;
    setPageError(null);
    try {
      await apiRequest(`/children/${child.id}/unarchive`, session, { method: 'POST' });
      setHighlightedId(child.id);
      showToast(`${child.name}${honorificLabel(child.honorific)}を担当一覧に戻しました。`);
      await Promise.all([loadChildren(), loadChildren(true)]);
    } catch (caught) {
      setPageError(caught instanceof Error ? caught.message : '復元に失敗しました。');
    }
  }

  async function createSampleChildren() {
    if (!session || !sampleCount || generatingSamples) return;

    const currentSession = session;
    const profiles = sampleProfiles(sampleCount);
    let nextIndex = 0;
    let completed = 0;
    let failed = 0;
    setGeneratingSamples(true);
    setSampleError(null);
    setSampleProgress({ completed: 0, total: profiles.length, failed: 0 });

    async function worker() {
      while (nextIndex < profiles.length) {
        const index = nextIndex;
        nextIndex += 1;
        const profile = profiles[index]!;
        try {
          const response = await apiRequest<unknown>('/dev-tools/sample-child', currentSession, {
            method: 'POST',
            body: JSON.stringify({ profile }),
          });
          if (!sampleChildCreateResponseSchema.safeParse(response).success) {
            throw new Error('生成結果を読み込めませんでした。');
          }
        } catch {
          failed += 1;
        } finally {
          completed += 1;
          setSampleProgress({ completed, total: profiles.length, failed });
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(SAMPLE_CREATE_CONCURRENCY, profiles.length) }, () => worker()),
      );
      await loadChildren();
      const succeeded = profiles.length - failed;
      if (failed > 0) {
        setSampleError(`${succeeded}名を追加し、${failed}名は失敗しました。もう一度実行すると追加分だけ増えます。`);
      }
      showToast(`${succeeded}名のサンプルを追加しました。`);
    } catch (caught) {
      setSampleError(caught instanceof Error ? caught.message : '一覧を更新できませんでした。');
    } finally {
      setGeneratingSamples(false);
      setSampleCount(null);
    }
  }

  // 取り込み・復元の直後だけ場所を示す。ずっと光らせない。
  useEffect(() => {
    if (!highlightedId) return;
    const timer = window.setTimeout(() => setHighlightedId(null), 6000);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  const keyword = filter.trim();
  const matches = useCallback(
    (child: ChildView) => !keyword || child.name.includes(keyword),
    [keyword],
  );
  const visibleChildren = useMemo(() => children.filter(matches), [children, matches]);
  const visibleArchived = useMemo(() => archivedChildren.filter(matches), [archivedChildren, matches]);
  const newChildren = visibleChildren.filter((child) => child.latestAssessment === null);
  const todoChildren = visibleChildren.filter((child) => child.latestAssessment !== null && (child.state?.order ?? 2) < 2);
  const settledChildren = visibleChildren.filter((child) => (child.state?.order ?? 2) >= 2);
  const showFilter = children.length >= FILTER_THRESHOLD;

  return (
    <div className={styles.app}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども' }]} />
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
            {importError ? <p className={styles.error} role="alert">{importError}</p> : null}
          </section>
        ) : null}

        {pageError ? (
          <div className={styles.errorBanner} role="alert">
            <p>{pageError}</p>
            <button type="button" onClick={() => window.location.reload()}>もう一度読み込む</button>
          </div>
        ) : null}

        {showFilter ? (
          <div className={styles.filterRow}>
            <label htmlFor="child-filter" className={styles.eyebrow}>お名前でしぼり込む</label>
            <input
              id="child-filter"
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="例：そうた"
              autoComplete="off"
            />
            <span aria-live="polite">{keyword ? `${visibleChildren.length}名を表示中` : `${children.length}名`}</span>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loadingGrid} aria-label="担当のお子さまを読み込み中" aria-live="polite">
            <div /><div /><div />
          </div>
        ) : !children.length ? (
          <section className={styles.emptyState}>
            <span className={styles.emptyIcon} aria-hidden="true">🧭</span>
            <h2>最初のお子さまを登録しましょう</h2>
            <p>登録したお子さまは、一覧の最上段から初回アセスメントを始められます。</p>
            <Link className={styles.primaryButton} to="/children/new">お子さまを登録する</Link>
          </section>
        ) : !visibleChildren.length ? (
          <section className={styles.allDone}>
            <strong>「{keyword}」に一致するお子さまはいません</strong>
            <p>お名前の一部で探せます。</p>
          </section>
        ) : (
          <>
            {newChildren.length ? <ChildrenSection title="初回アセスメント未実施" children={newChildren} highlightedId={highlightedId} /> : null}
            {todoChildren.length ? <ChildrenSection title="まずやること" children={todoChildren} highlightedId={highlightedId} /> : !newChildren.length ? (
              <section className={styles.allDone}>
                <strong>いま対応が必要な記録はありません</strong>
                <p>次回予定が近づくと、ここに表示されます。</p>
              </section>
            ) : null}
            {settledChildren.length ? <ChildrenSection title="次の予定まで余裕あり" children={settledChildren} highlightedId={highlightedId} /> : null}
          </>
        )}

        <section className={styles.archiveSection} aria-labelledby="archive-heading">
          <button className={styles.archiveToggle} type="button" onClick={() => setShowArchived((current) => !current)} aria-expanded={showArchived}>
            <span aria-hidden="true">{showArchived ? '▾' : '▸'}</span>
            <span id="archive-heading">アーカイブした子ども{showArchived && !archivedLoading ? `（${archivedChildren.length}名）` : ''}</span>
          </button>
          {showArchived ? (
            archivedLoading ? <p className={styles.muted}>読み込み中…</p> : visibleArchived.length ? (
              <div className={styles.archivedList}>
                {visibleArchived.map((child) => (
                  <div className={styles.archivedCard} key={child.id}>
                    <Link to={`/children/${child.id}`}>
                      <strong>{child.name}{honorificLabel(child.honorific)}</strong>
                      <span>{child.grade.name}・アーカイブ中</span>
                    </Link>
                    {child.role === 'owner' ? <button type="button" onClick={() => void restoreArchived(child)}>復元</button> : <span>オーナーのみ復元できます</span>}
                  </div>
                ))}
              </div>
            ) : <p className={styles.muted}>{archivedChildren.length ? `「${keyword}」に一致するお子さまはいません。` : 'アーカイブしたお子さまはいません。'}</p>
          ) : null}
        </section>

        {sampleDataStatus ? (
          <details className={styles.devToolsPanel}>
            <summary>開発用：サンプルデータ</summary>
            <div className={styles.devToolsContent}>
              <p>
                ログイン中のコーチに、架空のお子さまと履歴を追加します。10名につき
                「3年分×7名・短期×2名・新規×1名」の構成です。
              </p>
              {sampleDataStatus.ready ? (
                <div className={styles.devToolsActions}>
                  {sampleDataStatus.presets.map((count) => (
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={generatingSamples}
                      onClick={() => {
                        setSampleError(null);
                        setSampleCount(count);
                      }}
                      key={count}
                    >
                      {count}名追加
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.devToolsNotice} role="status">
                  背景コーチが{sampleDataStatus.backgroundCoachCount}名です。先に
                  <code>pnpm --filter api db:seed:local</code> を実行してください。
                </p>
              )}
              {generatingSamples ? (
                <p className={styles.devToolsProgress} role="status" aria-live="polite">
                  生成中 {sampleProgress.completed}/{sampleProgress.total}
                  {sampleProgress.failed ? `（失敗 ${sampleProgress.failed}）` : ''}
                </p>
              ) : null}
              {sampleError ? <p className={styles.error} role="alert">{sampleError}</p> : null}
            </div>
          </details>
        ) : null}
      </main>
      <ConfirmDialog
        open={sampleCount !== null}
        title={`${sampleCount ?? 0}名のサンプルを追加しますか？`}
        message="既存データは削除せず、架空のお子さまとアセスメント履歴を追加します。"
        confirmLabel="追加する"
        tone="primary"
        busy={generatingSamples}
        detail={generatingSamples ? `生成中 ${sampleProgress.completed}/${sampleProgress.total}` : null}
        error={sampleError}
        onCancel={() => setSampleCount(null)}
        onConfirm={() => void createSampleChildren()}
      />
    </div>
  );
}
