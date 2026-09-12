import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';

import type { MeResponse } from '@papamo/shared';
import { MeProvider } from './app/MeContext';
import { UnsavedChangesProvider } from './app/UnsavedChangesContext';
import { ToastProvider } from './components/Toast';

export const testCoach: MeResponse = {
  id: 'coach-1',
  email: 'coach@example.com',
  displayName: 'さとうコーチ',
};

/**
 * 画面単体のテスト用。本番と同じ順でレイアウトのプロバイダを重ねる。
 * `path` を渡すとルートパラメータつきで描画する。
 */
export function renderWithProviders(
  ui: ReactNode,
  options: { route?: string; path?: string; me?: MeResponse } = {},
) {
  const { route = '/', path, me = testCoach } = options;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <MeProvider me={me} setMe={() => undefined}>
        <ToastProvider>
          <UnsavedChangesProvider>
            {path ? <Routes><Route path={path} element={ui} /></Routes> : ui}
          </UnsavedChangesProvider>
        </ToastProvider>
      </MeProvider>
    </MemoryRouter>,
  );
}
