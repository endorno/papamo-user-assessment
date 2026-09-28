import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';


import { MASTER_VERSION, RuleBasedReportGenerator, type ReportContent } from '@papamo/shared';

const auth = vi.hoisted(() => ({
  session: { access_token: 'test-token' },
  loading: false,
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock('../auth/SupabaseAuthProvider', () => ({ useAuth: () => auth }));

import { ReportPage } from './ReportPage';
import { renderWithProviders } from '../test-utils';

let report: ReportContent;
let firstReport: ReportContent;

beforeAll(async () => {
  const generator = new RuleBasedReportGenerator();
  const child = { name: 'はると', honorific: 'kun' as const, grade: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch' as const, joinedMonth: '2026-03' };
  const previous = {
    seqNo: 1,
    assessedOn: '2026-06-01',
    unlockExt: false,
    data: {
      lv: { post: 5, eyeh: 5, hand: 5 },
      observations: { post: [], eyeh: [], hand: [] },
      observationNotes: {},
      engagement: { dur: 1, sup: 2 },
      envSupports: ['e-vis'],
      troubles: ['姿勢がすぐ崩れる／机に伏せる', '忘れ物・なくし物が多い'],
      wants: ['w18'],
      copm: [{ text: '授業中に座っていられるようになる', memo: '', performance: 3, satisfaction: 3, importance: 9 }],
      ppi: { time: 3, emo: 3, soc: 2, fut: 4, nav: 3 },
      ppiNote: '',
      memo: '',
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
        observations: { post: [], eyeh: [], hand: [] },
        observationNotes: {},
        engagement: { dur: 3, sup: 3 },
        envSupports: ['e-vis', 'e-cnt'],
        troubles: ['姿勢がすぐ崩れる／机に伏せる'],
        wants: ['w18'],
        copm: [{ text: '授業中に座っていられるようになる', memo: '', performance: 6, satisfaction: 5, importance: 9 }],
        ppi: { time: 2, emo: 2, soc: 1, fut: 3, nav: 2 },
        ppiNote: '宿題の声かけが負担になっている',
        memo: '',
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの現在地と強み');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toHaveTextContent('今のお困りごとと、その理由');
    expect(screen.queryByText(/3か月でできるようになったこと/)).not.toBeInTheDocument();
    // 総合点の分母は実施した種目（基本3種目 × 30）だけで数える。
    expect(screen.getByRole('region', { name: '育ちマップ' })).toHaveTextContent(/今の到達\s*15\s*\/90（実施した3種目の合計）/);
    // 線が1本だけの初回は凡例を出さず、軸には運動名ではなく力の名前を出す。
    expect(screen.queryByText('今回')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).toHaveTextContent('姿勢制御/動的バランス');
    // ルールが未確定の箇所には目印を出す。
    expect(screen.getAllByText(/アルゴリズム調整中/).length).toBeGreaterThan(0);
  });

  it('比較レポートを4枚構成と日本語ラベルで表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの3か月の変化');
    const troubleSheet = screen.getByRole('region', { name: 'レポート2ページ目' });
    expect(troubleSheet).toHaveTextContent('育ちのピラミッド');
    // ピラミッドは5段。上の段ほど狭くするための段クラスが付いている。
    const pyramidRows = troubleSheet.querySelectorAll('[class*="pyramidRow"]');
    expect(pyramidRows).toHaveLength(5);
    expect(pyramidRows[0]?.className).toMatch(/pyramidTier5/);
    expect(pyramidRows[4]?.className).toMatch(/pyramidTier1/);
    const roadmapSheet = screen.getByRole('region', { name: 'レポート3ページ目' });
    expect(roadmapSheet).toHaveTextContent('6か月成長ロードマップ');
    // 現在地 → 3か月後 → 6か月後 → 目指す未来 の4本立て。
    expect(within(roadmapSheet).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '現在地（今ここ）',
      '3か月後の目安（土台づくり）',
      '6か月後の目安（目標へつなげる）',
      '目指す未来（生活・学習の中で）',
    ]);
    expect(screen.getByRole('region', { name: 'レポート4ページ目' })).toHaveTextContent('時間の負担');
    expect(screen.getByRole('region', { name: 'レポート4ページ目' })).toHaveTextContent('4・5種目目を追加');
    expect(screen.getAllByText('半年目以降').length).toBeGreaterThan(0);
  });

  it('印刷ボタンからブラウザ印刷を呼び出す', async () => {
    const print = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    vi.stubGlobal('print', print);
    renderReportPage();
    fireEvent.click(await screen.findByRole('button', { name: '印刷 / PDF' }));
    expect(print).toHaveBeenCalledOnce();
  });
});

function renderReportPage() {
  return renderWithProviders(<ReportPage />, { route: '/reports/assessment-1', path: '/reports/:id' });
}
