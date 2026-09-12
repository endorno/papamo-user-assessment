import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('./auth/SupabaseAuthProvider', () => ({
  useAuth: () => auth,
}));

import { HomePage } from './pages/HomePage';

const profile = { id: 'coach-1', email: 'coach@example.com', displayName: 'さとうコーチ' };
const baseChild = {
  id: 'child-1',
  name: 'そうた',
  honorific: 'kun' as const,
  gradeCode: 'e3' as const,
  gradeBaseYear: 2026,
  grade: { code: 'e3', name: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch' as const, graduated: false },
  joinedOn: '2026-06-01',
  extUnlocked: false,
  goals: [],
  archivedAt: null,
  shareCode: 'ABCD-EFGH',
  ownerShareCode: 'JKLM-NPQR',
  role: 'owner' as const,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const draftChild = {
  ...baseChild,
  state: { key: 'draft' as const, label: 'アセスメント入力中（2/6）', filled: 2, total: 6, order: 0 as const },
  latestAssessment: {
    id: 'assessment-1',
    seqNo: 1,
    status: 'draft' as const,
    assessedOn: '2026-09-03',
    unlockExt: false,
    lv: { post: 11, eyeh: 9 },
  },
};

const settledChild = {
  ...baseChild,
  id: 'child-2',
  name: 'あおい',
  honorific: 'chan' as const,
  state: { key: 'ok' as const, label: '次回 2026-12-01 予定', dueDate: '2026-12-01', order: 2 as const },
  latestAssessment: {
    id: 'assessment-2',
    seqNo: 2,
    status: 'done' as const,
    assessedOn: '2026-09-01',
    unlockExt: false,
    lv: { post: 8, eyeh: 7, hand: 6 },
  },
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderHomePage() {
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe('担当の子ども一覧', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me')) return response(profile);
      if (url.includes('/api/children')) return response({ children: [draftChild, settledChild] });
      return response({});
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('対応が必要な子どもと余裕がある子どもを分け、Lvを表示する', async () => {
    renderHomePage();

    const todo = await screen.findByRole('region', { name: 'まずやること' });
    const settled = screen.getByRole('region', { name: '次の予定まで余裕あり' });
    expect(within(todo).getByText('そうた')).toBeInTheDocument();
    expect(within(todo).getByText('Lv11')).toBeInTheDocument();
    expect(within(todo).getByText('未入力')).toBeInTheDocument();
    expect(within(settled).getByText('あおい')).toBeInTheDocument();
    expect(screen.queryByText('API 接続を確認')).not.toBeInTheDocument();
  });

  it('共有コードを入力しやすい形式に整えて取り込む', async () => {
    renderHomePage();
    await screen.findByText('そうた');
    fireEvent.click(screen.getByRole('button', { name: '共有コードで取り込む' }));
    const input = screen.getByLabelText('共有コード');
    fireEvent.change(input, { target: { value: 'abcd efgh' } });
    expect(input).toHaveValue('ABCD-EFGH');
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('担当一覧に追加しました'));
    expect(fetch).toHaveBeenCalledWith('/api/children/import', expect.objectContaining({ method: 'POST' }));
  });

  it('担当がいないときは登録への次の行動を1つ示す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.endsWith('/api/me') ? response(profile) : response({ children: [] });
    }));
    renderHomePage();
    expect(await screen.findByRole('heading', { name: '最初のお子さまを登録しましょう' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'お子さまを登録する' })).toHaveAttribute('href', '/children/new');
  });
});
