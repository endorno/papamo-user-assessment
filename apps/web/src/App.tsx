import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { MeResponse } from '@papamo/shared';

import { apiRequest } from './api/client';
import { SupabaseAuthProvider, useAuth } from './auth/SupabaseAuthProvider';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage').then((module) => ({ default: module.OnboardingPage })));
const NewChildPage = lazy(() => import('./pages/NewChildPage').then((module) => ({ default: module.NewChildPage })));
const ChildPage = lazy(() => import('./pages/ChildPage').then((module) => ({ default: module.ChildPage })));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage').then((module) => ({ default: module.AssessmentPage })));
const ReportPage = lazy(() => import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));

function LoadingPage() {
  return (
    <main
      style={{
        display: 'grid',
        minHeight: '100dvh',
        placeItems: 'center',
        background: 'var(--paper)',
        color: 'var(--ink2)',
      }}
    >
      画面を読み込んでいます…
    </main>
  );
}

function ProtectedRoute({ children, allowOnboarding = false }: { children: ReactNode; allowOnboarding?: boolean }) {
  const { loading, session } = useAuth();
  const [onboardingRequired, setOnboardingRequired] = useState<boolean | null>(allowOnboarding ? false : null);

  useEffect(() => {
    if (!session || allowOnboarding) return;
    let active = true;
    setOnboardingRequired(null);
    void apiRequest<MeResponse>('/me', session)
      .then((profile) => {
        if (active) setOnboardingRequired(!profile.displayName);
      })
      .catch(() => {
        // 各画面側で具体的な通信エラーを表示する。
        if (active) setOnboardingRequired(false);
      });
    return () => {
      active = false;
    };
  }, [allowOnboarding, session]);

  if (loading) {
    return <LoadingPage />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (onboardingRequired === null) return <LoadingPage />;
  if (onboardingRequired) return <Navigate to="/onboarding" replace />;
  return children;
}

export function App() {
  return (
    <SupabaseAuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute allowOnboarding>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <HomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/me"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/children/new"
              element={
                <ProtectedRoute>
                  <NewChildPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/children/:id"
              element={
                <ProtectedRoute>
                  <ChildPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assessments/:id"
              element={
                <ProtectedRoute>
                  <AssessmentPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reports/:id"
              element={
                <ProtectedRoute>
                  <ReportPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SupabaseAuthProvider>
  );
}
