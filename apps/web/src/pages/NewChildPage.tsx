import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { apiRequest } from '../api/client';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { GRADES, todayInJst, childViewSchema, type ChildView } from '@papamo/shared';
import styles from '../styles/auth.module.css';

export function NewChildPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [honorific, setHonorific] = useState<'kun' | 'chan' | 'san'>('chan');
  const [gradeCode, setGradeCode] = useState<(typeof GRADES)[number]['code']>('e1');
  const [joinedOn, setJoinedOn] = useState(todayInJst());
  const [goal, setGoal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ChildView | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    try {
      const response = await apiRequest<unknown>('/children', session, {
        method: 'POST',
        body: JSON.stringify({ name, honorific, gradeCode, joinedOn, goals: goal ? [goal] : [] }),
      });
      const parsed = childViewSchema.safeParse((response as { child?: unknown }).child);
      if (!parsed.success) throw new Error('登録結果を読み込めませんでした。');
      setCreated(parsed.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登録に失敗しました。');
    }
  }

  if (created) {
    return (
      <main className={styles.page}>
        <section className={styles.card} aria-labelledby="created-title">
          <p className={styles.eyebrow}>登録完了</p>
          <h1 id="created-title">{created.name}さんを登録しました</h1>
          <p className={styles.description}>共有コードを必要なコーチに伝えてください。</p>
          <div className={styles.codeBox}>
            <span>通常コード</span>
            <strong>{created.shareCode}</strong>
            {created.ownerShareCode ? (
              <>
                <span>オーナー移譲コード（大切に保管）</span>
                <strong>{created.ownerShareCode}</strong>
              </>
            ) : null}
          </div>
          <button className={styles.primaryButton} type="button" onClick={() => navigate(`/children/${created.id}`)}>
            子どもページへ
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="new-child-title">
        <p className={styles.eyebrow}>子ども登録</p>
        <h1 id="new-child-title">新しいお子さまを登録</h1>
        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="child-name">お名前（下の名前）</label>
          <input id="child-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={30} />
          <label htmlFor="child-honorific">敬称</label>
          <select id="child-honorific" value={honorific} onChange={(event) => setHonorific(event.target.value as typeof honorific)}>
            <option value="kun">くん</option>
            <option value="chan">ちゃん</option>
            <option value="san">さん</option>
          </select>
          <label htmlFor="child-grade">学年</label>
          <select id="child-grade" value={gradeCode} onChange={(event) => setGradeCode(event.target.value as typeof gradeCode)}>
            {GRADES.map((grade) => <option key={grade.code} value={grade.code}>{grade.name}（{grade.ageHint}）</option>)}
          </select>
          <label htmlFor="joined-on">入会日</label>
          <input id="joined-on" type="date" value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} required />
          <label htmlFor="child-goal">目標（任意）</label>
          <input id="child-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={100} />
          <button className={styles.primaryButton} type="submit">登録する</button>
        </form>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <Link className={styles.backLink} to="/">一覧に戻る</Link>
      </section>
    </main>
  );
}
