import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { SupabaseAuthProvider } from './auth/SupabaseAuthProvider';
import { HomePage } from './pages/HomePage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderHomePage() {
  return render(
    <SupabaseAuthProvider>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </SupabaseAuthProvider>,
  );
}

describe('アプリの足場', () => {
  it('サービス名と API 接続確認の導線を表示する', () => {
    renderHomePage();

    expect(screen.getByRole('heading', { name: /コーチの記録/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'API 接続を確認' }),
    ).toBeInTheDocument();
  });

  it('API 接続確認の結果を表示する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: 'ok', service: 'api' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    renderHomePage();
    fireEvent.click(screen.getByRole('button', { name: 'API 接続を確認' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('API に接続できました。');
    });
  });
});
