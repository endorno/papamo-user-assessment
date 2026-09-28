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

import { MASTER_VERSION, RuleBasedReportGenerator } from '@papamo/shared';

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

function renderChildPage(tab?: string) {
  return renderWithProviders(<ChildPage />, { route: `/children/child-1${tab ? `?tab=${tab}` : ''}`, path: '/children/:id' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('子どもページ', () => {
  it('現在表示中の学年を基準に登録情報を修正できる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child })));
    renderChildPage('settings');

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
    fireEvent.click(screen.getByRole('tab', { name: '登録・共有' }));
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
    renderChildPage('settings');

    const management = await screen.findByRole('region', { name: '退会・担当解除などの管理' });
    expect(within(management).queryByRole('button', { name: '登録を完全に削除' })).not.toBeInTheDocument();
  });

  it('オーナーには担当を外れる手順を示す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child })));
    renderChildPage('settings');

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

  it('前回の取り組みの様子・効いた条件など、コーチ向けの見立てを表示する', async () => {
    const latestReport = await new RuleBasedReportGenerator().generate({
      child: { name: 'ゆい', honorific: 'chan', grade: '小学2年生', ageHint: '7〜8歳', ageGroup: 'sch', joinedMonth: '2025-06' },
      coach: { displayName: 'さとうコーチ' },
      assessment: {
        seqNo: 1,
        assessedOn: '2026-06-01',
        unlockExt: false,
        data: {
          lv: { post: 8, eyeh: -1, hand: 4 },
          observations: { post: [], eyeh: ['指示理解の難しさ'], hand: [] },
          observationNotes: { hand: '左右の切り替えで止まる。' },
          engagement: { dur: 2, sup: 1 },
          envSupports: ['e-vis', 'e-tim'],
          troubles: ['姿勢がすぐ崩れる／机に伏せる'],
          wants: ['w12'],
          copm: [],
          ppi: { time: 2, emo: 2, soc: 1, fut: 3, nav: 2 },
          ppiNote: '',
          memo: '',
        },
      },
      master: { version: MASTER_VERSION },
      generatedAt: '2026-06-01T00:00:00.000Z',
    });
    const completedChild = {
      ...child,
      assessments: [{ id: 'assessment-1', seqNo: 1, status: 'done' as const, assessedOn: '2026-06-01', unlockExt: false, goals: [], updatedAt: '2026-06-01T00:00:00.000Z', completedAt: '2026-06-01T00:00:00.000Z', reportAvailable: true }],
      latestReport,
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ child: completedChild })));
    renderChildPage();

    // 概要タブには要点だけを出し、計画の詳細はタブの先に置く。
    const nextLesson = await screen.findByRole('region', { name: '次のレッスンに向けて' });
    expect(nextLesson).toHaveTextContent('注意点');
    expect(screen.queryByRole('region', { name: '取り組みの様子と効いた条件' })).not.toBeInTheDocument();
    fireEvent.click(within(nextLesson).getByRole('button', { name: '振り返りと計画を見る' }));
    expect(screen.getByRole('tab', { name: '振り返りと計画' })).toHaveAttribute('aria-selected', 'true');

    const engagement = screen.getByRole('region', { name: '取り組みの様子と効いた条件' });
    expect(engagement).toHaveTextContent('参加の持続');
    expect(engagement).toHaveTextContent('情報の入り方');
    expect(engagement).toHaveTextContent('視覚');
    expect(engagement).toHaveTextContent('タイマー');
    expect(screen.getByRole('region', { name: 'レッスン前の注意点' })).toHaveTextContent('実施不可：お手玉キャッチ');
    expect(screen.getByRole('region', { name: '3か月・6か月に当てるメニュー' })).toHaveTextContent('主軸');
    expect(screen.getByRole('region', { name: '目標への当て方' })).toHaveTextContent('先に土台');
    expect(screen.getByRole('region', { name: '見えた動作・つまずき方' })).toHaveTextContent('左右の切り替えで止まる。');
    expect(screen.getByRole('region', { name: 'お困りごと × アセスメント照合' })).toHaveTextContent('身体図式');
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
