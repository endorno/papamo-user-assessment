import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  assessmentDataDraftSchema,
  EXERCISES,
  PPI_QUESTIONS,
  PLANS,
  TROUBLE_CATEGORIES,
  type AgeGroup,
  type AssessmentData,
  type PpiKey,
} from '@papamo/shared';
import styles from '../styles/page.module.css';

interface AssessmentPayload {
  id: string;
  status: 'draft' | 'done';
  childId: string;
  assessedOn: string;
  unlockExt: boolean;
  updatedAt: string;
  readOnly: boolean;
  archivedAt: string | null;
  ageGroup: AgeGroup;
  data: AssessmentData;
}

function readAssessment(value: unknown): AssessmentPayload {
  const candidate = (value as { assessment?: unknown }).assessment as Record<string, unknown> | undefined;
  const data = assessmentDataDraftSchema.parse(candidate?.data);
  const child = candidate?.child as Record<string, unknown> | undefined;
  if (
    typeof candidate?.id !== 'string' ||
    (candidate.status !== 'draft' && candidate.status !== 'done') ||
    typeof candidate.assessedOn !== 'string' ||
    typeof candidate.childId !== 'string' ||
    typeof candidate.unlockExt !== 'boolean' ||
    typeof candidate.updatedAt !== 'string' ||
    typeof candidate.readOnly !== 'boolean' ||
    (child?.ageGroup !== 'pre' && child?.ageGroup !== 'sch')
  ) {
    throw new Error('アセスメント情報を読み込めませんでした。');
  }
  return {
    id: candidate.id,
    status: candidate.status,
    childId: candidate.childId,
    assessedOn: candidate.assessedOn,
    unlockExt: candidate.unlockExt,
    updatedAt: candidate.updatedAt,
    readOnly: candidate.readOnly,
    archivedAt: typeof child.archivedAt === 'string' ? child.archivedAt : null,
    ageGroup: child.ageGroup,
    data,
  };
}

function localDraftKey(id: string) {
  return `papamo:assessment:${id}`;
}

