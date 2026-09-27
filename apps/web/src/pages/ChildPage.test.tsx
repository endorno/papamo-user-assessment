import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { ChildPage } from './ChildPage';
import { renderWithProviders } from '../test-utils';

const child = {
  id: 'child-1',
  name: 'ゆい',
  honorific: 'chan' as const,
  gender: 'girl' as const,
  gradeCode: 'e1' as const,
  gradeBaseYear: 2025,
  grade: { code: 'e2', name: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch' as const, graduated: false },
  joinedMonth: '2025-06',
  extUnlocked: false,
  archivedAt: null,
  shareCode: 'ABCD-EFGH',
  ownerShareCode: 'JKLM-NPQR',
  role: 'owner' as const,
  state: { key: 'first' as const, label: '初回アセスメント未実施', order: 1 as const },
  latestAssessment: null,
  createdAt: '2025-06-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  assessments: [],
  latestReport: null,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderChildPage() {
  return renderWithProviders(<ChildPage />, { route: '/children/child-1', path: '/children/:id' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('子どもページ', () => {
  it('現在表示中の学年を基準に登録情報を修正できる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child })));
    renderChildPage();

    const profile = await screen.findByRole('region', { name: '登録情報' });
    expect(profile).toHaveTextContent('2025年6月');
    fireEvent.click(within(profile).getByRole('button', { name: '編集' }));
    expect(within(profile).getByLabelText('現在の学年')).toHaveValue('e2');
    fireEvent.change(within(profile).getByLabelText('お名前（下の名前）'), { target: { value: 'ゆいな' } });
    expect(within(profile).getByLabelText('入会月')).toHaveValue('2025');
    fireEvent.change(within(profile).getByLabelText('入会月の月'), { target: { value: '04' } });
    fireEvent.click(within(profile).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ name: 'ゆいな', gradeCode: 'e2', joinedMonth: '2025-04' });
    });
  });

  it('下書きがある場合は新規作成ではなく入力再開へ案内する', async () => {
    const draftChild = {
      ...child,
      state: { key: 'draft' as const, label: 'アセスメント入力中（2/6）', filled: 2, total: 6, order: 0 as const },
      latestAssessment: { id: 'assessment-1', seqNo: 1, status: 'draft' as const, assessedOn: '2026-09-01', unlockExt: false, lv: { post: 3, eyeh: 4 } },
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'draft' as const, assessedOn: '2026-09-01', unlockExt: false, goals: [], updatedAt: '2026-09-01T00:00:00.000Z', completedAt: null, reportAvailable: false }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: draftChild })));
    renderChildPage();

    const resumeLinks = await screen.findAllByRole('link', { name: '入力を続ける' });
    expect(resumeLinks[0]).toHaveAttribute('href', '/assessments/assessment-1');
    expect(screen.queryByRole('button', { name: 'アセスメントを始める' })).not.toBeInTheDocument();
    const management = screen.getByRole('region', { name: '退会・担当解除などの管理' });
    expect(within(management).getByRole('button', { name: '登録を完全に削除' })).toBeInTheDocument();
  });

  it('2回目以降の開始では、前回の修正へ戻る道も示す', async () => {
    const completedChild = {
      ...child,
      state: { key: 'due' as const, label: '次回まであと3日', daysLeft: 3, order: 0.5 as const },
      latestAssessment: { id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, lv: { post: 3, eyeh: 4, hand: 5 } },
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, goals: [], updatedAt: '2026-06-01T00:00:00.000Z', completedAt: '2026-06-01T00:00:00.000Z', reportAvailable: true }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: completedChild })));
    renderChildPage();

    fireEvent.click(await screen.findByRole('button', { name: 'アセスメントを始める' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('前回：第1回');
    expect(within(dialog).getByRole('button', { name: '新しい回を始める' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '前回の入力を修正する' })).toBeInTheDocument();
  });

  it('入会から半年を過ぎて未開放なら、4・5種目目の目安を伝える', async () => {
    const longTermChild = {
      ...child,
      joinedMonth: '2025-01',
      state: { key: 'ok' as const, label: '次回 2026-12-01 予定', dueDate: '2026-12-01', order: 2 as const },
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, goals: [], updatedAt: '2026-06-01T00:00:00.000Z', completedAt: '2026-06-01T00:00:00.000Z', reportAvailable: true }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: longTermChild })));
    renderChildPage();

    const map = await screen.findByRole('region', { name: '育ちマップ' });
    expect(map).toHaveTextContent('4・5種目目を開放できる時期です');
    expect(screen.queryByRole('checkbox', { name: /4・5種目目を今回から開放/ })).not.toBeInTheDocument();
  });

  it('最初のレポート作成後は完全削除を表示しない', async () => {
    const completedChild = {
      ...child,
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, goals: [], updatedAt: '2026-06-01T00:00:00.000Z', completedAt: '2026-06-01T00:00:00.000Z', reportAvailable: true }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: completedChild })));
    renderChildPage();

    const management = await screen.findByRole('region', { name: '退会・担当解除などの管理' });
    expect(within(management).queryByRole('button', { name: '登録を完全に削除' })).not.toBeInTheDocument();
  });

  it('オーナーには担当を外れる手順を示す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child })));
    renderChildPage();

    const management = await screen.findByRole('region', { name: '退会・担当解除などの管理' });
    expect(management).toHaveTextContent('オーナーを移すコード');
    expect(within(management).queryByRole('button', { name: '自分の担当一覧から外す' })).not.toBeInTheDocument();
  });

  it('目標は子ども詳細から編集できず、最新の完了回を表示する', async () => {
    const completedChild = {
      ...child,
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, goals: ['転びにくくなってほしい'], updatedAt: '2026-06-01T00:00:00.000Z', completedAt: '2026-06-01T00:00:00.000Z', reportAvailable: true }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: completedChild })));
    renderChildPage();

    const goals = await screen.findByRole('region', { name: '今期の目標' });
    expect(goals).toHaveTextContent('転びにくくなってほしい');
    expect(within(goals).queryByRole('button', { name: '編集' })).not.toBeInTheDocument();
    expect(within(goals).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('共有先で削除済みの子どもを開いた場合は担当一覧へ戻す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      error: { code: 'not_found', message: 'お子さまが見つかりません。' },
    }, 404)));
    renderWithProviders(
      <Routes>
        <Route path="/children/:id" element={<ChildPage />} />
        <Route path="/" element={<p>担当一覧へ戻りました</p>} />
      </Routes>,
      { route: '/children/child-1' },
    );

    expect(await screen.findByText('担当一覧へ戻りました')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('削除されたため');
  });
});
