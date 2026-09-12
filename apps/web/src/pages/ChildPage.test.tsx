import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { ChildPage } from './ChildPage';

const child = {
  id: 'child-1',
  name: 'ゆい',
  honorific: 'chan' as const,
  gradeCode: 'e1' as const,
  gradeBaseYear: 2025,
  grade: { code: 'e2', name: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch' as const, graduated: false },
  joinedOn: '2025-06-01',
  extUnlocked: false,
  goals: ['転びにくくなってほしい'],
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

function response(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function renderChildPage() {
  return render(
    <MemoryRouter initialEntries={['/children/child-1']}>
      <Routes><Route path="/children/:id" element={<ChildPage />} /></Routes>
    </MemoryRouter>,
  );
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
    fireEvent.click(within(profile).getByRole('button', { name: '編集' }));
    expect(within(profile).getByLabelText('現在の学年')).toHaveValue('e2');
    fireEvent.change(within(profile).getByLabelText('お名前（下の名前）'), { target: { value: 'ゆいな' } });
    fireEvent.click(within(profile).getByRole('button', { name: '保存' }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ name: 'ゆいな', gradeCode: 'e2' });
    });
  });

  it('下書きがある場合は新規作成ではなく入力再開へ案内する', async () => {
    const draftChild = {
      ...child,
      state: { key: 'draft' as const, label: 'アセスメント入力中（2/6）', filled: 2, total: 6, order: 0 as const },
      latestAssessment: { seqNo: 1, status: 'draft' as const, assessedOn: '2026-09-01', unlockExt: false, lv: { post: 3, eyeh: 4 } },
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'draft' as const, assessedOn: '2026-09-01', unlockExt: false, updatedAt: '2026-09-01T00:00:00.000Z', completedAt: null, reportAvailable: false }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: draftChild })));
    renderChildPage();

    const resumeLinks = await screen.findAllByRole('link', { name: '入力を続ける' });
    expect(resumeLinks[0]).toHaveAttribute('href', '/assessments/assessment-1');
    expect(screen.queryByRole('button', { name: 'アセスメントを始める' })).not.toBeInTheDocument();
  });
});
