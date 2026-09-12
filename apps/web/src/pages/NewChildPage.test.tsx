import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { NewChildPage } from './NewChildPage';
import { renderWithProviders } from '../test-utils';

const created = {
  id: 'child-1',
  name: 'ゆい',
  honorific: 'chan' as const,
  gradeCode: 'e1' as const,
  gradeBaseYear: 2026,
  grade: { code: 'e1', name: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch' as const, graduated: false },
  joinedOn: '2026-09-12',
  extUnlocked: false,
  goals: [],
  archivedAt: null,
  shareCode: 'ABCD-EFGH',
  ownerShareCode: 'JKLM-NPQR',
  role: 'owner' as const,
  state: { key: 'first' as const, label: '初回アセスメント未実施', order: 1 as const },
  latestAssessment: null,
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderNewChildPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/children/new" element={<NewChildPage />} />
      <Route path="/assessments/:id" element={<p>アセスメント画面です</p>} />
    </Routes>,
    { route: '/children/new' },
  );
}

describe('お子さま登録', () => {
  it('学年を選ぶまで登録できない', () => {
    vi.stubGlobal('fetch', vi.fn());
    renderNewChildPage();

    expect(screen.getByLabelText('現在の学年')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'この内容で登録する' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('現在の学年'), { target: { value: 'e1' } });
    expect(screen.getByRole('button', { name: 'この内容で登録する' })).toBeEnabled();
  });

  it('登録したらそのまま初回アセスメントに進める', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/children')) return response({ child: created }, 201);
      return response({ assessment: { id: 'assessment-1' } }, 201);
    }));
    renderNewChildPage();

    fireEvent.change(screen.getByLabelText('お名前（下の名前）'), { target: { value: 'ゆい' } });
    fireEvent.change(screen.getByLabelText('現在の学年'), { target: { value: 'e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'この内容で登録する' }));

    fireEvent.click(await screen.findByRole('button', { name: '初回アセスメントを始める' }));

    expect(await screen.findByText('アセスメント画面です')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/children/child-1/assessments', expect.objectContaining({ method: 'POST' }));
    });
  });

  it('続けて別のお子さまを登録するときはフォームを空に戻す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ child: created }, 201)));
    renderNewChildPage();

    fireEvent.change(screen.getByLabelText('お名前（下の名前）'), { target: { value: 'ゆい' } });
    fireEvent.change(screen.getByLabelText('現在の学年'), { target: { value: 'e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'この内容で登録する' }));

    fireEvent.click(await screen.findByRole('button', { name: '続けて別のお子さまを登録' }));

    expect(screen.getByLabelText('お名前（下の名前）')).toHaveValue('');
    expect(screen.getByLabelText('現在の学年')).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('ゆいちゃんを登録しました');
  });
});
