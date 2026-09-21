import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { AssessmentPage } from './AssessmentPage';
import { renderWithProviders } from '../test-utils';
import { Route, Routes } from 'react-router';

const assessment = {
  id: 'assessment-1',
  childId: 'child-1',
  seqNo: 1,
  status: 'draft' as const,
  assessedOn: '2026-09-12',
  coachId: 'coach-1',
  unlockExt: false,
  prevAssessmentId: null,
  masterVersion: '2026-09.2',
  data: {
    lv: {},
    observations: {},
    observationNotes: {},
    engagement: {},
    envSupports: [],
    troubles: [],
    wants: [],
    copm: [],
    ppi: {},
    ppiNote: '',
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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
    expect(screen.getByRole('link', { name: 'ラインウォークのLv' })).toHaveAttribute('href', '#assessment-post');
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

  it('未保存のままヘッダーから移動しようとすると確認を出す', async () => {
    renderAssessmentPage();
    const exerciseSection = await screen.findByRole('region', { name: 'ラインウォーク' });
    fireEvent.click(within(exerciseSection).getByRole('button', { name: 'Lv3' }));

    fireEvent.click(screen.getByRole('link', { name: '担当の子ども' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('保存が終わっていません');
    expect(within(dialog).getByRole('button', { name: '保存して移動' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '保存せずに移動' })).toBeInTheDocument();
  });

  it('「保存せずに移動」を選んだら、離脱時にも保存を送らない', async () => {
    const { unmount } = renderAssessmentPage();
    const exerciseSection = await screen.findByRole('region', { name: 'ラインウォーク' });
    fireEvent.click(within(exerciseSection).getByRole('button', { name: 'Lv3' }));
    fireEvent.click(screen.getByRole('link', { name: '担当の子ども' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '保存せずに移動' }));
    unmount();

    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false);
    // 端末には残しておき、次に開いたときに復元を提案できるようにする。
    expect(window.localStorage.getItem('papamo:assessment:assessment-1')).not.toBeNull();
  });

  it('「いったん閉じる」は保存を終えてから子どもページへ移る', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/assessments/:id" element={<AssessmentPage />} />
        <Route path="/children/:id" element={<p>子どもページです</p>} />
      </Routes>,
      { route: '/assessments/assessment-1' },
    );
    const exerciseSection = await screen.findByRole('region', { name: 'ラインウォーク' });
    fireEvent.click(within(exerciseSection).getByRole('button', { name: 'Lv3' }));
    fireEvent.click(screen.getByRole('button', { name: 'いったん閉じる' }));

    expect(await screen.findByText('子どもページです')).toBeInTheDocument();
    const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patchCall?.[1]?.body)).data.lv.post).toBe(3);
  });

  it('完了前なら4・5種目目の開放を取り消し、入力済みのLvも消す', async () => {
    renderAssessmentPage();
    const unlock = await screen.findByRole('checkbox', { name: /この回から4・5種目目も記録する/ });
    fireEvent.click(unlock);

    const extSection = await screen.findByRole('region', { name: 'あしあとものまね' });
    fireEvent.click(within(extSection).getByRole('button', { name: 'Lv4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /この回から4・5種目目も記録する/ }));

    expect(screen.queryByRole('region', { name: 'あしあとものまね' })).not.toBeInTheDocument();
    await waitFor(() => {
      const patchCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH');
      const last = JSON.parse(String(patchCalls.at(-1)?.[1]?.body)) as { unlockExt: boolean; data: { lv: Record<string, number> } };
      expect(last.unlockExt).toBe(false);
      expect(last.data.lv.sacc).toBeUndefined();
    }, { timeout: 2000 });
  });

  it('目標セルだけを貼り付けた事前アンケートをCOPM表へ入れる', async () => {
    renderAssessmentPage();
    fireEvent.click(await screen.findByRole('button', { name: '事前アンケートから取り込む' }));

    const dialog = screen.getByRole('dialog', { name: '事前アンケートから取り込む' });
    fireEvent.change(within(dialog).getByLabelText('コピーした回答'), {
      target: { value: '姿勢を安定させたい\t着替えを自分でできるようになりたい' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '入力欄に取り込む' }));

    expect(screen.getByRole('textbox', { name: '目標 1' })).toHaveValue('姿勢を安定させたい');
    expect(screen.getByRole('textbox', { name: '目標 2' })).toHaveValue('着替えを自分でできるようになりたい');

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      const body = JSON.parse(String(patchCall?.[1]?.body)) as { data: { copm: { text: string }[] } };
      expect(body.data.copm.map(({ text }) => text)).toEqual([
        '姿勢を安定させたい',
        '着替えを自分でできるようになりたい',
      ]);
    }, { timeout: 2000 });
  });

  it('列名つきの事前アンケートからお困りごと・目標・お困り度をまとめて取り込む', async () => {
    renderAssessmentPage();
    fireEvent.click(await screen.findByRole('button', { name: '事前アンケートから取り込む' }));

    const dialog = screen.getByRole('dialog', { name: '事前アンケートから取り込む' });
    fireEvent.change(within(dialog).getByLabelText('コピーした回答'), {
      target: {
        value: [
          'trouble\twant\tgoal\tppi_time\tppi_note',
          '転びやすい・つまずきやすい｜じっと座っていられない\tw9\t転びにくくなる\t4\t朝の支度に時間がかかる',
        ].join('\n'),
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '入力欄に取り込む' }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      const body = JSON.parse(String(patchCall?.[1]?.body)) as {
        data: { troubles: string[]; wants: string[]; copm: { text: string }[]; ppi: Record<string, number>; ppiNote: string };
      };
      expect(body.data.troubles).toEqual(['転びやすい・つまずきやすい', 'じっと座っていられない']);
      expect(body.data.wants).toEqual(['w9']);
      expect(body.data.copm.map(({ text }) => text)).toEqual(['転びにくくなる']);
      expect(body.data.ppi.time).toBe(4);
      expect(body.data.ppiNote).toBe('朝の支度に時間がかかる');
    }, { timeout: 2000 });
  });

  it('できるようになりたいことを選ぶと、目標欄に仮の文言が入る', async () => {
    renderAssessmentPage();
    const goalsSection = await screen.findByRole('region', { name: 'ご家族・本人の目標' });
    fireEvent.click(within(goalsSection).getByRole('checkbox', { name: /縄跳びが跳べるようになりたい/ }));

    expect(within(goalsSection).getByRole('textbox', { name: '目標 1' })).toHaveValue('縄跳びが跳べるようになる');
  });

  it('取り組みの発達と環境調整を記録できる', async () => {
    renderAssessmentPage();
    const section = await screen.findByRole('region', { name: '取り組みの発達' });
    fireEvent.change(within(section).getByLabelText(/参加の持続/), { target: { value: '3' } });
    fireEvent.click(within(section).getByRole('checkbox', { name: /視覚（手本・図・写真を見せる）/ }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      const body = JSON.parse(String(patchCall?.[1]?.body)) as { data: { engagement: Record<string, number>; envSupports: string[] } };
      expect(body.data.engagement.dur).toBe(3);
      expect(body.data.envSupports).toEqual(['e-vis']);
    }, { timeout: 2000 });
  });

  it('未実施・実施不可も到達の選択肢として記録できる', async () => {
    renderAssessmentPage();
    const exerciseSection = await screen.findByRole('region', { name: 'ラインウォーク' });
    fireEvent.click(within(exerciseSection).getByRole('button', { name: /実施不可/ }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH');
      const body = JSON.parse(String(patchCall?.[1]?.body)) as { data: { lv: { post?: number } } };
      expect(body.data.lv.post).toBe(-1);
    }, { timeout: 2000 });
  });

  it('共有先で削除済みになったアセスメントは担当一覧へ戻す', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      error: { code: 'not_found', message: 'アセスメントが見つかりません。' },
    }, 404)));
    renderWithProviders(
      <Routes>
        <Route path="/assessments/:id" element={<AssessmentPage />} />
        <Route path="/" element={<p>担当一覧へ戻りました</p>} />
      </Routes>,
      { route: '/assessments/assessment-1' },
    );

    expect(await screen.findByText('担当一覧へ戻りました')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('削除されたため');
  });
});

function renderAssessmentPage() {
  return renderWithProviders(<AssessmentPage />, { route: '/assessments/assessment-1', path: '/assessments/:id' });
}
