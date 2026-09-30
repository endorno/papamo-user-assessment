import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import {
  EXERCISES,
  GRADES,
  childDetailSchema,
  daysBetween,
  monthOrdinalSince,
  nextDueDate,
  todayInJst,
  type ChildDetail,
  type Gender,
  type GradeCode,
  type Honorific,
} from '@papamo/shared';
import { apiRequest, ApiClientError } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { ChildStatusBadge } from '../components/ChildStatusBadge';
import { ChildTabs, isChildTabKey, tabPanelProps, type ChildTabKey } from '../components/ChildTabs';
import {
  CoachCautionsPanel,
  EngagementPanel,
  ExerciseNotesPanel,
  GoalFocusPanel,
  LessonMenuPanel,
  NextLessonCard,
  StrategyPanel,
  TroubleMatchPanel,
  TroubleSummaryPanel,
} from '../components/CoachInsights';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CopyCode } from '../components/CopyCode';
import { MonthSelect } from '../components/MonthSelect';
import { RadarChart } from '../components/RadarChart';
import { useToast } from '../components/Toast';
import { formatJapaneseDate, formatJapaneseMonth, genderLabel, honorificLabel } from '../utils/display';
import styles from '../styles/page.module.css';

type ConfirmAction = 'start' | 'resolvePending' | 'archive' | 'remove' | 'delete' | null;

interface ChildFormState {
  name: string;
  honorific: Honorific;
  gender: Gender;
  gradeCode: GradeCode;
  joinedMonth: string;
}

function formFromChild(child: ChildDetail): ChildFormState {
  const currentGrade = GRADES.find(({ code }) => code === child.grade.code)?.code;
  return {
    name: child.name,
    honorific: child.honorific,
    gender: child.gender,
    gradeCode: currentGrade ?? child.gradeCode,
    joinedMonth: child.joinedMonth,
  };
}

function readChild(value: unknown): ChildDetail {
  const parsed = childDetailSchema.safeParse((value as { child?: unknown }).child);
  if (!parsed.success) throw new Error('子ども情報を読み込めませんでした。');
  return parsed.data;
}

function confirmationFor(action: Exclude<ConfirmAction, null>) {
  if (action === 'resolvePending') return {
    title: '前回の変更がレポートに反映されていません',
    message: '次の回を作ると、前の回は編集できなくなります。先に前回の入力画面で「レポートを更新」するか、レポート作成時の内容に戻してください。',
    label: '前回の入力を開く',
    tone: 'primary' as const,
  };
  if (action === 'start') return {
    title: '新しいアセスメントを始めますか？',
    message: '新しい回を作成すると、前の回の入力内容は編集できなくなります。レポートの閲覧と印刷は引き続きできます。',
    label: '新しい回を始める',
    tone: 'primary' as const,
  };
  if (action === 'archive') return {
    title: '退会としてアーカイブしますか？',
    message: '全コーチの担当一覧から隠れ、記録は閲覧のみになります。あとから復元できます。',
    label: 'アーカイブする',
    tone: 'danger' as const,
  };
  if (action === 'remove') return {
    title: '自分の担当一覧から外しますか？',
    message: 'このコーチとの紐づきだけを解除します。お子さまの記録はオーナー側に残ります。',
    label: '一覧から外す',
    tone: 'danger' as const,
  };
  return {
    title: 'この登録を完全に削除しますか？',
    message: '最初のレポートを作る前であれば削除できます。入力中のアセスメントと、ほかのコーチの担当一覧からも消えます。この操作は取り消せません。',
    label: '完全に削除する',
    tone: 'danger' as const,
  };
}

function TabEmpty() {
  return (
    <div className={`${styles.panel} ${styles.mapEmpty}`}>
      <span aria-hidden="true">🧭</span>
      <p>初回アセスメントを完了すると、ここに前回の振り返りとこれからの計画が表示されます。</p>
    </div>
  );
}

