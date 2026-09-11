import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { SupabaseAuthProvider, useAuth } from './auth/SupabaseAuthProvider';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { NewChildPage } from './pages/NewChildPage';
import { ChildPage } from './pages/ChildPage';
import { AssessmentPage } from './pages/AssessmentPage';
import { ReportPage } from './pages/ReportPage';

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
      認証状態を確認しています…
    </main>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  if (loading) {
    return <LoadingPage />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <SupabaseAuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
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
      </BrowserRouter>
    </SupabaseAuthProvider>
  );
}
