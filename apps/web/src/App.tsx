import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import type { MeResponse } from '@papamo/shared';

import { apiRequest, ApiClientError, setUnauthorizedHandler } from './api/client';
import { MeProvider, useMe } from './app/MeContext';
import { UnsavedChangesProvider } from './app/UnsavedChangesContext';
import { SupabaseAuthProvider, useAuth } from './auth/SupabaseAuthProvider';
import { AuthErrorNotice } from './components/AuthErrorNotice';
import { PageSkeleton } from './components/PageSkeleton';
import { ToastProvider } from './components/Toast';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));
const NewChildPage = lazy(() => import('./pages/NewChildPage').then((module) => ({ default: module.NewChildPage })));
const ChildPage = lazy(() => import('./pages/ChildPage').then((module) => ({ default: module.ChildPage })));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage').then((module) => ({ default: module.AssessmentPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));

/** セッション切れで中断した画面。再ログイン後にここへ戻す。 */
const RETURN_TO_KEY = 'papamo:returnTo';

function readReturnTo(): string | null {
  try {
    const path = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
    return path && path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

function rememberReturnTo(path: string) {
  try {
    window.sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // プライベートブラウズなどで保存できない場合は復帰をあきらめる。
  }
}

/**
 * 画面を切り替えたら先頭から読み始められるようにする。
 * ページ内ジャンプ（#付き）は対象外なので、pathname の変化だけを見る。
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function AuthenticatedLayout() {
  const { loading, session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<ApiClientError | null>(null);
  const [meRetryKey, setMeRetryKey] = useState(0);
  const returnToChecked = useRef(false);

  const loginAgain = useCallback(() => {
    rememberReturnTo(`${window.location.pathname}${window.location.search}`);
    void signOut().then(() => navigate('/login', { replace: true }));
  }, [navigate, signOut]);

  useEffect(() => {
    setUnauthorizedHandler(setAuthError);
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoadError(null);
    setAuthError(null);
    void apiRequest<MeResponse>('/me', session)
      .then((profile) => {
        if (active) {
          setMe(profile);
          setAuthError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!active || (caught instanceof ApiClientError && caught.status === 401)) return;
        setLoadError(caught instanceof Error ? caught.message : 'コーチ情報を取得できませんでした。');
      });
    return () => {
      active = false;
    };
  }, [meRetryKey, session]);

  // 再ログイン直後だけ、中断した画面へ戻す。
  useEffect(() => {
    if (!me || returnToChecked.current) return;
    returnToChecked.current = true;
    const returnTo = readReturnTo();
    if (returnTo && returnTo !== location.pathname) navigate(returnTo, { replace: true });
  }, [location.pathname, me, navigate]);

  if (loading) return <PageSkeleton label="ログイン状態を確認しています" />;
  if (!session) return <Navigate to="/login" replace />;
  if (authError && !me) {
    return (
      <AuthErrorNotice
        error={authError}
        fullPage
        onRetry={() => {
          setAuthError(null);
          setMeRetryKey((current) => current + 1);
        }}
        onLoginAgain={loginAgain}
      />
    );
  }
  if (loadError) {
    return (
      <main className="bootError" role="alert">
        <p>{loadError}</p>
        <button type="button" onClick={() => window.location.reload()}>もう一度読み込む</button>
      </main>
    );
  }
  if (!me) return <PageSkeleton label="コーチ情報を読み込んでいます" />;

  return (
    <MeProvider me={me} setMe={setMe}>
      <ToastProvider>
        <UnsavedChangesProvider>
          <ScrollToTop />
          {authError ? (
            <AuthErrorNotice
              error={authError}
              onRetry={() => {
                setAuthError(null);
                setMeRetryKey((current) => current + 1);
              }}
              onLoginAgain={loginAgain}
            />
          ) : null}
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </UnsavedChangesProvider>
      </ToastProvider>
    </MeProvider>
  );
}

function OnboardedOnly() {
  const { me } = useMe();
  if (!me?.displayName) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <SupabaseAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <Suspense fallback={<PageSkeleton label="ログイン画面を読み込んでいます" />}>
                <LoginPage />
              </Suspense>
            }
          />
          <Route element={<AuthenticatedLayout />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route element={<OnboardedOnly />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/me" element={<ProfilePage />} />
              <Route path="/children/new" element={<NewChildPage />} />
              <Route path="/children/:id" element={<ChildPage />} />
              <Route path="/assessments/:id" element={<AssessmentPage />} />
              <Route path="/reports/:id" element={<ReportPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SupabaseAuthProvider>
  );
}
