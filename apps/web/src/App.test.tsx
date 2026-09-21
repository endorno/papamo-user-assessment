import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { renderWithProviders } from './test-utils';

const profile = { id: 'coach-1', email: 'coach@example.com', displayName: 'さとうコーチ' };
const baseChild = {
  id: 'child-1',
  name: 'そうた',
  honorific: 'kun' as const,
  gender: 'boy' as const,
  gradeCode: 'e3' as const,
  gradeBaseYear: 2026,
  grade: { code: 'e3', name: '小学3年生', ageHint: '8〜9歳', ageGroup: 'sch' as const, graduated: false },
  joinedOn: '2026-06-01',
  extUnlocked: false,
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

const unassessedChild = {
  ...baseChild,
  id: 'child-new',
  name: 'みお',
  state: { key: 'first' as const, label: '初回アセスメント未実施', order: 1 as const },
  latestAssessment: null,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderHomePage() {
  return renderWithProviders(<HomePage />);
}

describe('担当の子ども一覧', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me')) return response(profile);
      if (url.endsWith('/api/children/import')) {
        return response({
          child: { ...settledChild, assessments: [], latestReport: null },
          ownershipTransferred: false,
        });
      }
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

  it('アセスメント未作成の子どもを独立した最上段にまとめる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ children: [draftChild, settledChild, unassessedChild] })));
    renderHomePage();

    const unassessed = await screen.findByRole('region', { name: '初回アセスメント未実施' });
    const todo = screen.getByRole('region', { name: 'まずやること' });
    expect(within(unassessed).getByRole('link', { name: /みお/ })).toHaveAttribute('href', '/children/child-new');
    expect(unassessed.compareDocumentPosition(todo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('共有コードを入力しやすい形式に整えて取り込む', async () => {
    renderHomePage();
    await screen.findByText('そうた');
    fireEvent.click(screen.getByRole('button', { name: '共有コードで取り込む' }));
    const input = screen.getByLabelText('共有コード');
    fireEvent.change(input, { target: { value: 'abcd efgh' } });
    expect(input).toHaveValue('ABCD-EFGH');
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('あおいちゃんを担当に追加しました'));
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

  it('オーナー移譲コードで取り込んだときは、オーナーになったことを伝える', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/children/import')) {
        return response({
          child: { ...settledChild, assessments: [], latestReport: null },
          ownershipTransferred: true,
        });
      }
      return response({ children: [draftChild, settledChild] });
    }));
    renderHomePage();
    await screen.findByText('そうた');
    fireEvent.click(screen.getByRole('button', { name: '共有コードで取り込む' }));
    fireEvent.change(screen.getByLabelText('共有コード'), { target: { value: 'ABCDEFGH' } });
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('あおいちゃんのオーナーになりました'));
    expect(screen.getByRole('button', { name: 'ページを開く' })).toBeInTheDocument();
  });

  it('担当が増えたらお名前でしぼり込める', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({
      ...settledChild,
      id: `child-${index}`,
      name: index === 0 ? 'そうた' : `こども${index}`,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => response({ children: many })));
    renderHomePage();

    const filter = await screen.findByLabelText('お名前でしぼり込む');
    fireEvent.change(filter, { target: { value: 'そう' } });

    const settled = screen.getByRole('region', { name: '次の予定まで余裕あり' });
    expect(within(settled).getByText('そうた')).toBeInTheDocument();
    expect(within(settled).queryByText('こども1')).not.toBeInTheDocument();
  });

  it('カードは常に子どもページへ行き、入力中のときだけその回へのボタンを添える', async () => {
    renderHomePage();
    const todo = await screen.findByRole('region', { name: 'まずやること' });
    const settled = screen.getByRole('region', { name: '次の予定まで余裕あり' });
    expect(within(todo).getByRole('link', { name: /そうた/ })).toHaveAttribute('href', '/children/child-1');
    expect(within(todo).getByRole('link', { name: '入力を続ける' })).toHaveAttribute('href', '/assessments/assessment-1');
    expect(within(settled).getByRole('link', { name: /あおい/ })).toHaveAttribute('href', '/children/child-2');
    expect(within(settled).queryByRole('link', { name: '入力を続ける' })).not.toBeInTheDocument();
  });

  it('本番相当で開発用APIが使えないときはサンプル操作を表示しない', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/dev-tools/sample-data')) {
        return response({ error: { code: 'not_found', message: '指定された API は見つかりません。' } }, 404);
      }
      return response({ children: [draftChild, settledChild] });
    }));

    renderHomePage();
    await screen.findByText('そうた');
    expect(screen.queryByText('開発用：サンプルデータ')).not.toBeInTheDocument();
  });

  it('開発環境では10名を7・2・1の履歴構成で最大3件ずつ生成する', async () => {
    const profiles: string[] = [];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/dev-tools/sample-data')) {
        return response({
          enabled: true,
          environment: 'local',
          ready: true,
          backgroundCoachCount: 15,
          presets: [1, 10, 30],
        });
      }
      if (url.endsWith('/api/dev-tools/sample-child')) {
        const profile = JSON.parse(String(init?.body)).profile as string;
        profiles.push(profile);
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await Promise.resolve();
        activeRequests -= 1;
        return response({ childId: `sample-${profiles.length}`, profile }, 201);
      }
      return response({ children: [draftChild, settledChild] });
    }));

    renderHomePage();
    fireEvent.click(await screen.findByText('開発用：サンプルデータ'));
    fireEvent.click(screen.getByRole('button', { name: '10名追加' }));
    fireEvent.click(screen.getByRole('button', { name: '追加する' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('10名のサンプルを追加しました'));
    expect(profiles.filter((profile) => profile === 'long')).toHaveLength(6);
    expect(profiles.filter((profile) => profile === 'short')).toHaveLength(2);
    expect(profiles.filter((profile) => profile === 'new')).toHaveLength(2);
    expect(maxActiveRequests).toBeLessThanOrEqual(3);
  });

  it('開発環境では確認のうえ、オーナーの子どもだけ記録ごと削除する', async () => {
    let cleared = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/dev-tools/sample-data')) {
        return response({
          enabled: true,
          environment: 'staging',
          ready: true,
          backgroundCoachCount: 15,
          presets: [1, 10, 30],
        });
      }
      if (url.endsWith('/api/dev-tools/children') && init?.method === 'DELETE') {
        cleared = true;
        return response({ deleted: 1, unlinked: 1 });
      }
      return response({ children: cleared ? [] : [draftChild, { ...settledChild, role: 'member' as const }] });
    }));

    renderHomePage();
    fireEvent.click(await screen.findByText('開発用：サンプルデータ'));
    fireEvent.click(screen.getByRole('button', { name: '担当の子どもをすべて削除' }));

    // 取り消せない操作なので、確認なしでは消さない。
    expect(cleared).toBe(false);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('削除（オーナー）：一覧の1名');
    expect(dialog).toHaveTextContent('担当から外すだけ：一覧の1名');
    expect(dialog).toHaveTextContent('ステージング');

    fireEvent.click(screen.getByRole('button', { name: 'すべて削除する' }));
    await waitFor(() => expect(screen.getByRole('status'))
      .toHaveTextContent('オーナーの1名を記録ごと削除し、1名を担当から外しました'));
    expect(screen.queryByText('そうた')).not.toBeInTheDocument();
  });
});
