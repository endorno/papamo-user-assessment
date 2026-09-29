import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import {
  assessmentDataDraftSchema,
  assessmentResponseSchema,
  bandName,
  COPM_FIELDS,
  COPM_MAX,
  COPM_SCORE_DEFAULT,
  COPM_SCORE_MAX,
  COPM_SCORE_MIN,
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  ENVIRONMENT_SUPPORT_GROUPS,
  EXERCISES,
  ladderLabel,
  LEVEL_NOT_MEASURED,
  LEVEL_NOT_MEASURED_LABEL,
  LEVEL_NOT_POSSIBLE,
  LEVEL_NOT_POSSIBLE_LABEL,
  PPI_QUESTIONS,
  PPI_SCORE_MAX,
  TEXT_LIMITS,
  TROUBLE_CATEGORIES,
  WANT_GROUPS,
  WANT_ITEMS,
  WANT_MAX,
  wantToGoalText,
  withoutExtExerciseInput,
  type AssessmentData,
  type AssessmentDetail,
  type CopmGoal,
  type EngagementKey,
  type ExerciseDefinition,
  type PpiKey,
} from '@papamo/shared';
import { apiRequest, ApiClientError } from '../api/client';
import { useUnsavedChanges } from '../app/UnsavedChangesContext';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SurveyImportDialog, type SurveyImport } from '../components/SurveyImportDialog';
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

