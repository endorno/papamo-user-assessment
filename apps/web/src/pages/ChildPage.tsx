import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { childDetailSchema, exerciseByKey, type ChildDetail } from '@papamo/shared';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RadarChart } from '../components/RadarChart';
import styles from '../styles/page.module.css';

function honorificLabel(honorific: ChildDetail['honorific']) {
  return honorific === 'kun' ? 'くん' : honorific === 'chan' ? 'ちゃん' : 'さん';
}

function readChild(value: unknown): ChildDetail {
  const parsed = childDetailSchema.safeParse((value as { child?: unknown }).child);
  if (!parsed.success) {
    throw new Error('子ども情報を読み込めませんでした。');
  }
  return parsed.data;
}

export function ChildPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalsText, setGoalsText] = useState('');
  const [unlockExtRequested, setUnlockExtRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'start' | 'archive' | 'remove' | 'delete' | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    let active = true;
    void apiRequest<unknown>(`/children/${id}`, session)
      .then((response) => {
        if (!active) return;
        const loaded = readChild(response);
        setChild(loaded);
        setGoalsText(loaded.goals.join('\n'));
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。');
      });
    return () => {
      active = false;
    };
  }, [id, session]);

  async function reload() {
    if (!session || !id) return;
    const response = await apiRequest<unknown>(`/children/${id}`, session);
    const loaded = readChild(response);
    setChild(loaded);
    setGoalsText(loaded.goals.join('\n'));
  }

  async function startAssessment() {
    if (!session || !id || !child || child.archivedAt) return;
    setBusy(true);
    try {
      const response = await apiRequest<unknown>(`/children/${id}/assessments`, session, {
        method: 'POST',
        body: JSON.stringify({ unlockExt: child.extUnlocked || unlockExtRequested }),
      });
      navigate(`/assessments/${(response as { assessment: { id: string } }).assessment.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'アセスメントを開始できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function saveGoals() {
    if (!session || !id) return;
    const goals = goalsText.split('\n').map((goal) => goal.trim()).filter(Boolean);
    setBusy(true);
    try {
      await apiRequest(`/children/${id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ goals }),
      });
      await reload();
      setEditingGoals(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '目標を保存できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!session || !id) return;
    setBusy(true);
    try {
      await apiRequest(`/children/${id}/archive`, session, { method: 'POST' });
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'アーカイブに失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (!session || !id) return;
    setBusy(true);
    try {
      await apiRequest(`/children/${id}/unarchive`, session, { method: 'POST' });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '復元に失敗しました。');
    } finally {
      setBusy(false);
    }
  }

  async function removeMembership() {
    if (!session || !id) return;
    setBusy(true);
    try {
      await apiRequest(`/children/${id}/membership`, session, { method: 'DELETE' });
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '一覧から外せませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function deleteChild() {
    if (!session || !id) return;
    setBusy(true);
    try {
      await apiRequest(`/children/${id}`, session, { method: 'DELETE' });
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '削除できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className={styles.page}><p className={styles.error} role="alert">{error}</p></main>;
  if (!child) return <main className={styles.page}><p>読み込み中…</p></main>;

  const latestAssessment = [...child.assessments].reverse().find((assessment) => assessment.status === 'done' && assessment.reportAvailable);
  const readOnly = Boolean(child.archivedAt);
  const report = child.latestReport;

  function confirmPendingAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'start') void startAssessment();
    if (action === 'archive') void archive();
    if (action === 'remove') void removeMembership();
    if (action === 'delete') void deleteChild();
  }

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <Link to="/" className={styles.backLink}>← 一覧に戻る</Link>
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>{readOnly ? 'アーカイブ中・閲覧のみ' : '担当のお子さま'}</p>
            <h1>{child.name}{honorificLabel(child.honorific)}</h1>
            <p className={styles.muted}>{child.grade.name}（{child.grade.ageHint}）・入会 {child.joinedOn}</p>
          </div>
          {!readOnly ? (
            <div className={styles.headerActions}>
              {!child.extUnlocked ? (
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={unlockExtRequested} onChange={(event) => setUnlockExtRequested(event.target.checked)} />
                  4・5種目目を今回から開放
                </label>
              ) : null}
              <button className={styles.primaryButton} type="button" onClick={() => setConfirmAction('start')} disabled={busy}>アセスメントを始める</button>
            </div>
          ) : child.role === 'owner' ? (
            <button className={styles.secondaryButton} type="button" onClick={() => void restore()} disabled={busy}>アーカイブから復元</button>
          ) : null}
        </div>

        <section className={styles.panel} aria-labelledby="goals-title">
          <div className={styles.sectionHeader}>
            <h2 id="goals-title">今期の目標</h2>
            {!readOnly && !editingGoals ? <button className={styles.secondaryButton} type="button" onClick={() => setEditingGoals(true)}>編集</button> : null}
          </div>
          {editingGoals ? (
            <>
              <textarea value={goalsText} onChange={(event) => setGoalsText(event.target.value)} rows={4} aria-label="目標（1行1項目）" />
              <div className={styles.inlineActions}>
                <button className={styles.primaryButton} type="button" onClick={() => void saveGoals()} disabled={busy}>保存</button>
                <button className={styles.secondaryButton} type="button" onClick={() => { setGoalsText(child.goals.join('\n')); setEditingGoals(false); }}>キャンセル</button>
              </div>
            </>
          ) : child.goals.length ? <ul>{child.goals.map((goal) => <li key={goal}>{goal}</li>)}</ul> : <p className={styles.muted}>目標はまだ登録されていません。</p>}
        </section>

        <section className={styles.panel} aria-labelledby="map-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="map-title">育ちマップ</h2><p className={styles.muted}>直近の完了アセスメント</p></div>
            {latestAssessment ? <Link className={styles.secondaryButton} to={`/reports/${latestAssessment.id}`}>レポートを見る</Link> : null}
          </div>
          <RadarChart report={report} extUnlocked={child.extUnlocked} />
          {report ? <div className={styles.levelSummary} aria-label="種目ごとの到達レベル">
            {report.levels.map((level) => <div key={level.key}><span>{exerciseByKey(level.key).name}</span><strong>Lv{level.lv}</strong><small>{level.delta === undefined ? '初回' : `${level.delta >= 0 ? '▲' : '▼'}${Math.abs(level.delta)}`}</small></div>)}
          </div> : null}
          {!report ? <p className={styles.muted}>完了したアセスメントがあると、現在地が表示されます。</p> : null}
        </section>

        {report ? (
          <section className={styles.panel} aria-labelledby="strategy-title">
            <div className={styles.sectionHeader}><div><h2 id="strategy-title">今期のレッスン戦略</h2><p className={styles.muted}>{report.plan?.name ?? '計画未設定'}</p></div></div>
            <div className={styles.strategyList}>
              {report.coach.strategies.map((strategy) => {
                const exercise = exerciseByKey(strategy.key);
                return (
                  <article className={styles.strategyCard} key={strategy.key}>
                    <strong>{exercise.parentName} Lv{strategy.lv}</strong>
                    <p>次は Lv{strategy.nextLv}：{strategy.nextLabel}</p>
                    {strategy.errs.length ? <small>観察ポイント：{strategy.errs.join('、')}</small> : null}
                  </article>
                );
              })}
            </div>
            {report.coach.memo ? <p className={styles.memo}>{report.coach.memo}</p> : null}
          </section>
        ) : null}

        {report ? (
          <section className={styles.panel} aria-labelledby="observation-title">
            <div className={styles.sectionHeader}><h2 id="observation-title">困りごと・ご家庭の負担</h2></div>
            {report.troubles.current.length ? <ul>{report.troubles.current.map((trouble) => <li key={trouble}>{trouble}</li>)}</ul> : <p className={styles.muted}>困りごとは登録されていません。</p>}
            <div className={styles.ppiSummary}>
              {Object.entries(report.ppi.current).map(([key, value]) => <span key={key}><strong>{value}</strong><small>{key}</small></span>)}
            </div>
          </section>
        ) : null}

        <section className={styles.panel} aria-labelledby="history-title">
          <div className={styles.sectionHeader}><h2 id="history-title">アセスメント履歴</h2></div>
          {child.assessments.length ? (
            <ol className={styles.assessmentTimeline}>
              {child.assessments.map((assessment) => (
                <li key={assessment.id}>
                  <div><strong>第{assessment.seqNo}回</strong><span>{assessment.assessedOn}</span></div>
                  <span className={assessment.status === 'done' ? styles.badgeDone : styles.badgeDraft}>{assessment.status === 'done' ? '完了' : '下書き'}</span>
                  {assessment.status === 'draft' ? <Link to={`/assessments/${assessment.id}`}>続きから入力</Link> : assessment.reportAvailable ? <Link to={`/reports/${assessment.id}`}>レポート</Link> : null}
                </li>
              ))}
            </ol>
          ) : <p className={styles.muted}>まだアセスメントはありません。</p>}
        </section>

        <section className={styles.panel} aria-labelledby="share-title">
          <h2 id="share-title">共有と管理</h2>
          <p className={styles.muted}>通常コード：{child.shareCode}</p>
          {child.role === 'owner' ? <p className={styles.muted}>オーナー移譲コード：{child.ownerShareCode}</p> : null}
          {!readOnly && child.role === 'owner' ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('archive')} disabled={busy}>退会（アーカイブ）</button> : null}
          {!readOnly && child.role === 'member' ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('remove')} disabled={busy}>自分の一覧から外す</button> : null}
          {!readOnly && child.role === 'owner' && child.assessments.length === 0 ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('delete')} disabled={busy}>登録を削除</button> : null}
          {readOnly ? <p className={styles.muted}>アーカイブ中はアセスメントの作成・編集はできません。</p> : null}
        </section>
        <ConfirmDialog
          open={confirmAction !== null}
          title={confirmAction === 'start' ? '新しいアセスメントを始めますか？' : confirmAction === 'archive' ? 'アーカイブしますか？' : confirmAction === 'remove' ? '一覧から外しますか？' : '登録を削除しますか？'}
          message={confirmAction === 'start' ? '新しい回を始めると、前の回は編集できなくなります。' : confirmAction === 'archive' ? 'アーカイブすると全コーチの一覧から隠れます。データは残ります。' : confirmAction === 'remove' ? 'このコーチの一覧からだけ外れます。子どものデータは残ります。' : 'アセスメントがない登録だけ削除できます。この操作は取り消せません。'}
          confirmLabel={confirmAction === 'start' ? '始める' : confirmAction === 'archive' ? 'アーカイブ' : confirmAction === 'remove' ? '一覧から外す' : '削除する'}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmPendingAction}
        />
      </div>
    </main>
  );
}
