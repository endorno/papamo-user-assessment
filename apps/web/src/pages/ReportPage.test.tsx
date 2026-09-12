import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';

import { MASTER_VERSION, RuleBasedReportGenerator, type ReportContent } from '@papamo/shared';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { ReportPage } from './ReportPage';

let report: ReportContent;
let firstReport: ReportContent;

beforeAll(async () => {
  const generator = new RuleBasedReportGenerator();
  const child = { name: 'はると', honorific: 'kun' as const, grade: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch' as const, joinedOn: '2026-03-01', goals: [] };
  const previous = {
    seqNo: 1,
    assessedOn: '2026-06-01',
    unlockExt: false,
    data: {
      lv: { post: 5, eyeh: 5, hand: 5 },
      errs: { post: [], eyeh: [], hand: [] },
      troubles: ['姿勢がすぐ崩れる／机に伏せる', '忘れ物・なくし物が多い'],
      ppi: { time: 3, emo: 3, soc: 2, fut: 4, nav: 3 },
      ppiNote: '',
      plan: 'base' as const,
      memo: '',
      goals: [],
    },
  };
  const common = {
    child,
    coach: { displayName: 'さとうコーチ' },
    master: { version: MASTER_VERSION },
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
  firstReport = await generator.generate({ ...common, assessment: previous });
  report = await generator.generate({
    ...common,
    assessment: {
      seqNo: 2,
      assessedOn: '2026-09-01',
      unlockExt: false,
      data: {
        lv: { post: 8, eyeh: 7, hand: 6 },
        errs: { post: [], eyeh: [], hand: [] },
        troubles: ['姿勢がすぐ崩れる／机に伏せる'],
        ppi: { time: 2, emo: 2, soc: 1, fut: 3, nav: 2 },
        ppiNote: '宿題の声かけが負担になっている',
        plan: 'base',
        memo: '',
        goals: [],
      },
    },
    previous,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('保護者向けレポート', () => {
  it('初回レポートの見出しと困りごとを初回向けに表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの現在地と強み');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toHaveTextContent('今のお困りごとと、その理由');
    expect(screen.queryByText('3か月でできるようになったこと')).not.toBeInTheDocument();
  });

  it('比較レポートを3枚構成と日本語ラベルで表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの3か月の変化');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toHaveTextContent('時間の負担');
    expect(screen.getByRole('region', { name: 'レポート3ページ目' })).toHaveTextContent('これからの3か月');
    expect(screen.getByRole('region', { name: 'レポート3ページ目' })).toHaveTextContent('4・5種目目を追加');
    expect(screen.getAllByText('半年目以降').length).toBeGreaterThan(0);
  });

  it('印刷ボタンからブラウザ印刷を呼び出す', async () => {
    const print = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('print', print);
    renderReportPage();
    fireEvent.click(await screen.findByRole('button', { name: '印刷 / PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });
});

function renderReportPage() {
  return render(
    <MemoryRouter initialEntries={['/reports/assessment-1']}>
      <Routes><Route path="/reports/:id" element={<ReportPage />} /></Routes>
    </MemoryRouter>,
  );
}