export function ChildPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: ChildTabKey = isChildTabKey(tabParam) ? tabParam : 'overview';
  const { session } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [child, setChild] = useState<ChildDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [childForm, setChildForm] = useState<ChildFormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const returnToListIfDeleted = useCallback((caught: unknown) => {
    if (!(caught instanceof ApiClientError) || caught.code !== 'not_found') return false;
    showToast('このお子さまは削除されたため、担当一覧に戻りました。');
    navigate('/', { replace: true });
    return true;
  }, [navigate, showToast]);

  // トークンの更新で読み直すと、編集中の登録情報フォームが戻ってしまう。読み込みは開いたときと操作の後だけにする。
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const hasSession = Boolean(session);

  const reload = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !id) return;
    const response = await apiRequest<unknown>(`/children/${id}`, currentSession);
    const loaded = readChild(response);
    setChild(loaded);
    setChildForm(formFromChild(loaded));
  }, [id]);

  useEffect(() => {
    if (!hasSession) return;
    let active = true;
    void reload()
      .catch((caught) => {
        if (active && !returnToListIfDeleted(caught)) {
          setLoadError(caught instanceof Error ? caught.message : '読み込みに失敗しました。');
        }
      });
    return () => {
      active = false;
    };
  }, [hasSession, reload, returnToListIfDeleted]);

  // タブは URL に残し、リロードや共有でも同じタブを開けるようにする。履歴は増やさない。
  function selectTab(next: ChildTabKey) {
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  }

  async function runAction(action: () => Promise<void>, fallbackMessage: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (caught) {
      if (!returnToListIfDeleted(caught)) {
        setActionError(caught instanceof Error ? caught.message : fallbackMessage);
      }
    } finally {
      setBusy(false);
    }
  }

  async function startAssessment() {
    if (!session || !id || !child || child.archivedAt) return;
    await runAction(async () => {
      const response = await apiRequest<unknown>(`/children/${id}/assessments`, session, {
        method: 'POST',
        body: JSON.stringify({ unlockExt: child.extUnlocked }),
      });
      const assessmentId = (response as { assessment?: { id?: unknown } }).assessment?.id;
      if (typeof assessmentId !== 'string') throw new Error('作成結果を読み込めませんでした。');
      navigate(`/assessments/${assessmentId}`);
    }, 'アセスメントを開始できませんでした。');
  }

  async function saveProfile() {
    if (!session || !id || !child || !childForm) return;
    if (!childForm.name.trim()) {
      setActionError('お名前を入力してください。');
      return;
    }
    await runAction(async () => {
      await apiRequest(`/children/${id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({
          name: childForm.name.trim(),
          honorific: childForm.honorific,
          gender: childForm.gender,
          joinedMonth: childForm.joinedMonth,
          ...(childForm.gradeCode === child.gradeCode ? {} : { gradeCode: childForm.gradeCode }),
        }),
      });
      await reload();
      setEditingProfile(false);
    }, '登録情報を保存できませんでした。');
  }

  function cancelProfileEdit() {
    if (child) setChildForm(formFromChild(child));
    setEditingProfile(false);
    setActionError(null);
  }

  async function archive() {
    if (!session || !id || !child) return;
    const label = `${child.name}${honorificLabel(child.honorific)}`;
    await runAction(async () => {
      await apiRequest(`/children/${id}/archive`, session, { method: 'POST' });
      showToast(`${label}をアーカイブしました。`, {
        action: { label: '元に戻す', onClick: () => void undoArchive(label) },
      });
      navigate('/');
    }, 'アーカイブに失敗しました。');
  }

  // 通知から戻したときは、復元されたお子さまのページを開いて結果を見せる。
  async function undoArchive(label: string) {
    if (!session || !id) return;
    try {
      await apiRequest(`/children/${id}/unarchive`, session, { method: 'POST' });
      showToast(`${label}を担当一覧に戻しました。`);
      navigate(`/children/${id}`);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : '復元に失敗しました。');
    }
  }

  async function restore() {
    if (!session || !id || !child) return;
    const label = `${child.name}${honorificLabel(child.honorific)}`;
    await runAction(async () => {
      await apiRequest(`/children/${id}/unarchive`, session, { method: 'POST' });
      await reload();
      showToast(`${label}を担当一覧に戻しました。`);
    }, '復元に失敗しました。');
  }

  async function removeMembership() {
    if (!session || !id || !child) return;
    const label = `${child.name}${honorificLabel(child.honorific)}`;
    await runAction(async () => {
      await apiRequest(`/children/${id}/membership`, session, { method: 'DELETE' });
      showToast(`${label}を自分の担当一覧から外しました。`);
      navigate('/');
    }, '一覧から外せませんでした。');
  }

  async function deleteChild() {
    if (!session || !id || !child) return;
    const label = `${child.name}${honorificLabel(child.honorific)}`;
    await runAction(async () => {
      await apiRequest(`/children/${id}`, session, { method: 'DELETE' });
      showToast(`${label}の登録を削除しました。`);
      navigate('/');
    }, '削除できませんでした。');
  }

  function confirmPendingAction() {
    const action = confirmAction;
    setConfirmAction(null);
    if (action === 'resolvePending') {
      const latestCompleted = child?.assessments.filter((assessment) => assessment.status === 'done').at(-1);
      if (latestCompleted) navigate(`/assessments/${latestCompleted.id}`);
    }
    if (action === 'start') void startAssessment();
    if (action === 'archive') void archive();
    if (action === 'remove') void removeMembership();
    if (action === 'delete') void deleteChild();
  }

  if (loadError) {
    return (
      <div className={styles.pageFrame}>
        <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: '読み込みエラー' }]} />
        <main className={styles.page}>
          <div className={styles.errorPanel} role="alert">
            <p>{loadError}</p>
            <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>もう一度読み込む</button>
          </div>
        </main>
      </div>
    );
  }
  if (!child) {
    return (
      <div className={styles.pageFrame}>
        <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: 'お子さまのページ' }]} />
        <main className={styles.page}><p className={styles.muted}>子ども情報を読み込み中…</p></main>
      </div>
    );
  }

  const childName = `${child.name}${honorificLabel(child.honorific)}`;
  const draft = child.assessments.find((assessment) => assessment.status === 'draft');
  const completed = child.assessments.filter((assessment) => assessment.status === 'done');
  const latestCompleted = completed.at(-1);
  const readOnly = Boolean(child.archivedAt);
  const report = child.latestReport;
  const confirmation = confirmAction ? confirmationFor(confirmAction) : null;
  const reportSource = latestCompleted ? `第${latestCompleted.seqNo}回で記録` : '';
  const today = todayInJst();
  const monthsSinceJoined = monthOrdinalSince(child.joinedMonth, today);
  // モックの案内に合わせ、入会半年を過ぎて未開放なら次の回で足せることを伝える。
  const canSuggestUnlock = !child.extUnlocked && monthsSinceJoined >= 6 && Boolean(latestCompleted);
  const startDetail = latestCompleted ? (
    <>
      <p>前回：第{latestCompleted.seqNo}回・{formatJapaneseDate(latestCompleted.assessedOn)}（{daysBetween(latestCompleted.assessedOn, today)}日前）</p>
      <p>次回の目安：{formatJapaneseDate(nextDueDate(latestCompleted.assessedOn))}ごろ</p>
    </>
  ) : null;

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: childName }]} />
      <main className={styles.page}>
        <div className={styles.pageInner}>
          <header className={styles.hubHeader}>
            <div className={styles.childHero}>
              <span className={styles.childFace} aria-hidden="true">{child.name.charAt(0)}</span>
              <div>
                <p className={styles.eyebrow}>{readOnly ? 'アーカイブ中・閲覧のみ' : '担当のお子さま'}</p>
                <h1>{childName}</h1>
                <p>{child.grade.name}（{child.grade.ageHint}）・入会 {formatJapaneseMonth(child.joinedMonth)}（{monthsSinceJoined}か月目）</p>
                <ChildStatusBadge state={child.state} />
              </div>
            </div>
            <div className={styles.headerActions}>
              {draft && !readOnly ? (
                <Link className={`${styles.primaryButton} ${styles.bigButton}`} to={`/assessments/${draft.id}`}>入力を続ける</Link>
              ) : !readOnly ? (
                <>
                  {child.extUnlocked ? <span className={styles.unlockedBadge}>4・5種目目 開放済み</span> : null}
                  <button
                    className={`${styles.primaryButton} ${styles.bigButton}`}
                    type="button"
                    onClick={() => {
                      if (!latestCompleted) void startAssessment();
                      else setConfirmAction(latestCompleted.hasUnreportedChanges ? 'resolvePending' : 'start');
                    }}
                    disabled={busy}
                  >
                    アセスメントを始める
                  </button>
                </>
              ) : child.role === 'owner' ? (
                <button className={styles.secondaryButton} type="button" onClick={() => void restore()} disabled={busy}>アーカイブから復元</button>
              ) : null}
              {latestCompleted?.reportAvailable ? <Link className={styles.textLink} to={`/reports/${latestCompleted.id}`}>最新の保護者向けレポート</Link> : null}
            </div>
          </header>

          {actionError ? <div className={styles.inlineError} role="alert">{actionError}</div> : null}
          {latestCompleted?.hasUnreportedChanges && !readOnly ? (
            <div className={styles.unreportedNotice} role="status">
              <div>
                <strong>第{latestCompleted.seqNo}回の入力に、レポートへ反映していない変更があります</strong>
                <p>保護者向けレポートとこのページは、変更前の内容のままです。入力画面で「レポートを更新」するか、作成時の内容に戻してください。</p>
              </div>
              <Link className={styles.secondaryButton} to={`/assessments/${latestCompleted.id}`}>入力画面で確認する</Link>
            </div>
          ) : null}

          <ChildTabs current={tab} onSelect={selectTab} />

          {tab === 'overview' ? (
            <div className={styles.hubColumns} {...tabPanelProps('overview')}>
              <div>
                <section className={styles.panel} aria-labelledby="map-title">
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 id="map-title">育ちマップ</h2>
                      <p className={styles.muted}>{latestCompleted ? `第${latestCompleted.seqNo}回・${formatJapaneseDate(latestCompleted.assessedOn)}` : 'まだ測っていません'}</p>
                    </div>
                  </div>
                  {report ? (
                    <div className={styles.mapLayout}>
                      <RadarChart report={report} extUnlocked={child.extUnlocked} />
                      <div className={styles.levelRows} aria-label="種目ごとの到達レベル">
                        {EXERCISES.map((exercise) => {
                          const level = report.levels.find((item) => item.key === exercise.key);
                          if (!level) return (
                            <div className={`${styles.levelRow} ${styles.levelRowLocked}`} key={exercise.key}>
                              <span><strong>{exercise.name}</strong><small>{exercise.parentName}</small></span>
                              <span className={styles.levelTrack} />
                              <span>半年目以降</span>
                            </div>
                          );
                          const deltaLabel = level.delta === undefined ? '初回' : level.delta > 0 ? `▲${level.delta}` : level.delta < 0 ? `▼${Math.abs(level.delta)}` : '±0';
                          return (
                            <div className={styles.levelRow} key={exercise.key}>
                              <span><strong>{exercise.name}</strong><small>{exercise.parentName}</small></span>
                              <span className={styles.levelTrack}><i style={{ width: `${(level.lv / level.maxLv) * 100}%` }} /></span>
                              <span><strong>{`Lv${level.lv}`}</strong><small>{deltaLabel}</small></span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.mapEmpty}>
                      <span aria-hidden="true">🧭</span>
                      <p>初回アセスメントを取ると、5つの土台のマップが表示されます。</p>
                      {draft ? <Link to={`/assessments/${draft.id}`}>入力中のアセスメントを続ける</Link> : null}
                    </div>
                  )}
                  {canSuggestUnlock ? (
                    <div className={styles.unlockNote}>
                      <strong>🔓 4・5種目目を開放できる時期です</strong>
                      <span>
                        入会から{monthsSinceJoined}か月目です。土台が安定していれば、次のアセスメントで「あしあとものまね」「信号ゲーム」を追加できます（コーチ判断）。
                      </span>
                    </div>
                  ) : null}
                </section>

                <section className={styles.panel} aria-labelledby="history-title">
                  <div className={styles.sectionHeader}>
                    <div><h2 id="history-title">これまでの歩み</h2><p className={styles.muted}>3か月ごとに同じ課題で測り直します</p></div>
                  </div>
                  {child.assessments.length ? (
                    <ol className={styles.assessmentTimeline}>
                      {[...child.assessments].reverse().map((assessment, index) => {
                        const isLatest = index === 0;
                        return (
                          <li key={assessment.id}>
                            <div><strong>第{assessment.seqNo}回</strong><span>{formatJapaneseDate(assessment.assessedOn)}</span></div>
                            <span className={assessment.status === 'draft' ? styles.badgeDraft : assessment.hasUnreportedChanges ? styles.badgeChanged : styles.badgeDone}>
                              {assessment.status === 'draft' ? '入力中' : assessment.hasUnreportedChanges ? 'レポート未反映' : '完了'}
                            </span>
                            <div className={styles.historyActions}>
                              {assessment.status === 'draft' ? <Link to={`/assessments/${assessment.id}`}>入力を続ける</Link> : (
                                <>
                                  {assessment.reportAvailable ? <Link to={`/reports/${assessment.id}`}>レポート</Link> : null}
                                  {isLatest && !readOnly ? <Link to={`/assessments/${assessment.id}`}>{assessment.hasUnreportedChanges ? '変更を確認' : '入力内容を編集'}</Link> : null}
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : <p className={styles.muted}>まだアセスメントはありません。</p>}
                </section>
              </div>
              <div>
                {report ? <NextLessonCard report={report} onOpenPlan={() => selectTab('plan')} /> : null}

                <section className={styles.panel} aria-labelledby="goals-title">
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 id="goals-title">今期の目標</h2>
                      <p className={styles.muted}>{latestCompleted ? `第${latestCompleted.seqNo}回アセスメントで設定` : '初回アセスメントで設定'}</p>
                    </div>
                  </div>
                  {latestCompleted?.goals.length ? <div className={styles.goalChips}>{latestCompleted.goals.map((goal) => <span key={goal}>{goal}</span>)}</div> : <p className={styles.muted}>目標はまだ登録されていません。初回アセスメントで設定してください。</p>}
                </section>

                {report ? <TroubleSummaryPanel report={report} source={reportSource} /> : null}
              </div>
            </div>
          ) : null}

          {tab === 'plan' ? (
            <div {...tabPanelProps('plan')}>
              {report ? (
                <div className={styles.planColumns}>
                  <div>
                    <p className={styles.planStep}><span>1</span>前回の様子<small>{reportSource}</small></p>
                    <ExerciseNotesPanel report={report} source={reportSource} />
                    <EngagementPanel report={report} source={reportSource} />
                    <TroubleMatchPanel report={report} source={reportSource} />
                  </div>
                  <div>
                    <p className={styles.planStep}><span>2</span>これからの計画<small>次のアセスメントまで</small></p>
                    <CoachCautionsPanel report={report} source={reportSource} />
                    <StrategyPanel report={report} />
                    <LessonMenuPanel report={report} source={reportSource} />
                    <GoalFocusPanel report={report} source={reportSource} />
                  </div>
                </div>
              ) : <TabEmpty />}
            </div>
          ) : null}

          {tab === 'settings' ? (
            <div className={styles.hubColumns} {...tabPanelProps('settings')}>
              <div>
                <section className={styles.panel} aria-labelledby="profile-title">
                  <div className={styles.sectionHeader}>
                    <div><h2 id="profile-title">登録情報</h2><p className={styles.muted}>お名前・性別・学年・入会月の修正</p></div>
                    {!readOnly && !editingProfile ? <button className={styles.compactButton} type="button" onClick={() => setEditingProfile(true)}>編集</button> : null}
                  </div>
                  {editingProfile && childForm ? (
                    <form className={styles.childProfileForm} onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
                      <div className={styles.nameFields}>
                        <div className={styles.formField}>
                          <label htmlFor="profile-child-name">お名前（下の名前）</label>
                          <input id="profile-child-name" value={childForm.name} maxLength={30} required onChange={(event) => setChildForm((current) => current ? { ...current, name: event.target.value } : current)} />
                        </div>
                        <div className={styles.formField}>
                          <label htmlFor="profile-child-honorific">敬称</label>
                          <select id="profile-child-honorific" value={childForm.honorific} onChange={(event) => setChildForm((current) => current ? { ...current, honorific: event.target.value as Honorific } : current)}>
                            <option value="kun">くん</option><option value="chan">ちゃん</option><option value="san">さん</option>
                          </select>
                        </div>
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor="profile-child-gender">性別</label>
                        <select id="profile-child-gender" value={childForm.gender} onChange={(event) => setChildForm((current) => current ? { ...current, gender: event.target.value as Gender } : current)}>
                          <option value="boy">男の子</option><option value="girl">女の子</option><option value="unspecified">選ばない</option>
                        </select>
                        <small>敬称とは連動しません。呼び方は敬称で選んでください。</small>
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor="profile-child-grade">現在の学年</label>
                        <select id="profile-child-grade" value={childForm.gradeCode} onChange={(event) => setChildForm((current) => current ? { ...current, gradeCode: event.target.value as GradeCode } : current)}>
                          {GRADES.map((grade) => <option key={grade.code} value={grade.code}>{grade.name}（{grade.ageHint}）</option>)}
                        </select>
                        <small>修正した学年を現在年度の基準として、次の4月から自動で進級します。</small>
                      </div>
                      <div className={styles.formField}>
                        <label htmlFor="profile-child-joined">入会月</label>
                        <MonthSelect id="profile-child-joined" label="入会月" value={childForm.joinedMonth} onChange={(joinedMonth) => setChildForm((current) => current ? { ...current, joinedMonth } : current)} />
                      </div>
                      <div className={styles.inlineActions}>
                        <button className={styles.primaryButton} type="submit" disabled={busy}>保存</button>
                        <button className={styles.secondaryButton} type="button" onClick={cancelProfileEdit}>キャンセル</button>
                      </div>
                    </form>
                  ) : (
                    <dl className={styles.profileSummary}>
                      <div><dt>お名前</dt><dd>{childName}</dd></div>
                      <div><dt>性別</dt><dd>{genderLabel(child.gender)}</dd></div>
                      <div><dt>現在の学年</dt><dd>{child.grade.name}（{child.grade.ageHint}）</dd></div>
                      <div><dt>入会月</dt><dd>{formatJapaneseMonth(child.joinedMonth)}</dd></div>
                    </dl>
                  )}
                </section>
              </div>
              <div>
                <section className={styles.panel} aria-labelledby="share-title">
                  <div className={styles.sectionHeader}><div><h2 id="share-title">ほかのコーチと共有</h2><p className={styles.muted}>コードを知っているコーチだけが取り込めます</p></div></div>
                  <div className={styles.codeList}>
                    <CopyCode code={child.shareCode} label="担当に追加するコード" description="取り込んだコーチも記録とレポートを編集できます。" />
                    {child.role === 'owner' && child.ownerShareCode ? <CopyCode code={child.ownerShareCode} label="オーナーを移すコード" description="使った相手が新しいオーナーになります。引き継ぎ時以外は共有しないでください。" sensitive /> : null}
                  </div>
                </section>

                <section className={`${styles.panel} ${styles.managementPanel}`} aria-labelledby="management-title">
                  <details>
                    <summary id="management-title">退会・担当解除などの管理</summary>
                    <div className={styles.managementActions}>
                      {!readOnly && child.role === 'owner' ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('archive')} disabled={busy}>退会としてアーカイブ</button> : null}
                      {!readOnly && child.role === 'member' ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('remove')} disabled={busy}>自分の担当一覧から外す</button> : null}
                      {!readOnly && child.role === 'owner' && !child.assessments.some((assessment) => assessment.reportAvailable) ? <button className={styles.dangerButton} type="button" onClick={() => setConfirmAction('delete')} disabled={busy}>登録を完全に削除</button> : null}
                      {readOnly ? <p className={styles.muted}>アーカイブ中は記録を編集できません。</p> : null}
                      {child.role === 'owner' ? (
                        <p className={styles.managementHint}>
                          オーナーは担当から外れられません。引き継ぐときは「オーナーを移すコード」を次のコーチに渡し、取り込んでもらってください。
                        </p>
                      ) : null}
                    </div>
                  </details>
                </section>
              </div>
            </div>
          ) : null}

          <ConfirmDialog
            open={confirmAction !== null}
            tone={confirmation?.tone ?? 'danger'}
            title={confirmation?.title ?? ''}
            message={confirmation?.message ?? ''}
            confirmLabel={confirmation?.label ?? ''}
            detail={confirmAction === 'start' ? startDetail : null}
            secondary={confirmAction === 'start' && latestCompleted ? {
              label: '前回の入力を修正する',
              onClick: () => {
                setConfirmAction(null);
                navigate(`/assessments/${latestCompleted.id}`);
              },
            } : undefined}
            onCancel={() => setConfirmAction(null)}
            onConfirm={confirmPendingAction}
          />
        </div>
      </main>
    </div>
  );
}