export function AssessmentPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [assessment, setAssessment] = useState<AssessmentPayload | null>(null);
  const [data, setData] = useState<AssessmentData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [localRestoreData, setLocalRestoreData] = useState<AssessmentData | null>(null);

  async function loadAssessment() {
    if (!session || !id) return;
    const response = await apiRequest<unknown>(`/assessments/${id}`, session);
    const loaded = readAssessment(response);
    setAssessment(loaded);
    setData(loaded.data);
    setDirty(false);
    setSaveError(null);
    const raw = window.localStorage.getItem(localDraftKey(loaded.id));
    if (!raw) return;
    try {
      const local = JSON.parse(raw) as { data?: unknown };
      const parsed = assessmentDataDraftSchema.safeParse(local.data);
      if (!loaded.readOnly && parsed.success && JSON.stringify(parsed.data) !== JSON.stringify(loaded.data)) setLocalRestoreData(parsed.data);
    } catch {
      window.localStorage.removeItem(localDraftKey(loaded.id));
    }
  }

  useEffect(() => {
    void loadAssessment().catch((caught) => setError(caught instanceof Error ? caught.message : '読み込みに失敗しました。'));
  }, [id, session]);

  useEffect(() => {
    if (!dirty || !assessment || !data) return;
    window.localStorage.setItem(localDraftKey(assessment.id), JSON.stringify({ data }));
  }, [assessment, data, dirty]);

  useEffect(() => {
    if (!dirty || !assessment || !data || !session || assessment.readOnly) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void apiRequest<unknown>(`/assessments/${assessment.id}`, session, {
        method: 'PATCH',
        body: JSON.stringify({ data, unlockExt: assessment.unlockExt, updatedAt: assessment.updatedAt }),
      })
        .then((response) => {
          const saved = readAssessment(response);
          setAssessment(saved);
          setData(saved.data);
          setDirty(false);
          setSaveError(null);
          window.localStorage.removeItem(localDraftKey(saved.id));
          setSavedMessage(`保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
        })
        .catch((caught) => {
          const message = caught instanceof Error ? caught.message : '保存に失敗しました。';
          setSaveError(message);
        })
        .finally(() => setSaving(false));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [assessment, data, dirty, session]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function updateData(update: (current: AssessmentData) => AssessmentData) {
    if (assessment?.readOnly) return;
    setData((current) => (current ? update(current) : current));
    setDirty(true);
    setSaveError(null);
    setSavedMessage('変更があります');
  }

  function toggleTrouble(trouble: string, checked: boolean) {
    updateData((current) => ({
      ...current,
      troubles: checked
        ? [...current.troubles, trouble]
        : current.troubles.filter((item) => item !== trouble),
    }));
  }

  async function complete() {
    if (!session || !assessment || assessment.readOnly || dirty || saving) return;
    setError(null);
    try {
      const response = await apiRequest<{ report: { kind: string } }>(`/assessments/${assessment.id}/complete`, session, {
        method: 'POST',
        body: JSON.stringify({ updatedAt: assessment.updatedAt }),
      });
      if (response.report) navigate(`/reports/${assessment.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'レポートを作成できませんでした。');
    }
  }

  async function discardDraft() {
    if (!session || !assessment || assessment.status !== 'draft') return;
    try {
      await apiRequest(`/assessments/${assessment.id}`, session, { method: 'DELETE' });
      window.localStorage.removeItem(localDraftKey(assessment.id));
      navigate(`/children/${assessment.childId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '下書きを破棄できませんでした。');
    }
  }

  if (error) return <main className={styles.page}><p className={styles.error} role="alert">{error}</p></main>;
  if (!assessment || !data) return <main className={styles.page}><p>読み込み中…</p></main>;

  const keys = EXERCISES.filter((exercise) => exercise.core || assessment.unlockExt);
  const missing = keys.filter((exercise) => data.lv[exercise.key] === undefined);
  const ppiMissing = PPI_QUESTIONS.filter(({ key }) => data.ppi[key] === undefined);
  const readOnlyMessage = assessment.archivedAt ? 'アーカイブ中のため閲覧のみです。' : '次のアセスメントがあるため、この回は閲覧のみです。';
  const saveStatus = saveError ?? (savedMessage || (saving ? '保存中…' : '変更は自動保存されます'));

  return (
    <main className={styles.page}>
      <div className={styles.pageInner}>
        <Link to={`/children/${assessment.childId}`} className={styles.backLink}>← 子どもページに戻る</Link>
        <div className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>アセスメント {assessment.status === 'done' ? '完了済み' : '入力中'}</p>
            <h1>今回の記録</h1>
            <p className={saveError ? styles.error : styles.muted}>{assessment.readOnly ? readOnlyMessage : saveStatus}</p>
            {saveError && !saveError.includes('他のコーチ') ? <button className={styles.secondaryButton} type="button" onClick={() => { setSaveError(null); setData((current) => current ? { ...current } : current); setDirty(true); }}>保存を再試行</button> : null}
            {saveError?.includes('他のコーチ') ? <button className={styles.secondaryButton} type="button" onClick={() => window.location.reload()}>最新の内容を読み込む</button> : null}
          </div>
          <div className={styles.headerActions}>
            <button className={styles.primaryButton} type="button" onClick={() => void complete()} disabled={Boolean(missing.length || ppiMissing.length || !data.plan || dirty || saving || assessment.readOnly)}>
              {saving ? '保存中…' : 'レポートを作る'}
            </button>
            {assessment.status === 'draft' && !assessment.readOnly ? <button className={styles.secondaryButton} type="button" onClick={() => setConfirmDiscard(true)}>下書きを破棄</button> : null}
          </div>
        </div>
        <section className={styles.panel} aria-labelledby="levels-title">
          <h2 id="levels-title">種目のLv</h2>
          {keys.map((exercise) => (
            <div className={styles.measurement} key={exercise.key}>
              <div><strong>{exercise.icon} {exercise.name}</strong><span className={styles.muted}> {exercise.parentName}</span></div>
              <div className={styles.lvGrid} aria-label={`${exercise.name}のLv`}>
                {Array.from({ length: 21 }, (_, level) => (
                  <button disabled={assessment.readOnly} className={data.lv[exercise.key] === level ? styles.lvButtonSelected : styles.lvButton} key={level} type="button" aria-pressed={data.lv[exercise.key] === level} onClick={() => updateData((current) => ({ ...current, lv: { ...current.lv, [exercise.key]: level } }))}>{level}</button>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section className={styles.panel} aria-labelledby="troubles-title">
          <h2 id="troubles-title">困りごと</h2>
          <div className={styles.troubleCategories}>
            {TROUBLE_CATEGORIES[assessment.ageGroup].map((category) => (
              <fieldset className={styles.troubleCategory} key={category.id}>
                <legend>{category.icon} {category.title}</legend>
                {category.items.map((trouble) => <label className={styles.troubleOption} key={trouble}><input type="checkbox" checked={data.troubles.includes(trouble)} disabled={assessment.readOnly} onChange={(event) => toggleTrouble(trouble, event.target.checked)} />{trouble}</label>)}
              </fieldset>
            ))}
          </div>
        </section>
        <section className={styles.panel} aria-labelledby="ppi-title">
          <h2 id="ppi-title">ご家庭の負担度</h2>
          {PPI_QUESTIONS.map((question) => <PpiRow key={question.key} question={question} value={data.ppi[question.key]} disabled={assessment.readOnly} onChange={(value) => updateData((current) => ({ ...current, ppi: { ...current.ppi, [question.key]: value } }))} />)}
        </section>
        <section className={styles.panel} aria-labelledby="plan-title">
          <h2 id="plan-title">3か月の運動計画</h2>
          <select disabled={assessment.readOnly} value={data.plan ?? ''} onChange={(event) => updateData((current) => ({ ...current, plan: (event.target.value || null) as AssessmentData['plan'] }))} aria-label="運動計画">
            <option value="">選択してください</option>
            {Object.entries(PLANS).map(([key, plan]) => <option key={key} value={key}>{plan.name}</option>)}
          </select>
        </section>
        <ConfirmDialog
          open={confirmDiscard}
          title="下書きを破棄しますか？"
          message="この回の入力を削除し、子どもページに戻ります。"
          confirmLabel="破棄する"
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { setConfirmDiscard(false); void discardDraft(); }}
        />
        <ConfirmDialog
          open={localRestoreData !== null}
          title="保存できていない入力があります"
          message="端末に残っている入力を復元しますか？復元後に自動保存されます。"
          confirmLabel="復元する"
          onCancel={() => setLocalRestoreData(null)}
          onConfirm={() => {
            if (localRestoreData) {
              setData(localRestoreData);
              setDirty(true);
              setSavedMessage('端末に残っていた入力を復元しました');
            }
            setLocalRestoreData(null);
          }}
        />
      </div>
    </main>
  );
}

function PpiRow({ question, value, disabled, onChange }: { question: { key: PpiKey; name: string }; value: number | undefined; disabled: boolean; onChange: (value: number) => void }) {
  return <div className={styles.ppiRow}><span>{question.name}</span><div className={styles.ppiButtons}>{Array.from({ length: 6 }, (_, score) => <button disabled={disabled} className={value === score ? styles.lvButtonSelected : styles.lvButton} key={score} type="button" aria-pressed={value === score} onClick={() => onChange(score)}>{score}</button>)}</div></div>;
}
