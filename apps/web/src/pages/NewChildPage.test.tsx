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
      <Route path="/" element={<p>子ども一覧です</p>} />
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

  it('目標を求めず登録し、完了画面を挟まず子ども一覧へ戻る', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ child: created }, 201)));
    renderNewChildPage();

    fireEvent.change(screen.getByLabelText('お名前（下の名前）'), { target: { value: 'ゆい' } });
    fireEvent.change(screen.getByLabelText('現在の学年'), { target: { value: 'e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'この内容で登録する' }));

    expect(await screen.findByText('子ども一覧です')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('ゆいちゃんを登録しました');
    expect(screen.queryByText('共有コード')).not.toBeInTheDocument();
    await waitFor(() => {
      const createCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith('/api/children'));
      expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
        name: 'ゆい',
        honorific: 'chan',
        gradeCode: 'e1',
        joinedOn: expect.any(String),
      });
    });
  });

  it('敬称なしを選んで登録できる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ child: created }, 201)));
    renderNewChildPage();

    fireEvent.change(screen.getByLabelText('お名前（下の名前）'), { target: { value: 'ゆい' } });
    fireEvent.change(screen.getByLabelText('敬称'), { target: { value: 'none' } });
    fireEvent.change(screen.getByLabelText('現在の学年'), { target: { value: 'e1' } });
    fireEvent.click(screen.getByRole('button', { name: 'この内容で登録する' }));

    await screen.findByText('子ども一覧です');
    const createCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input).endsWith('/api/children'));
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ honorific: 'none' });
  });
});
