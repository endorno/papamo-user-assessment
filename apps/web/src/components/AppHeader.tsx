import { useNavigate } from 'react-router';

import { GuardedLink, useUnsavedChanges } from '../app/UnsavedChangesContext';
import { useAuth } from '../auth/SupabaseAuthProvider';
import { useMe } from '../app/MeContext';
import { coachInitial } from '../utils/display';
import styles from './AppHeader.module.css';

interface Breadcrumb {
  label: string;
  to?: string;
}

export function AppHeader({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  const { signOut } = useAuth();
  const { me } = useMe();
  const { confirmNavigation } = useUnsavedChanges();
  const navigate = useNavigate();
  const coachName = me?.displayName ?? null;

  function handleSignOut() {
    confirmNavigation(() => {
      void signOut().then(() => navigate('/login', { replace: true }));
    });
  }

  return (
    <header className={styles.header} data-print-hidden>
      <div className={styles.inner}>
        <GuardedLink className={styles.brand} to="/" aria-label="担当の子ども一覧へ">
          <span className={styles.mark} aria-hidden="true">育</span>
          <span>育ちマップ</span>
        </GuardedLink>
        <nav className={styles.breadcrumbs} aria-label="現在位置">
          <ol>
            {breadcrumbs.map((breadcrumb, index) => (
              <li key={`${breadcrumb.label}-${index}`}>
                {index > 0 ? <span className={styles.separator} aria-hidden="true">／</span> : null}
                {breadcrumb.to ? (
                  <GuardedLink to={breadcrumb.to}>{breadcrumb.label}</GuardedLink>
                ) : (
                  <span aria-current="page">{breadcrumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className={styles.account}>
          <GuardedLink className={styles.profileLink} to="/me" aria-label="表示名を変更">
            <span className={styles.avatar} aria-hidden="true">{coachInitial(coachName)}</span>
            {coachName ? <span className={styles.coachName}>{coachName}</span> : null}
          </GuardedLink>
          <button type="button" onClick={handleSignOut}>ログアウト</button>
        </div>
      </div>
    </header>
  );
}
