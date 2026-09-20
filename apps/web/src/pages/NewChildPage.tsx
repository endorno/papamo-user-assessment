import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { GRADES, todayInJst, childViewSchema, type GradeCode, type Honorific } from '@papamo/shared';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { AppHeader } from '../components/AppHeader';
import { useToast } from '../components/Toast';
import { honorificLabel } from '../utils/display';
import styles from '../styles/page.module.css';

export function NewChildPage() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [honorific, setHonorific] = useState<Honorific>('chan');
  // 就学／未就学で困りごとの設問が変わるため、既定値は置かずに必ず選ばせる。
  const [gradeCode, setGradeCode] = useState<GradeCode | ''>('');
  const [joinedOn, setJoinedOn] = useState(todayInJst());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !gradeCode) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<unknown>('/children', session, {
        method: 'POST',
        body: JSON.stringify({ name, honorific, gradeCode, joinedOn }),
      });
      const parsed = childViewSchema.safeParse((response as { child?: unknown }).child);
      if (!parsed.success) throw new Error('登録結果を読み込めませんでした。');
      const child = parsed.data;
      showToast(`${child.name}${honorificLabel(child.honorific)}を登録しました。`, {
        action: { label: '続けて登録', onClick: () => void navigate('/children/new') },
      });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登録に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  }

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
                  <option value="none">なし</option>
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
            {error ? <p className={styles.formError} role="alert">{error}</p> : null}
            <div className={styles.formActions}>
              <Link className={styles.secondaryButton} to="/">キャンセル</Link>
              <button className={styles.primaryButton} type="submit" disabled={submitting || !gradeCode}>
                {submitting ? '登録中…' : 'この内容で登録する'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
