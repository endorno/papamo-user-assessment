import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { AssessmentPage } from './AssessmentPage';

const assessment = {
  id: 'assessment-1',
  childId: 'child-1',
  seqNo: 1,
  status: 'draft' as const,
  assessedOn: '2026-09-12',
  coachId: 'coach-1',
  unlockExt: false,
  prevAssessmentId: null,
  masterVersion: '2026-09',
  data: {
    lv: {},
    errs: {},
    troubles: [],
    ppi: {},
    ppiNote: '',
    plan: 'pre' as const,
    memo: '',
    goals: [],
  },
  createdAt: '2026-09-12T00:00:00.000Z',
  updatedAt: '2026-09-12T00:00:00.000Z',
  completedAt: null,
  readOnly: false,
  previous: null,
  child: {
    id: 'child-1',
    name: 'ゆい',
    honorific: 'chan' as const,
    archivedAt: null,
    ageGroup: 'pre' as const,
    extUnlocked: false,
    goals: ['転びにくくなってほしい'],
  },
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('アセスメント入力', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { assessedOn: string; unlockExt: boolean; data: typeof assessment.data };
        return jsonResponse({ assessment: { ...assessment, assessedOn: body.assessedOn, unlockExt: body.unlockExt, data: body.data, updatedAt: '2026-09-12T00:01:00.000Z' } });
      }
      return jsonResponse({ assessment });
    }));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('1画面内にジャンプナビ、全入力セクション、固定の不足案内を表示する', async () => {
    renderAssessmentPage();

    expect(await screen.findByRole('heading', { name: 'ゆいちゃんのアセスメント' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '入力項目' })).toHaveTextContent('ラインウォーク');
    expect(screen.getByRole('region', { name: 'ご家庭のお困り度' })).toHaveTextContent('5問すべて回答');
    expect(screen.getByText(/Lv未入力：ラインウォーク/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'レポートを作る' })).toBeDisabled();
  });

  it('Lvと0点の回答を選択し、800ms後に全体を自動保存する', async () => {
    renderAssessmentPage();
    const exerciseSection = await screen.findByRole('region', { name: 'ラインウォーク' });
    const levelButton = within(exerciseSection).getByRole('button', { name: 'Lv3' });
    fireEvent.click(levelButton);
    expect(levelButton).toHaveAttribute('aria-pressed', 'true');

    const ppiSection = screen.getByRole('region', { name: 'ご家庭のお困り度' });
    const firstQuestion = within(ppiSection).getAllByRole('group')[0]!;
    const zeroButton = within(firstQuestion).getByRole('button', { name: '0' });
    fireEvent.click(zeroButton);
    expect(zeroButton).toHaveAttribute('aria-pressed', 'true');

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String(patchCall?.[1]?.body)) as { data: { lv: { post?: number }; ppi: { time?: number }; goals?: unknown } };
      expect(body.data.lv.post).toBe(3);
      expect(body.data.ppi.time).toBe(0);
      expect(body.data.goals).toBeUndefined();
    }, { timeout: 2000 });
  });
});

function renderAssessmentPage() {
  return render(
    <MemoryRouter initialEntries={['/assessments/assessment-1']}>
      <Routes><Route path="/assessments/:id" element={<AssessmentPage />} /></Routes>
    </MemoryRouter>,
  );
}
