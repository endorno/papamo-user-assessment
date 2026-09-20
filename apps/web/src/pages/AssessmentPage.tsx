import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  assessmentDataDraftSchema,
  assessmentResponseSchema,
  bandOf,
  EXERCISES,
  EXT_EXERCISE_KEYS,
  ladderLabel,
  PPI_QUESTIONS,
  PLANS,
  TROUBLE_CATEGORIES,
  type AssessmentData,
  type AssessmentDetail,
  type ExerciseDefinition,
  type PpiKey,
} from '@papamo/shared';
import { apiRequest, ApiClientError } from '../api/client';
import { useUnsavedChanges } from '../app/UnsavedChangesContext';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SpreadsheetGoalImportDialog } from '../components/SpreadsheetGoalImportDialog';
import { useToast } from '../components/Toast';
import { formatJapaneseDate, honorificLabel } from '../utils/display';
import styles from '../styles/page.module.css';

interface AssessmentFormState {
  assessedOn: string;
  unlockExt: boolean;
  data: AssessmentData;
}

interface LocalDraft {
  savedAt: string | null;
  form: AssessmentFormState;
}

/** ボタン・チェックはすぐ、文字入力は打ち終わるのを待ってから保存する。 */
const SAVE_DELAY_MS = 800;
const TEXT_SAVE_DELAY_MS = 1500;

function readAssessment(value: unknown) {
  const parsed = assessmentResponseSchema.safeParse(value);
  if (!parsed.success) throw new Error('アセスメント情報を読み込めませんでした。');
  return parsed.data.assessment;
}

function formFromAssessment(assessment: AssessmentDetail): AssessmentFormState {
  return {
    assessedOn: assessment.assessedOn,
    unlockExt: assessment.unlockExt,
    data: assessment.data,
  };
}

function localDraftKey(id: string) {
  return `papamo:assessment:${id}`;
}

function readLocalDraft(raw: string): LocalDraft | null {
  try {
    const candidate = JSON.parse(raw) as Partial<LocalDraft> & Partial<AssessmentFormState>;
    // 以前の版は保存時刻を持たず、フォームだけを直接入れていた。
    const form = (candidate.form ?? candidate) as Partial<AssessmentFormState>;
    const data = assessmentDataDraftSchema.safeParse(form.data);
    if (!data.success || typeof form.assessedOn !== 'string' || typeof form.unlockExt !== 'boolean') return null;
    return {
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : null,
      form: { assessedOn: form.assessedOn, unlockExt: form.unlockExt, data: data.data },
    };
  } catch {
    return null;
  }
}

