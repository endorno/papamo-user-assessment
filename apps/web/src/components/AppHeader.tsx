import { Link, useNavigate } from 'react-router';

import { useAuth } from '../auth/SupabaseAuthProvider';
import { coachInitial } from '../utils/display';
import styles from './AppHeader.module.css';

interface Breadcrumb {
  label: string;
  to?: string;
}

export function AppHeader({
  breadcrumbs,
  coachName,
}: {
  breadcrumbs: Breadcrumb[];
  coachName?: string | null;
}) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <header className={styles.header} data-print-hidden>
      <div className={styles.inner}>
        <Link className={styles.brand} to="/" aria-label="担当の子ども一覧へ">
          <span className={styles.mark} aria-hidden="true">育</span>
          <span>育ちマップ</span>
        </Link>
        <nav className={styles.breadcrumbs} aria-label="現在位置">
          <ol>
            {breadcrumbs.map((breadcrumb, index) => (
              <li key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span className={styles.separator} aria-hidden="true">／</span> : null}
                {breadcrumb.to ? <Link to={breadcrumb.to}>{breadcrumb.label}</Link> : <span aria-current="page">{breadcrumb.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.account}>
          <Link className={styles.profileLink} to="/me" aria-label="表示名を変更">
            <span className={styles.avatar} aria-hidden="true">{coachInitial(coachName)}</span>
            {coachName ? <span className={styles.coachName}>{coachName}</span> : null}
          </Link>
          <button type="button" onClick={() => void handleSignOut()}>ログアウト</button>
        </div>
      </div>
    </header>
  );
}