function clockNow() {
  return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatClock(value: string | null) {
  if (!value) return '時刻不明';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '時刻不明';
  return parsed.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function savedMessageFor(assessment: AssessmentDetail) {
  return assessment.status === 'done'
    ? `保存済み・レポートも更新しました ${clockNow()}`
    : `保存済み ${clockNow()}`;
}

/** 作っただけの下書きは、確認なしで捨ててよい。 */
function hasAnyInput(form: AssessmentFormState) {
  const {
    lv, ppi, observations, observationNotes, engagement, envSupports,
    troubles, wants, copm, memo, ppiNote,
  } = form.data;
  return Boolean(
    Object.keys(lv).length
    || Object.keys(ppi).length
    || Object.keys(engagement).length
    || envSupports.length
    || troubles.length
    || wants.length
    || copm.length
    || Object.values(observations).some((selected) => selected?.length)
    || Object.values(observationNotes).some((note) => note?.trim())
    || memo.trim()
    || ppiNote.trim(),
  );
}

/** PATCH の本文。自動保存と離脱時の送信で同じ形を使う。 */
function patchBody(form: AssessmentFormState, assessment: AssessmentDetail) {
  return JSON.stringify({
    assessedOn: form.assessedOn,
    unlockExt: form.unlockExt,
    data: form.data,
    updatedAt: assessment.updatedAt,
  });
}

function emptyCopmGoal(text = ''): CopmGoal {
  return {
    text,
    memo: '',
    performance: COPM_SCORE_DEFAULT,
    satisfaction: COPM_SCORE_DEFAULT,
    importance: COPM_SCORE_DEFAULT,
  };
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
  const [showSurveyImport, setShowSurveyImport] = useState(false);
  const [wantLimitNotice, setWantLimitNotice] = useState(false);

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

  // 読み込むのは開いたとき（とログイン直後）だけ。トークンの更新で読み直すと、入力中の内容をサーバーの内容で上書きしてしまう。
  const hasSession = Boolean(session);
  useEffect(() => {
    if (!hasSession) return;
    void loadAssessment().catch((caught) => {
      if (!returnToListIfDeleted(caught)) {
        setPageError(caught instanceof Error ? caught.message : '読み込みに失敗しました。');
      }
    });
  }, [hasSession, loadAssessment, returnToListIfDeleted]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (inFlightRef.current) await inFlightRef.current;
    const currentForm = formRef.current;
    const currentAssessment = assessmentRef.current;
    const currentSession = sessionRef.current;
    if (!dirtyRef.current || !currentForm || !currentAssessment || !currentSession || currentAssessment.readOnly) {
      return true;
    }
    const savedVersion = changeVersionRef.current;
    const request = (async () => {
      setSaving(true);
      setSavedMessage('保存中…');
      try {
        const response = await apiRequest<unknown>(`/assessments/${currentAssessment.id}`, currentSession, {
          method: 'PATCH',
          body: patchBody(currentForm, currentAssessment),
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
    void fetch(`/api/assessments/${currentAssessment.id}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.access_token}`,
      },
      body: patchBody(currentForm, currentAssessment),
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

  function toggleObservation(exercise: ExerciseDefinition, observation: string) {
    updateData((current) => {
      const selected = current.observations[exercise.key] ?? [];
      return {
        ...current,
        observations: {
          ...current.observations,
          [exercise.key]: selected.includes(observation)
            ? selected.filter((item) => item !== observation)
            : [...selected, observation],
        },
      };
    });
  }

  function setObservationNote(exercise: ExerciseDefinition, note: string) {
    updateText((current) => ({
      ...current,
      observationNotes: { ...current.observationNotes, [exercise.key]: note },
    }));
  }

  function toggleEnvSupport(key: string, checked: boolean) {
    updateData((current) => ({
      ...current,
      envSupports: checked
        ? [...current.envSupports, key]
        : current.envSupports.filter((item) => item !== key),
    }));
  }

  // 「できるようになりたいこと」を選ぶと、空いている目標欄へ仮の文言を入れる。
  function toggleWant(id: string, checked: boolean) {
    const current = formRef.current;
    if (!current) return;
    if (checked && current.data.wants.length >= WANT_MAX) {
      setWantLimitNotice(true);
      return;
    }
    setWantLimitNotice(false);
    const want = WANT_ITEMS.find((item) => item.id === id);
    const suggestion = want ? wantToGoalText(want.text) : '';
    updateData((data) => {
      const wants = checked ? [...data.wants, id] : data.wants.filter((item) => item !== id);
      if (!checked || !suggestion) return { ...data, wants };
      const alreadyListed = data.copm.some((goal) => goal.text === suggestion);
      if (alreadyListed || data.copm.length >= COPM_MAX) return { ...data, wants };
      return { ...data, wants, copm: [...data.copm, emptyCopmGoal(suggestion)] };
    });
  }

  function updateCopmGoal(index: number, update: (goal: CopmGoal) => CopmGoal, delay = SAVE_DELAY_MS) {
    updateData((data) => ({
      ...data,
      copm: data.copm.map((goal, position) => (position === index ? update(goal) : goal)),
    }), delay);
  }

  function addCopmGoal() {
    updateData((data) => (
      data.copm.length >= COPM_MAX ? data : { ...data, copm: [...data.copm, emptyCopmGoal()] }
    ));
  }

  function removeCopmGoal(index: number) {
    updateData((data) => ({ ...data, copm: data.copm.filter((_, position) => position !== index) }));
  }

  // 事前アンケートの回答で、お困りごと・目標・お困り度をまとめて置き換える。
  // 回答がなかった項目には触らず、コーチの手入力を消さない。
  function importSurvey(result: SurveyImport) {
    updateData((data) => ({
      ...data,
      ...(result.troubles.length ? { troubles: result.troubles } : {}),
      ...(result.wants.length ? { wants: result.wants } : {}),
      ...(result.goals.length
        ? {
            copm: result.goals.slice(0, COPM_MAX).map((text) => {
              const existing = data.copm.find((goal) => goal.text === text);
              return existing ? { ...existing } : emptyCopmGoal(text);
            }),
          }
        : {}),
      ...(Object.keys(result.ppi).length ? { ppi: { ...data.ppi, ...result.ppi } } : {}),
      ...(result.ppiNote ? { ppiNote: result.ppiNote } : {}),
    }));
  }

  function toggleUnlockExt(checked: boolean) {
    updateForm((current) => ({
      ...current,
      unlockExt: checked,
      data: withoutExtExerciseInput(current.data, checked),
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
    ...form.data.copm.flatMap((goal, index) => (
      goal.text.trim() ? [] : [{ target: `copm-text-${index}`, label: `目標${index + 1}の文言` }]
    )),
    ...(missingPpi.length ? [{ target: 'assessment-ppi', label: `ご家庭のお困り度 あと${missingPpi.length}問` }] : []),
  ];
  const canComplete = completionIssues.length === 0 && !dirty && !saving && !assessment.readOnly && !completing;
  const conflict = saveError instanceof ApiClientError && saveError.code === 'conflict';
  const readOnlyMessage = assessment.child.archivedAt ? 'アーカイブ中のため閲覧のみです。' : '次のアセスメントがあるため、この回は閲覧のみです。';
  const canToggleUnlock = !assessment.child.extUnlocked && assessment.status === 'draft' && !assessment.readOnly;
  const answeredEngagement = ENGAGEMENT_AXES.filter(({ key }) => form.data.engagement[key as EngagementKey] !== undefined);
  const troubleCategories = TROUBLE_CATEGORIES[assessment.child.ageGroup];
  const troubleOptions = troubleCategories.flatMap((category) => category.items.map(({ text }) => text));
  const navSections = [
    { id: 'assessment-basic', label: '基本情報', complete: true },
    ...exercises.map((exercise) => ({ id: `assessment-${exercise.key}`, label: `${exercise.icon} ${exercise.name}`, complete: form.data.lv[exercise.key] !== undefined })),
    { id: 'assessment-engagement', label: '取り組みの発達', complete: answeredEngagement.length > 0 },
    { id: 'assessment-troubles', label: 'お困りごと', complete: form.data.troubles.length > 0 },
    { id: 'assessment-goals', label: 'ご家族・本人の目標', complete: form.data.copm.length > 0 },
    { id: 'assessment-ppi', label: 'ご家庭のお困り度', complete: missingPpi.length === 0 },
    { id: 'assessment-memo', label: 'コーチ所見メモ', complete: true },
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
              <div className={styles.sectionHeader}><div><h2 id="basic-title">基本情報</h2><p className={styles.muted}>今回の実施日を確認します</p></div></div>
              <div className={styles.basicGrid}>
                <div className={styles.formField}>
                  <label htmlFor="assessed-on">実施日</label>
                  <input
                    id="assessed-on"
                    type="date"
                    required
                    value={form.assessedOn}
                    disabled={assessment.readOnly}
                    onChange={(event) => {
                      // 日付を消した状態は保存できない（自動保存が止まる）ので、入れ直すまで前の日付を保つ。
                      const assessedOn = event.target.value;
                      if (assessedOn) updateForm((current) => ({ ...current, assessedOn }));
                    }}
                  />
                </div>
                <div className={styles.formField}>
                  <label htmlFor="assessment-sequence">回数</label>
                  <input id="assessment-sequence" value={`第${assessment.seqNo}回`} readOnly />
                </div>
              </div>
              {assessment.previous ? <p className={styles.infoNote}>前回（第{assessment.previous.seqNo}回・{formatJapaneseDate(assessment.previous.assessedOn)}）と比較したレポートになります。</p> : null}
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

            <div className={`${styles.inputArea} ${styles.inputAreaObserved}`}>
              <p className={styles.inputAreaHead}>
                <strong>1.アセスメント</strong>
                <small>レッスン中に見た様子をそのまま記録します</small>
              </p>

            {exercises.map((exercise) => (
              <ExerciseSection
                key={exercise.key}
                exercise={exercise}
                level={form.data.lv[exercise.key]}
                previousLevel={assessment.previous?.lv[exercise.key]}
                observations={form.data.observations[exercise.key] ?? []}
                note={form.data.observationNotes[exercise.key] ?? ''}
                disabled={assessment.readOnly}
                onLevelChange={(level) => updateData((current) => ({ ...current, lv: { ...current.lv, [exercise.key]: level } }))}
                onObservationToggle={(observation) => toggleObservation(exercise, observation)}
                onNoteChange={(note) => setObservationNote(exercise, note)}
              />
            ))}

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-engagement" data-assessment-section aria-labelledby="engagement-title">
              <div className={styles.sectionHeader}><div><h2 id="engagement-title">2.取り組みの発達</h2><p className={styles.muted}>運動レベルとは別に、どう取り組めたかを記録します</p></div></div>
              {ENGAGEMENT_AXES.map((axis) => {
                const value = form.data.engagement[axis.key as EngagementKey];
                const previous = assessment.previous?.engagement[axis.key as EngagementKey];
                return (
                  <div className={styles.engagementRow} key={axis.key}>
                    <label htmlFor={`engagement-${axis.key}`}>
                      <strong>{axis.title}</strong>
                      <small>{axis.subtitle}{previous === undefined ? '' : `（前回 ${previous + 1}/${ENGAGEMENT_LEVEL_COUNT}）`}</small>
                    </label>
                    <select
                      id={`engagement-${axis.key}`}
                      value={value === undefined ? '' : String(value)}
                      disabled={assessment.readOnly}
                      onChange={(event) => updateData((current) => {
                        const engagement = { ...current.engagement };
                        if (event.target.value === '') delete engagement[axis.key as EngagementKey];
                        else engagement[axis.key as EngagementKey] = Number(event.target.value);
                        return { ...current, engagement };
                      })}
                    >
                      <option value="">未評価</option>
                      {axis.levels.map((label, index) => <option key={label} value={index}>{index + 1}. {label}</option>)}
                    </select>
                  </div>
                );
              })}
              <fieldset className={styles.envSupports}>
                <legend>環境調整（今回きいた条件・複数選択可）</legend>
                <p className={styles.muted}>高い低いではなく、この子が取り組みやすくなる条件の記録です。次のレッスンで何を用意するかの引き継ぎに使います。</p>
                <div className={styles.envGroups}>
                  {ENVIRONMENT_SUPPORT_GROUPS.map((group) => (
                    <div className={styles.envGroup} key={group.group}>
                      <strong>{group.group}</strong>
                      {group.items.map((item) => (
                        <label className={`${styles.troubleOption} ${form.data.envSupports.includes(item.key) ? styles.optionSelected : ''}`} key={item.key}>
                          <input type="checkbox" checked={form.data.envSupports.includes(item.key)} disabled={assessment.readOnly} onChange={(event) => toggleEnvSupport(item.key, event.target.checked)} />
                          <span>{item.text}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>
            </section>

            </div>

            <div className={`${styles.inputArea} ${styles.inputAreaSurvey}`}>
              <p className={styles.inputAreaHead}>
                <strong>保護者と確認して記入</strong>
                <small>その場で聞いても、あとから相談しても構いません</small>
                {assessment.readOnly ? null : (
                  <button className={styles.compactButton} type="button" onClick={() => setShowSurveyImport(true)}>事前アンケートから取り込む</button>
                )}
              </p>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-troubles" data-assessment-section aria-labelledby="troubles-title">
              <div className={styles.sectionHeader}><div><h2 id="troubles-title">3.お子さまのお困りごと</h2><p className={styles.muted}>保護者に聞き取り・当てはまるものを選択</p></div></div>
              <div className={styles.troubleCategories}>
                {troubleCategories.map((category) => (
                  <fieldset className={styles.troubleCategory} key={category.id}>
                    <legend>{category.icon} {category.title}</legend>
                    {category.items.map(({ text }) => (
                      <label className={`${styles.troubleOption} ${form.data.troubles.includes(text) ? styles.optionSelected : ''}`} key={text}>
                        <input type="checkbox" checked={form.data.troubles.includes(text)} disabled={assessment.readOnly} onChange={(event) => toggleTrouble(text, event.target.checked)} />
                        <span>{text}{assessment.previous?.troubles.includes(text) ? <small className={styles.previousTag}>前回も</small> : null}</span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-goals" data-assessment-section aria-labelledby="goals-title">
              <div className={styles.sectionHeader}><div><h2 id="goals-title">4.ご家族・本人の目標</h2><p className={styles.muted}>最大{COPM_MAX}つ。3か月後に同じ設問で採点し直し、差分を見ます</p></div></div>

              <fieldset className={styles.wantBox}>
                <legend>できるようになりたいこと（{form.data.wants.length}/{WANT_MAX}）</legend>
                <p className={styles.muted}>お困りごと（いま困っていること）とは別に、達成したい具体的なことを選びます。選ぶと下の目標欄に仮の文言が入るので、ご家族の言葉に書き換えてください。</p>
                {wantLimitNotice ? <p className={styles.formError} role="alert">できるようになりたいことは最大{WANT_MAX}つまでです。</p> : null}
                <div className={styles.envGroups}>
                  {WANT_GROUPS.map((group) => (
                    <div className={styles.envGroup} key={group}>
                      <strong>{group}</strong>
                      {WANT_ITEMS.filter((item) => item.group === group).map((item) => (
                        <label className={`${styles.troubleOption} ${form.data.wants.includes(item.id) ? styles.optionSelected : ''}`} key={item.id}>
                          <input type="checkbox" checked={form.data.wants.includes(item.id)} disabled={assessment.readOnly} onChange={(event) => toggleWant(item.id, event.target.checked)} />
                          <span>{item.icon} {item.text}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </fieldset>

              <p className={styles.infoNote}>「できる／できない」ではなく、<b>いまどれくらいできているか（遂行度）</b>と<b>その状態にどれくらい納得しているか（満足度）</b>を分けて聞きます。<b>親御さんにとっての重要度</b>は、取り組む順番を決めるために使います。</p>

              {form.data.copm.length === 0 ? <p className={styles.muted}>目標はまだ登録されていません。上から選ぶか、「目標を追加」で入力してください。</p> : null}
              {form.data.copm.map((goal, index) => {
                const previous = assessment.previous?.copm.find((candidate) => candidate.text === goal.text);
                return (
                  <div className={styles.copmRow} key={index}>
                    <div className={styles.formField}>
                      <label htmlFor={`copm-text-${index}`}>目標 {index + 1}</label>
                      <textarea id={`copm-text-${index}`} rows={2} value={goal.text} maxLength={TEXT_LIMITS.copmText} disabled={assessment.readOnly} onChange={(event) => updateCopmGoal(index, (current) => ({ ...current, text: event.target.value }), TEXT_SAVE_DELAY_MS)} />
                    </div>
                    <div className={styles.formField}>
                      <label htmlFor={`copm-memo-${index}`}>メモ</label>
                      <textarea id={`copm-memo-${index}`} rows={2} value={goal.memo} maxLength={TEXT_LIMITS.copmMemo} disabled={assessment.readOnly} onChange={(event) => updateCopmGoal(index, (current) => ({ ...current, memo: event.target.value }), TEXT_SAVE_DELAY_MS)} />
                    </div>
                    <div className={styles.copmScores}>
                      {COPM_FIELDS.map((field) => (
                        <CopmScore
                          key={field.key}
                          label={field.name}
                          id={`copm-${field.key}-${index}`}
                          value={goal[field.key]}
                          previous={previous?.[field.key]}
                          disabled={assessment.readOnly}
                          onChange={(value) => updateCopmGoal(index, (current) => ({ ...current, [field.key]: value }))}
                        />
                      ))}
                      {assessment.readOnly ? null : <button className={styles.textDangerButton} type="button" onClick={() => removeCopmGoal(index)}>この目標を削除</button>}
                    </div>
                  </div>
                );
              })}
              {!assessment.readOnly && form.data.copm.length < COPM_MAX ? (
                <div className={styles.inlineActions}>
                  <button className={styles.secondaryButton} type="button" onClick={addCopmGoal}>目標を追加</button>
                </div>
              ) : null}
            </section>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-ppi" data-assessment-section aria-labelledby="ppi-title">
              <div className={styles.sectionHeader}><div><h2 id="ppi-title">5.ご家庭のお困り度</h2><p className={styles.muted}>0〜{PPI_SCORE_MAX}・{PPI_QUESTIONS.length}問すべて回答してください</p></div></div>
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
                <input id="ppi-note" value={form.data.ppiNote} maxLength={TEXT_LIMITS.ppiNote} disabled={assessment.readOnly} onChange={(event) => updateText((current) => ({ ...current, ppiNote: event.target.value }))} />
              </div>
            </section>

            </div>

            <section className={`${styles.panel} ${styles.assessmentSection}`} id="assessment-memo" data-assessment-section aria-labelledby="memo-title">
              <div className={styles.sectionHeader}><div><h2 id="memo-title">6.コーチ所見メモ</h2><p className={styles.muted}>内部用です。保護者レポートには出ません</p></div></div>
              <div className={styles.formField}>
                <label htmlFor="coach-memo">コーチ所見メモ（内部用）</label>
                <textarea id="coach-memo" rows={4} value={form.data.memo} maxLength={TEXT_LIMITS.memo} disabled={assessment.readOnly} onChange={(event) => updateText((current) => ({ ...current, memo: event.target.value }))} />
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
        <SurveyImportDialog
          open={showSurveyImport}
          troubleOptions={troubleOptions}
          onCancel={() => setShowSurveyImport(false)}
          onImport={(result) => {
            importSurvey(result);
            setShowSurveyImport(false);
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
  observations,
  note,
  disabled,
  onLevelChange,
  onObservationToggle,
  onNoteChange,
}: {
  exercise: ExerciseDefinition;
  level: number | undefined;
  previousLevel: number | undefined;
  observations: string[];
  note: string;
  disabled: boolean;
  onLevelChange: (level: number) => void;
  onObservationToggle: (observation: string) => void;
  onNoteChange: (note: string) => void;
}) {
  // 未実施・実施不可は差分の対象にしない。
  const delta = level === undefined || previousLevel === undefined || level <= 0 || previousLevel <= 0
    ? undefined
    : level - previousLevel;
  const bandGroups = exercise.bands.map((band, index) => {
    const from = index === 0 ? 1 : exercise.bands[index - 1]!.to + 1;
    return { ...band, from, levels: Array.from({ length: band.to - from + 1 }, (_, offset) => from + offset) };
  });
  const levelSelectId = `level-${exercise.key}`;

  return (
    <section className={`${styles.panel} ${styles.assessmentSection} ${level === undefined ? styles.sectionIncomplete : ''}`} id={`assessment-${exercise.key}`} data-assessment-section aria-labelledby={`${exercise.key}-title`}>
      <div className={styles.exerciseHeader}>
        <span className={styles.exerciseIcon} aria-hidden="true">{exercise.icon}</span>
        <div>
          <h2 id={`${exercise.key}-title`}>{exercise.name}</h2>
          <p>{exercise.clinicalName}／{exercise.summary}</p>
        </div>
        {level === undefined ? <span className={styles.unenteredBadge}>未入力</span> : null}
      </div>
      <div className={styles.levelSelectRow}>
        <label htmlFor={levelSelectId}>到達</label>
        <select
          id={levelSelectId}
          className={styles.levelSelect}
          value={level ?? ''}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value === '') return;
            onLevelChange(Number(event.target.value));
          }}
        >
          {/* 未入力は「未実施」と区別するため、選ばれるまで空の行を出す */}
          {level === undefined ? <option value="" disabled>選択してください</option> : null}
          <option value={LEVEL_NOT_MEASURED}>{LEVEL_NOT_MEASURED_LABEL}</option>
          <option value={LEVEL_NOT_POSSIBLE}>{LEVEL_NOT_POSSIBLE_LABEL}</option>
          {bandGroups.map((band) => (
            <optgroup key={band.to} label={`${band.name}（Lv${band.from}〜${band.to}）`}>
              {band.levels.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {`Lv${candidate}\u3000`}{ladderLabel(exercise.key, candidate)}{previousLevel === candidate ? '（前回）' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={`${styles.selectedLevel} ${level === undefined ? styles.selectedLevelEmpty : ''}`} aria-live="polite">
        <strong>{level === undefined ? '—' : level > 0 ? `Lv${level}` : level === LEVEL_NOT_POSSIBLE ? '不可' : '未実施'}</strong>
        <span>
          {level === undefined
            ? `到達できた一番上のレベルを選びます${previousLevel === undefined ? '' : `（前回 Lv${previousLevel}）`}`
            : level > 0
              ? <>{ladderLabel(exercise.key, level)}<small>帯：{bandName(exercise.key, level)}</small></>
              : <>{level === LEVEL_NOT_POSSIBLE ? LEVEL_NOT_POSSIBLE_LABEL : LEVEL_NOT_MEASURED_LABEL}<small>レポートでは「できない」という意味では扱いません</small></>}
        </span>
        {delta !== undefined ? <em className={delta < 0 ? styles.deltaDown : styles.deltaUp}>{delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '前回と同じ'}</em> : null}
      </div>
      <div className={styles.errorChips}>
        <strong>見えた動作（該当するものを選択）</strong>
        <div>
          {exercise.observations.map(({ text }) => (
            <button className={observations.includes(text) ? styles.errorChipSelected : styles.errorChip} aria-pressed={observations.includes(text)} type="button" disabled={disabled} onClick={() => onObservationToggle(text)} key={text}>{text}</button>
          ))}
        </div>
      </div>
      <div className={styles.formField}>
        <label htmlFor={`observation-note-${exercise.key}`}>見えた動作（自由記入）</label>
        <small className={styles.muted}>選択肢に当てはまらない動きだけ書きます。</small>
        <textarea
          id={`observation-note-${exercise.key}`}
          rows={2}
          value={note}
          maxLength={TEXT_LIMITS.observationNote}
          disabled={disabled}
          placeholder="例：Lv9で頭上物が2試行とも落下。後進になると振り返る動作が出る。"
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </section>
  );
}

function CopmScore({
  label,
  id,
  value,
  previous,
  disabled,
  onChange,
}: {
  label: string;
  id: string;
  value: number;
  previous: number | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const scores = Array.from(
    { length: COPM_SCORE_MAX - COPM_SCORE_MIN + 1 },
    (_, index) => COPM_SCORE_MIN + index,
  );
  return (
    <div className={styles.formField}>
      <label htmlFor={id}>{label}{previous === undefined ? null : <small className={styles.copmPrevious}>前回 {previous}</small>}</label>
      <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>
        {scores.map((score) => <option key={score} value={score}>{score}</option>)}
      </select>
    </div>
  );
}

function PpiRow({
  question,
  value,
  previousValue,
  disabled,
  onChange,
}: {
  question: { key: PpiKey; name: string; question: string; lowLabel: string; highLabel: string };
  value: number | undefined;
  previousValue: number | undefined;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className={styles.ppiQuestion}>
      <legend>{question.question}{previousValue === undefined ? '' : `（前回 ${previousValue}）`}</legend>
      <div className={styles.ppiScaleLabels}><span>0 {question.lowLabel}</span><span>{question.highLabel} {PPI_SCORE_MAX}</span></div>
      <div className={styles.ppiButtons} aria-label={question.name}>
        {Array.from({ length: PPI_SCORE_MAX + 1 }, (_, score) => <button disabled={disabled} className={value === score ? styles.lvButtonSelected : styles.lvButton} key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)}>{score}</button>)}
      </div>
    </fieldset>
  );
}