function formatClock(value: string | null) {
  if (!value) return '時刻不明';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '時刻不明';
  return parsed.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function savedMessageFor(assessment: AssessmentDetail) {
  const clock = formatClock(new Date().toISOString());
  return assessment.status === 'done'
    ? `保存済み・レポートも更新しました ${clock}`
    : `保存済み ${clock}`;
}

/** 4・5種目目を閉じたときに残った入力を落とす（サーバー側でも同じ整理をする）。 */
function withoutExtInput(data: AssessmentData): AssessmentData {
  const lv = { ...data.lv };
  const errs = { ...data.errs };
  for (const key of EXT_EXERCISE_KEYS) {
    delete lv[key];
    delete errs[key];
  }
  return { ...data, lv, errs };
}

/** 作っただけの下書きは、確認なしで捨ててよい。 */
function hasAnyInput(form: AssessmentFormState) {
  const { lv, ppi, errs, memo, ppiNote } = form.data;
  return Boolean(
    Object.keys(lv).length
    || Object.keys(ppi).length
    || Object.values(errs).some((selected) => selected?.length)
    || memo.trim()
    || ppiNote.trim(),
  );
}

export function AssessmentPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const { showToast } = useToast();
  const { registerGuard } = useUnsavedChanges();
  const navigate = useNavigate();

  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [form, setForm] = useState<AssessmentFormState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('変更は自動保存されます');
  const [saveError, setSaveError] = useState<ApiClientError | Error | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [localRestore, setLocalRestore] = useState<LocalDraft | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [goalsText, setGoalsText] = useState('');
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [showGoalImport, setShowGoalImport] = useState(false);

  // 保存処理は非同期に連なるため、描画用の state とは別に最新値を ref で持つ。
  const assessmentRef = useRef<AssessmentDetail | null>(null);
  const formRef = useRef<AssessmentFormState | null>(null);
  const dirtyRef = useRef(false);
  const sessionRef = useRef(session);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const changeVersionRef = useRef(0);
  const saveDelayRef = useRef(SAVE_DELAY_MS);

  const returnToListIfDeleted = useCallback((caught: unknown) => {
    if (!(caught instanceof ApiClientError) || caught.code !== 'not_found') return false;
    if (id) window.localStorage.removeItem(localDraftKey(id));
    dirtyRef.current = false;
    assessmentRef.current = null;
    formRef.current = null;
    showToast('このお子さまは削除されたため、担当一覧に戻りました。');
    navigate('/', { replace: true });
    return true;
  }, [id, navigate, showToast]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const applyAssessment = useCallback((next: AssessmentDetail) => {
    assessmentRef.current = next;
    setAssessment(next);
  }, []);

  const applyForm = useCallback((next: AssessmentFormState, nextDirty: boolean) => {
    formRef.current = next;
    dirtyRef.current = nextDirty;
    setForm(next);
    setDirty(nextDirty);
  }, []);

  const loadAssessment = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !id) return;
    const loaded = readAssessment(await apiRequest<unknown>(`/assessments/${id}`, currentSession));
    const loadedForm = formFromAssessment(loaded);
    applyAssessment(loaded);
    applyForm(loadedForm, false);
    setGoalsText(loaded.child.goals.join('\n'));
    setSaveError(null);
    changeVersionRef.current = 0;

    const raw = window.localStorage.getItem(localDraftKey(loaded.id));
    if (!raw || loaded.readOnly) return;
    const local = readLocalDraft(raw);
    if (!local) {
      window.localStorage.removeItem(localDraftKey(loaded.id));
      return;
    }
    if (JSON.stringify(local.form) !== JSON.stringify(loadedForm)) setLocalRestore(local);
  }, [applyAssessment, applyForm, id]);

  useEffect(() => {
    void loadAssessment().catch((caught) => {
      if (!returnToListIfDeleted(caught)) {
        setPageError(caught instanceof Error ? caught.message : '読み込みに失敗しました。');
      }
    });
  }, [loadAssessment, returnToListIfDeleted, session]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) await inFlightRef.current;
    const currentForm = formRef.current;
    const currentAssessment = assessmentRef.current;
    const currentSession = sessionRef.current;
    if (!dirtyRef.current || !currentForm || !currentAssessment || !currentSession || currentAssessment.readOnly) {
      return true;
    }
    const savedVersion = changeVersionRef.current;
    const { goals: _goals, ...editableData } = currentForm.data;
    const request = (async () => {
      setSaving(true);
      setSavedMessage('保存中…');
      try {
        const response = await apiRequest<unknown>(`/assessments/${currentAssessment.id}`, currentSession, {
          method: 'PATCH',
          body: JSON.stringify({
            assessedOn: currentForm.assessedOn,
            unlockExt: currentForm.unlockExt,
            data: editableData,
            updatedAt: currentAssessment.updatedAt,
          }),
        });
        const saved = readAssessment(response);
        applyAssessment(saved);
        setSaveError(null);
        // 保存中にさらに変更されていたら、古い応答でフォームを戻さない。
        if (changeVersionRef.current === savedVersion) {
          applyForm(formFromAssessment(saved), false);
          window.localStorage.removeItem(localDraftKey(saved.id));
          setSavedMessage(savedMessageFor(saved));
        }
        return true;
      } catch (caught) {
        if (returnToListIfDeleted(caught)) return false;
        setSaveError(caught instanceof Error ? caught : new Error('保存に失敗しました。'));
        setSavedMessage('保存できていません');
        return false;
      } finally {
        setSaving(false);
      }
    })();
    inFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, [applyAssessment, applyForm, returnToListIfDeleted]);

  useEffect(() => {
    if (!dirty || !assessment || assessment.readOnly || saveError) return;
    const timer = window.setTimeout(() => void saveNow(), saveDelayRef.current);
    return () => window.clearTimeout(timer);
  }, [assessment, dirty, form, saveError, saveNow]);

  useEffect(() => {
    if (!dirty || !assessment || !form) return;
    window.localStorage.setItem(
      localDraftKey(assessment.id),
      JSON.stringify({ savedAt: new Date().toISOString(), form } satisfies LocalDraft),
    );
  }, [assessment, dirty, form]);

  useEffect(() => registerGuard({
    isDirty: () => dirtyRef.current,
    save: saveNow,
    // 保存せずに移動を選んだら、離脱時の送信もしない。端末の下書きは残すので後から戻せる。
    discard: () => {
      dirtyRef.current = false;
    },
  }), [registerGuard, saveNow]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  // 画面を離れる瞬間に未送信の変更が残っていたら、最後の1回だけ送り切る。
  useEffect(() => () => {
    const currentForm = formRef.current;
    const currentAssessment = assessmentRef.current;
    const currentSession = sessionRef.current;
    if (!dirtyRef.current || !currentForm || !currentAssessment || !currentSession || currentAssessment.readOnly) return;
    const { goals: _goals, ...editableData } = currentForm.data;
    void fetch(`/api/assessments/${currentAssessment.id}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`,
      },
      body: JSON.stringify({
        assessedOn: currentForm.assessedOn,
        unlockExt: currentForm.unlockExt,
        data: editableData,
        updatedAt: currentAssessment.updatedAt,
      }),
    }).catch(() => undefined);
  }, []);

  // 長い1ビューなので、いまどのセクションを見ているかをナビに返す。
  useEffect(() => {
    if (!form || typeof IntersectionObserver === 'undefined') return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-assessment-section]'));
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length) setActiveSection(visible[0]?.target.id ?? null);
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [form]);

  function updateForm(update: (current: AssessmentFormState) => AssessmentFormState, delay = SAVE_DELAY_MS) {
    const current = formRef.current;
    if (!current || assessmentRef.current?.readOnly) return;
    changeVersionRef.current += 1;
    saveDelayRef.current = delay;
    applyForm(update(current), true);
    setSaveError(null);
    setSavedMessage('未保存の変更があります');
  }

  function updateData(update: (current: AssessmentData) => AssessmentData, delay = SAVE_DELAY_MS) {
    updateForm((current) => ({ ...current, data: update(current.data) }), delay);
  }

  function updateText(update: (current: AssessmentData) => AssessmentData) {
    updateData(update, TEXT_SAVE_DELAY_MS);
  }

  function toggleTrouble(trouble: string, checked: boolean) {
    updateData((current) => ({
      ...current,
      troubles: checked ? [...current.troubles, trouble] : current.troubles.filter((item) => item !== trouble),
    }));
  }

  function toggleError(exercise: ExerciseDefinition, error: string) {
    updateData((current) => {
      const selected = current.errs[exercise.key] ?? [];
      return {
        ...current,
        errs: {
          ...current.errs,
          [exercise.key]: selected.includes(error)
            ? selected.filter((item) => item !== error)
            : [...selected, error],
        },
      };
    });
  }

  function toggleUnlockExt(checked: boolean) {
    updateForm((current) => ({
      ...current,
      unlockExt: checked,
      data: checked ? current.data : withoutExtInput(current.data),
    }));
  }

  async function complete() {
    const current = assessmentRef.current;
    if (!session || !current || current.readOnly || dirtyRef.current || saving) return;
    setCompleting(true);
    setPageError(null);
    try {
      const response = await apiRequest<{ report?: unknown }>(`/assessments/${current.id}/complete`, session, {
        method: 'POST',
        body: JSON.stringify({ updatedAt: current.updatedAt }),
      });
      if (!response.report) throw new Error('レポートの作成結果を読み込めませんでした。');
      showToast(current.status === 'done' ? 'レポートを更新しました。' : 'レポートを作成しました。');
      navigate(`/reports/${current.id}`);
    } catch (caught) {
      if (!returnToListIfDeleted(caught)) {
        setPageError(caught instanceof Error ? caught.message : 'レポートを作成できませんでした。');
      }
    } finally {
      setCompleting(false);
    }
  }

  async function closeAndReturn() {
    const current = assessmentRef.current;
    if (!current) return;
    setClosing(true);
    const saved = await saveNow();
    setClosing(false);
    if (saved) navigate(`/children/${current.childId}`);
  }

  async function saveGoals() {
    if (!session || !assessment) return;
    const goals = goalsText.split('\n').map((goal) => goal.trim()).filter(Boolean);
    if (goals.length > 5) {
      setGoalsError('目標は5件以内で入力してください。');
      return;
    }
    setGoalsSaving(true);
    setGoalsError(null);
    try {
      await apiRequest(`/children/${assessment.childId}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ goals }),
      });
      applyAssessment({ ...assessment, child: { ...assessment.child, goals } });
      setEditingGoals(false);
    } catch (caught) {
      if (!returnToListIfDeleted(caught)) {
        setGoalsError(caught instanceof Error ? caught.message : '目標を保存できませんでした。');
      }
    } finally {
      setGoalsSaving(false);
    }
  }

  async function discardDraft() {
    const current = assessmentRef.current;
    if (!session || !current || current.status !== 'draft') return;
    try {
      await apiRequest(`/assessments/${current.id}`, session, { method: 'DELETE' });
      window.localStorage.removeItem(localDraftKey(current.id));
      dirtyRef.current = false;
      showToast('下書きを破棄しました。');
      navigate(`/children/${current.childId}`);
    } catch (caught) {
      if (!returnToListIfDeleted(caught)) {
        setPageError(caught instanceof Error ? caught.message : '下書きを破棄できませんでした。');
      }
    }
  }

  function requestDiscard() {
    if (formRef.current && !hasAnyInput(formRef.current)) {
      void discardDraft();
      return;
    }
    setConfirmDiscard(true);
  }

  if (pageError && !assessment) {
    return <main className={styles.page}><div className={styles.errorPanel} role="alert"><p>{pageError}</p><button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>もう一度読み込む</button></div></main>;
  }
  if (!assessment || !form) {
    return (
      <div className={styles.pageFrame}>
        <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: 'アセスメント' }]} />
        <main className={styles.page}><p className={styles.muted}>アセスメントを読み込み中…</p></main>
      </div>
    );
  }

  const exercises = EXERCISES.filter((exercise) => exercise.core || form.unlockExt);
  const missingExercises = exercises.filter((exercise) => form.data.lv[exercise.key] === undefined);
  const missingPpi = PPI_QUESTIONS.filter(({ key }) => form.data.ppi[key] === undefined);
  const completionIssues = [
    ...missingExercises.map((exercise) => ({ target: `assessment-${exercise.key}`, label: `${exercise.name}のLv` })),
    ...(missingPpi.length ? [{ target: 'assessment-ppi', label: `ご家庭の負担度 あと${missingPpi.length}問` }] : []),
    ...(!form.data.plan ? [{ target: 'assessment-plan', label: '3か月の運動計画' }] : []),
  ];
  const canComplete = completionIssues.length === 0 && !dirty && !saving && !assessment.readOnly && !completing;
  const conflict = saveError instanceof ApiClientError && saveError.code === 'conflict';
  const readOnlyMessage = assessment.child.archivedAt ? 'アーカイブ中のため閲覧のみです。' : '次のアセスメントがあるため、この回は閲覧のみです。';
  const goalCount = goalsText.split('\n').map((goal) => goal.trim()).filter(Boolean).length;
  const canToggleUnlock = !assessment.child.extUnlocked && assessment.status === 'draft' && !assessment.readOnly;
  const navSections = [
    { id: 'assessment-basic', label: '基本情報', complete: true },
    ...exercises.map((exercise) => ({ id: `assessment-${exercise.key}`, label: `${exercise.icon} ${exercise.name}`, complete: form.data.lv[exercise.key] !== undefined })),
    { id: 'assessment-troubles', label: 'お困りごと', complete: form.data.troubles.length > 0 },
    { id: 'assessment-ppi', label: 'ご家庭の負担度', complete: missingPpi.length === 0 },
    { id: 'assessment-plan', label: '計画・所見', complete: Boolean(form.data.plan) },
  ];

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: assessment.child.name, to: `/children/${assessment.childId}` }, { label: `第${assessment.seqNo}回アセスメント` }]} />
      <main className={`${styles.page} ${styles.assessmentPage}`}>
        <div className={`${styles.pageInner} ${styles.assessmentLayout}`}>
          <nav className={styles.jumpNav} aria-label="入力項目">
            {navSections.map((section) => (
              <a href={`#${section.id}`} key={section.id} aria-current={activeSection === section.id ? 'true' : undefined}>
                <span className={section.complete ? styles.jumpComplete : styles.jumpIncomplete} aria-hidden="true">{section.complete ? '✓' : '・'}</span>
                <span>{section.label}</span>
              </a>
            ))}
          </nav>

          <div className={styles.assessmentForm}>
            <header className={styles.assessmentHeader}>
              <div>
                <p className={styles.eyebrow}>第{assessment.seqNo}回・{assessment.status === 'done' ? '完了済み' : '入力中'}</p>
                <h1>{assessment.child.name}{honorificLabel(assessment.child.honorific)}のアセスメント</h1>
                <p className={saveError ? styles.error : styles.saveStatus} role="status">
                  <span aria-hidden="true">{saveError ? '!' : saving ? '●' : '✓'}</span>
                  {assessment.readOnly ? readOnlyMessage : saveError?.message ?? savedMessage}
                </p>
              </div>
              {assessment.status === 'draft' && !assessment.readOnly ? <button className={styles.textDangerButton} type="button" onClick={requestDiscard}>下書きを破棄</button> : null}
            </header>

            {saveError ? (
              <div className={styles.inlineError} role="alert">
                <span>{saveError.message}</span>
                <button className={styles.secondaryButton} type="button" onClick={() => conflict ? window.location.reload() : setSaveError(null)}>
                  {conflict ? '最新の内容を読み込む' : '保存を再試行'}
                </button>
              </div>
            ) : null}
            {pageError ? <div className={styles.inlineError} role="alert">{pageError}</div> : null}

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-basic" data-assessment-section aria-labelledby="basic-title">
              <div className={styles.sectionHeader}><div><h2 id="basic-title">基本情報</h2><p className={styles.muted}>今回の実施日と目標を確認します</p></div></div>
              <div className={styles.basicGrid}>
                <div className={styles.formField}>
                  <label htmlFor="assessed-on">実施日</label>
                  <input id="assessed-on" type="date" value={form.assessedOn} disabled={assessment.readOnly} onChange={(event) => updateForm((current) => ({ ...current, assessedOn: event.target.value }))} />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="assessment-sequence">回数</label>
                  <input id="assessment-sequence" value={`第${assessment.seqNo}回`} readOnly />
                </div>
              </div>
              {assessment.previous ? <p className={styles.infoNote}>前回（第{assessment.previous.seqNo}回・{formatJapaneseDate(assessment.previous.assessedOn)}）と比較したレポートになります。</p> : null}
              <div className={styles.goalsEditor}>
                <div className={styles.sectionHeader}>
                  <div><strong>ご家族・本人の目標</strong><p className={styles.muted}>変更内容はお子さま情報に保存され、完了時に今回の記録へ写されます。</p></div>
                  {!assessment.readOnly && !editingGoals ? (
                    <div className={styles.compactActions}>
                      {assessment.seqNo === 1 ? <button className={styles.compactButton} type="button" onClick={() => setShowGoalImport(true)}>入会アンケートから取り込む</button> : null}
                      <button className={styles.compactButton} type="button" onClick={() => setEditingGoals(true)}>編集</button>
                    </div>
                  ) : null}
                </div>
                {editingGoals ? (
                  <>
                    <textarea value={goalsText} onChange={(event) => setGoalsText(event.target.value)} rows={4} aria-label="ご家族・本人の目標" />
                    <small className={goalCount > 5 ? styles.fieldError : styles.muted}>1行に1件、5件まで（現在 {goalCount}件）</small>
                    {goalsError ? <p className={styles.formError} role="alert">{goalsError}</p> : null}
                    <div className={styles.inlineActions}>
                      <button className={styles.primaryButton} type="button" disabled={goalsSaving || goalCount > 5} onClick={() => void saveGoals()}>{goalsSaving ? '保存中…' : '目標を保存'}</button>
                      <button className={styles.secondaryButton} type="button" onClick={() => { setGoalsText(assessment.child.goals.join('\n')); setEditingGoals(false); }}>キャンセル</button>
                    </div>
                  </>
                ) : assessment.child.goals.length ? <div className={styles.goalChips}>{assessment.child.goals.map((goal) => <span key={goal}>{goal}</span>)}</div> : <p className={styles.muted}>目標はまだ登録されていません。</p>}
              </div>
              {assessment.child.extUnlocked ? (
                <div className={styles.unlockInfo}><strong>4・5種目目は開放済みです</strong><span>以降のアセスメントは5種目で記録します。</span></div>
              ) : canToggleUnlock ? (
                <label className={styles.unlockChoice}>
                  <input type="checkbox" checked={form.unlockExt} onChange={(event) => toggleUnlockExt(event.target.checked)} />
                  <span>
                    <strong>この回から4・5種目目も記録する</strong>
                    <small>レポートを作ると以降もずっと5種目になります。完了前ならチェックを外して戻せます。</small>
                  </span>
                </label>
              ) : form.unlockExt ? (
                <div className={styles.unlockInfo}><strong>この回から4・5種目目を記録します</strong><span>以降も5種目での記録になります。</span></div>
              ) : null}
            </section>

            {exercises.map((exercise) => (
              <ExerciseSection
                key={exercise.key}
                exercise={exercise}
                level={form.data.lv[exercise.key]}
                previousLevel={assessment.previous?.lv[exercise.key]}
                errors={form.data.errs[exercise.key] ?? []}
                disabled={assessment.readOnly}
                onLevelChange={(level) => updateData((current) => ({ ...current, lv: { ...current.lv, [exercise.key]: level } }))}
                onErrorToggle={(error) => toggleError(exercise, error)}
              />
            ))}

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-troubles" data-assessment-section aria-labelledby="troubles-title">
              <div className={styles.sectionHeader}><div><h2 id="troubles-title">お子さまのお困りごと</h2><p className={styles.muted}>保護者に聞き取り・当てはまるものを選択</p></div></div>
              <div className={styles.troubleCategories}>
                {TROUBLE_CATEGORIES[assessment.child.ageGroup].map((category) => (
                  <fieldset className={styles.troubleCategory} key={category.id}>
                    <legend>{category.icon} {category.title}</legend>
                    {category.items.map((trouble) => (
                      <label className={`${styles.troubleOption} ${form.data.troubles.includes(trouble) ? styles.optionSelected : ''}`} key={trouble}>
                        <input type="checkbox" checked={form.data.troubles.includes(trouble)} disabled={assessment.readOnly} onChange={(event) => toggleTrouble(trouble, event.target.checked)} />
                        <span>{trouble}{assessment.previous?.troubles.includes(trouble) ? <small className={styles.previousTag}>前回も</small> : null}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-ppi" data-assessment-section aria-labelledby="ppi-title">
              <div className={styles.sectionHeader}><div><h2 id="ppi-title">ご家庭のお困り度</h2><p className={styles.muted}>0〜5・5問すべて回答してください</p></div></div>
              {PPI_QUESTIONS.map((question) => (
                <PpiRow
                  key={question.key}
                  question={question}
                  value={form.data.ppi[question.key]}
                  previousValue={assessment.previous?.ppi[question.key]}
                  disabled={assessment.readOnly}
                  onChange={(value) => updateData((current) => ({ ...current, ppi: { ...current.ppi, [question.key]: value } }))}
                />
              ))}
              <div className={styles.formField}>
                <label htmlFor="ppi-note">いま一番負担に感じている場面（任意）</label>
                <input id="ppi-note" value={form.data.ppiNote} disabled={assessment.readOnly} onChange={(event) => updateText((current) => ({ ...current, ppiNote: event.target.value }))} />
              </div>
            </section>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-plan" data-assessment-section aria-labelledby="plan-title">
              <div className={styles.sectionHeader}><div><h2 id="plan-title">計画・所見</h2><p className={styles.muted}>所見は内部用で、保護者レポートには出ません</p></div></div>
              <fieldset className={styles.planOptions}>
                <legend>3〜6か月の運動計画</legend>
                {Object.entries(PLANS).map(([key, plan]) => (
                  <label className={form.data.plan === key ? styles.planSelected : ''} key={key}>
                    <input type="radio" name="plan" value={key} checked={form.data.plan === key} disabled={assessment.readOnly} onChange={() => updateData((current) => ({ ...current, plan: key as AssessmentData['plan'] }))} />
                    <span><strong>{plan.name}</strong><small>{plan.window}</small><em>{plan.items.join('・')}</em></span>
                  </label>
                ))}
              </fieldset>
              <div className={styles.formField}>
                <label htmlFor="coach-memo">コーチ所見メモ（内部用）</label>
                <textarea id="coach-memo" rows={4} value={form.data.memo} disabled={assessment.readOnly} onChange={(event) => updateText((current) => ({ ...current, memo: event.target.value }))} />
              </div>
            </section>
          </div>
        </div>

        <div className={styles.assessmentDock} data-print-hidden>
          <div className={styles.dockInner}>
            <div className={styles.dockStatus}>
              {assessment.readOnly ? (
                <><strong>この回は閲覧のみです</strong><span>{readOnlyMessage}</span></>
              ) : completionIssues.length ? (
                <>
                  <strong>レポート作成まで、あと{completionIssues.length}項目です</strong>
                  <span className={styles.dockIssues}>
                    {completionIssues.map((issue) => (
                      <a href={`#${issue.target}`} key={issue.target}>{issue.label}</a>
                    ))}
                  </span>
                </>
              ) : dirty || saving ? (
                <><strong>入力内容を保存しています</strong><span>保存が終わるとレポートを作成できます。</span></>
              ) : (
                <><strong>必要な入力がそろいました</strong><span>保存済みです。レポートを作成できます。</span></>
              )}
            </div>
            <div className={styles.dockActions}>
              <button className={styles.secondaryButton} type="button" disabled={closing} onClick={() => void closeAndReturn()}>
                {closing ? '保存中…' : 'いったん閉じる'}
              </button>
              <button className={styles.primaryButton} type="button" disabled={!canComplete} onClick={() => void complete()}>{completing ? '作成中…' : assessment.status === 'done' ? 'レポートを更新' : 'レポートを作る'}</button>
            </div>
          </div>
        </div>

        <ConfirmDialog
          open={confirmDiscard}
          title="下書きを破棄しますか？"
          message="この回の入力内容をすべて削除します。この操作は取り消せません。"
          detail={assessment.seqNo > 1 ? <p>破棄すると、第{assessment.seqNo - 1}回の記録とレポートをまた編集できるようになります。</p> : null}
          confirmLabel="下書きを破棄する"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); void discardDraft(); }}
        />
        <SpreadsheetGoalImportDialog
          open={showGoalImport}
          onCancel={() => setShowGoalImport(false)}
          onImport={(goals) => {
            setGoalsText(goals.join('\n'));
            setGoalsError(null);
            setEditingGoals(true);
            setShowGoalImport(false);
          }}
        />
        <ConfirmDialog
          open={localRestore !== null}
          tone="primary"
          title="保存できていない入力があります"
          message="この端末に残っている入力を復元しますか？復元後、自動でサーバーへ保存します。"
          detail={
            <p>
              この端末：{formatClock(localRestore?.savedAt ?? null)}
              ／ サーバー：{formatClock(assessment.updatedAt)}
            </p>
          }
          confirmLabel="入力を復元する"
          cancelLabel="サーバーの内容を使う"
          onCancel={() => {
            window.localStorage.removeItem(localDraftKey(assessment.id));
            setLocalRestore(null);
          }}
          onConfirm={() => {
            if (localRestore) {
              changeVersionRef.current += 1;
              applyForm(localRestore.form, true);
              setSavedMessage('端末に残っていた入力を復元しました');
            }
            setLocalRestore(null);
          }}
        />
      </main>
    </div>
  );
}

function ExerciseSection({
  exercise,
  level,
  previousLevel,
  errors,
  disabled,
  onLevelChange,
  onErrorToggle,
}: {
  exercise: ExerciseDefinition;
  level: number | undefined;
  previousLevel: number | undefined;
  errors: string[];
  disabled: boolean;
  onLevelChange: (level: number) => void;
  onErrorToggle: (error: string) => void;
}) {
  // ラダーを開かなくても、狙っているLvの課題文を先に読めるようにする。
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? level;
  const delta = level === undefined || previousLevel === undefined ? undefined : level - previousLevel;

  return (
    <section className={`${styles.panel} ${styles.assessmentSection} ${level === undefined ? styles.sectionIncomplete : ''}`} id={`assessment-${exercise.key}`} data-assessment-section aria-labelledby={`${exercise.key}-title`}>
      <div className={styles.exerciseHeader}>
        <span className={styles.exerciseIcon} aria-hidden="true">{exercise.icon}</span>
        <div><h2 id={`${exercise.key}-title`}>{exercise.name}</h2><p>{exercise.parentName} — {exercise.clinicalName}</p></div>
        {level === undefined ? <span className={styles.unenteredBadge}>未入力</span> : null}
      </div>
      <div className={styles.lvGrid} aria-label={`${exercise.name}の到達レベル`} onMouseLeave={() => setPreview(null)}>
        {Array.from({ length: 21 }, (_, candidate) => {
          const classNames = [styles.lvButton];
          if (level === candidate) classNames.push(styles.lvButtonSelected);
          if (previousLevel === candidate) classNames.push(styles.lvButtonPrevious);
          return (
            <button
              disabled={disabled}
              className={classNames.join(' ')}
              key={candidate}
              type="button"
              aria-pressed={level === candidate}
              aria-label={`Lv${candidate}${previousLevel === candidate ? '、前回のレベル' : ''}`}
              title={ladderLabel(exercise.key, candidate)}
              onMouseEnter={() => setPreview(candidate)}
              onFocus={() => setPreview(candidate)}
              onBlur={() => setPreview(null)}
              onClick={() => onLevelChange(candidate)}
            >{candidate}</button>
          );
        })}
      </div>
      <div className={`${styles.selectedLevel} ${shown === undefined ? styles.selectedLevelEmpty : ''} ${preview !== null && preview !== level ? styles.lvPreview : ''}`} aria-live="polite">
        <strong>{shown === undefined ? '—' : `Lv${shown}`}</strong>
        <span>
          {shown === undefined
            ? `到達できた一番上のレベルを選びます${previousLevel === undefined ? '' : `（前回 Lv${previousLevel}）`}`
            : <>{ladderLabel(exercise.key, shown)}<small>帯：{shown === 0 ? '導入前' : bandOf(exercise.key, shown).name}{preview !== null && preview !== level ? '・選ぶ前の下見' : ''}</small></>}
        </span>
        {delta !== undefined && preview === null ? <em className={delta < 0 ? styles.deltaDown : styles.deltaUp}>{delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '前回と同じ'}</em> : null}
      </div>
      <details className={styles.ladderDetails}>
        <summary>ラダーの一覧（各Lvの課題）を見る</summary>
        <ol className={styles.ladderList} start={0}>
          {Array.from({ length: 21 }, (_, candidate) => (
            <li key={candidate}>
              <button className={level === candidate ? styles.ladderSelected : ''} type="button" disabled={disabled} onClick={() => onLevelChange(candidate)}>
                <strong>Lv{candidate}</strong><span>{ladderLabel(exercise.key, candidate)}</span>{previousLevel === candidate ? <em>前回</em> : null}
              </button>
            </li>
          ))}
        </ol>
      </details>
      <div className={styles.errorChips}>
        <strong>見えたつまずき（あれば）</strong>
        <div>
          {exercise.errors.map((error) => <button className={errors.includes(error) ? styles.errorChipSelected : styles.errorChip} aria-pressed={errors.includes(error)} type="button" disabled={disabled} onClick={() => onErrorToggle(error)} key={error}>{error}</button>)}
        </div>
      </div>
    </section>
  );
}

function PpiRow({
  question,
  value,
  previousValue,
  disabled,
  onChange,
}: {
  question: { key: PpiKey; name: string; question: string };
  value: number | undefined;
  previousValue: number | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className={styles.ppiQuestion}>
      <legend>{question.question}{previousValue === undefined ? '' : `（前回 ${previousValue}）`}</legend>
      <div className={styles.ppiScaleLabels}><span>ほぼ感じない</span><span>とても大きい</span></div>
      <div className={styles.ppiButtons} aria-label={question.name}>
        {Array.from({ length: 6 }, (_, score) => <button disabled={disabled} className={value === score ? styles.lvButtonSelected : styles.lvButton} key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)}>{score}</button>)}
      </div>
    </fieldset>
  );
}
