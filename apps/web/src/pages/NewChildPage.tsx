import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { GRADES, todayInJst, childViewSchema, type ChildView, type GradeCode } from '@papamo/shared';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { CopyCode } from '../components/CopyCode';
import { useToast } from '../components/Toast';
import { honorificLabel } from '../utils/display';
import styles from '../styles/page.module.css';

export function NewChildPage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [honorific, setHonorific] = useState<'kun' | 'chan' | 'san'>('chan');
  // 就学／未就学で困りごとの設問が変わるため、既定値は置かずに必ず選ばせる。
  const [gradeCode, setGradeCode] = useState<GradeCode | ''>('');
  const [joinedOn, setJoinedOn] = useState(todayInJst());
  const [goalsText, setGoalsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ChildView | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !gradeCode) return;
    const goals = goalsText.split('\n').map((goal) => goal.trim()).filter(Boolean);
    if (goals.length > 5) {
      setError('目標は5件以内で入力してください。');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<unknown>('/children', session, {
        method: 'POST',
        body: JSON.stringify({ name, honorific, gradeCode, joinedOn, goals }),
      });
      const parsed = childViewSchema.safeParse((response as { child?: unknown }).child);
      if (!parsed.success) throw new Error('登録結果を読み込めませんでした。');
      setCreated(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

  async function startFirstAssessment(child: ChildView) {
    if (!session) return;
    setStarting(true);
    setError(null);
    try {
      const response = await apiRequest<unknown>(`/children/${child.id}/assessments`, session, {
        method: 'POST',
        body: JSON.stringify({ unlockExt: false }),
      });
      const assessmentId = (response as { assessment?: { id?: unknown } }).assessment?.id;
      if (typeof assessmentId !== 'string') throw new Error('作成結果を読み込めませんでした。');
      navigate(`/assessments/${assessmentId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'アセスメントを開始できませんでした。');
    } finally {
      setStarting(false);
    }
  }

  function registerAnother(child: ChildView) {
    showToast(`${child.name}${honorificLabel(child.honorific)}を登録しました。`);
    setCreated(null);
    setName('');
    setHonorific('chan');
    setGradeCode('');
    setJoinedOn(todayInJst());
    setGoalsText('');
    setError(null);
  }

  if (created) {
    const childName = `${created.name}${honorificLabel(created.honorific)}`;
    return (
      <div className={styles.pageFrame}>
        <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: '登録完了' }]} />
        <main className={styles.page}>
          <section className={`${styles.panel} ${styles.narrowPanel}`} aria-labelledby="created-title">
            <p className={styles.eyebrow}>登録完了</p>
            <h1 id="created-title">{childName}を登録しました</h1>
            <p className={styles.lead}>このまま初回アセスメントを始められます。</p>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.inlineActions}>
              <button className={styles.primaryButton} type="button" disabled={starting} onClick={() => void startFirstAssessment(created)}>
                {starting ? '準備中…' : '初回アセスメントを始める'}
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => registerAnother(created)}>
                続けて別のお子さまを登録
              </button>
              <button className={styles.secondaryButton} type="button" onClick={() => navigate(`/children/${created.id}`)}>
                {childName}のページへ
              </button>
            </div>
            <div className={styles.codeList}>
              <p className={styles.muted}>共有コードは、ほかのコーチと一緒に担当するときだけお使いください。子どもページからいつでも確認できます。</p>
              <CopyCode
                code={created.shareCode}
                label="担当に追加するコード"
                description="このコードで取り込んだコーチも、記録とレポートを編集できます。"
              />
              {created.ownerShareCode ? (
                <CopyCode
                  code={created.ownerShareCode}
                  label="オーナーを移すコード"
                  description="使った相手が新しいオーナーになります。引き継ぎ時以外は共有しないでください。"
                  sensitive
                />
              ) : null}
            </div>
            <div className={styles.inlineActions}>
              <Link className={styles.secondaryButton} to="/">一覧に戻る</Link>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const goalCount = goalsText.split('\n').map((goal) => goal.trim()).filter(Boolean).length;

  return (
    <div className={styles.pageFrame}>
      <AppHeader breadcrumbs={[{ label: '担当の子ども', to: '/' }, { label: '新しいお子さまを登録' }]} />
      <main className={styles.page}>
        <div className={`${styles.pageInner} ${styles.formPage}`}>
          <header className={styles.formPageHeader}>
            <p className={styles.eyebrow}>子ども登録</p>
            <h1 id="new-child-title">新しいお子さまを登録</h1>
            <p>あとから修正できます。姓・生年月日・住所は入力しません。</p>
          </header>
          <form className={`${styles.panel} ${styles.formPanel}`} aria-labelledby="new-child-title" onSubmit={handleSubmit}>
            <div className={styles.nameFields}>
              <div className={styles.formField}>
                <label htmlFor="child-name">お名前（下の名前）</label>
                <input id="child-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={30} autoComplete="off" />
              </div>
              <div className={styles.formField}>
                <label htmlFor="child-honorific">敬称</label>
                <select id="child-honorific" value={honorific} onChange={(event) => setHonorific(event.target.value as typeof honorific)}>
                  <option value="kun">くん</option>
                  <option value="chan">ちゃん</option>
                  <option value="san">さん</option>
                </select>
              </div>
            </div>
            <div className={styles.formField}>
              <label htmlFor="child-grade">現在の学年</label>
              <select id="child-grade" value={gradeCode} required onChange={(event) => setGradeCode(event.target.value as GradeCode)}>
                <option value="">選んでください</option>
                {GRADES.map((grade) => <option key={grade.code} value={grade.code}>{grade.name}（{grade.ageHint}）</option>)}
              </select>
              <small>毎年4月1日に自動で進級します。お困りごとの設問は学年で切り替わります。</small>
            </div>
            <div className={styles.formField}>
              <label htmlFor="joined-on">入会日</label>
              <input id="joined-on" type="date" value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} required />
            </div>
            <div className={styles.formField}>
              <label htmlFor="child-goals">ご家族・本人の目標（任意）</label>
              <textarea id="child-goals" value={goalsText} onChange={(event) => setGoalsText(event.target.value)} maxLength={504} rows={4} placeholder={'転びにくくなってほしい\n着替えを自分でできるようになりたい'} />
              <small className={goalCount > 5 ? styles.fieldError : ''}>1行に1件、5件まで（現在 {goalCount}件）</small>
            </div>
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.formActions}>
              <Link className={styles.secondaryButton} to="/">キャンセル</Link>
              <button className={styles.primaryButton} type="submit" disabled={submitting || !gradeCode || goalCount > 5}>
                {submitting ? '登録中…' : 'この内容で登録する'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
