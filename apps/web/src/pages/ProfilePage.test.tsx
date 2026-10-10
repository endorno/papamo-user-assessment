import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { ProfilePage } from './ProfilePage';
import { renderWithProviders } from '../test-utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('表示名の変更', () => {
  it('名前の部分だけを入力させ、「コーチ」は欄の外とヘッダーで自動で付ける', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => new Response(
      JSON.stringify({ id: 'coach-1', email: 'coach@example.com', displayName: 'たなか', driveFolderUrl: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<ProfilePage />, { route: '/me' });

    expect(screen.getByRole('banner')).toHaveTextContent('さとうコーチ');
    const input = screen.getByLabelText('表示名');
    expect(input).toHaveValue('さとう');
    expect(input).toHaveAccessibleDescription('名前だけを入力してください。「コーチ」は自動でつきます。');

    fireEvent.change(input, { target: { value: 'たなか' } });
    fireEvent.click(screen.getByRole('button', { name: '表示名を保存' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('/api/me');
    expect(JSON.parse(String(init?.body))).toEqual({ displayName: 'たなか' });
  });
});
