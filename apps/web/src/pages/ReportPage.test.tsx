import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Link, Route, Routes } from 'react-router';
import { afterEach, beforeAll, describe, expect, it, onTestFinished, vi } from 'vitest';


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
      troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる', '忘れ物・なくし物が多い'],
      wants: ['w18'],
      copm: [{ text: '姿勢よく座れるようになる', memo: '', performance: 3, satisfaction: 3, importance: 9 }],
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
        troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる'],
        wants: ['w18'],
        copm: [{ text: '姿勢よく座れるようになる', memo: '', performance: 6, satisfaction: 5, importance: 9 }],
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
  vi.restoreAllMocks();
});

describe('レポート', () => {
  it('初回レポートの見出しと困りごとを初回向けに表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの現在地と強み');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toHaveTextContent('今のお困りごとと、その理由');
    expect(screen.queryByText(/3か月でできるようになったこと/)).not.toBeInTheDocument();
    // 総合点の分母は実施した種目（基本3種目 × 30）だけで数える。
    expect(screen.getByRole('region', { name: '育ちマップ' })).toHaveTextContent(/今の到達\s*15\s*\/90（実施した3種目の合計）/);
    // 線が1本だけの初回は凡例を出さず、軸には運動名ではなく力の名前を出す。
    expect(screen.queryByText('今回')).not.toBeInTheDocument();
    // 1枚目の見出しが1つだけなら番号を振らない。未開放種目の案内は注記とレーダーだけで伝える。
    const firstSheet = screen.getByRole('region', { name: 'レポート1ページ目' });
    expect(within(firstSheet).getByRole('heading', { level: 2 }).textContent).toMatch(/^取り組みの様子/);
    expect(firstSheet).not.toHaveTextContent('これから加わる種目');
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).toHaveTextContent('姿勢制御/動的バランス');
    // ルールが未確定の箇所には目印を出す。
    expect(screen.getAllByText(/アルゴリズム調整中/).length).toBeGreaterThan(0);
  });

  it('比較レポートを4枚構成と日本語ラベルで表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toHaveTextContent('はるとくんの3か月の変化');
    // 比較では見出しが2つあるので連番を振る。
    expect(within(screen.getByRole('region', { name: 'レポート1ページ目' })).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.slice(0, 2))).toEqual(['13', '2取']);
    const troubleSheet = screen.getByRole('region', { name: 'レポート2ページ目' });
    expect(troubleSheet).toHaveTextContent('育ちのピラミッド');
    // ピラミッドは5段。上の段ほど狭くするための段クラスが付いている。
    const pyramidRows = troubleSheet.querySelectorAll('[class*="pyramidRow"]');
    expect(pyramidRows).toHaveLength(5);
    expect(pyramidRows[0]?.className).toMatch(/pyramidTier5/);
    expect(pyramidRows[4]?.className).toMatch(/pyramidTier1/);
    expect(screen.getByRole('region', { name: 'レポート3ページ目' })).toHaveTextContent('時間の負担');
    // ロードマップは次回レビューのタイムラインと並べるため、最後の4枚目に置く。
    const roadmapSheet = screen.getByRole('region', { name: 'レポート4ページ目' });
    expect(roadmapSheet).toHaveTextContent('6か月成長ロードマップ');
    // 現在地 → 3か月後 → 6か月後 → 目指す未来 の4本立て。
    expect(within(roadmapSheet).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      '現在地（今ここ）',
      '3か月後の目安（土台づくり）',
      '6か月後の目安（目標へつなげる）',
      '目指す未来（生活・学習の中で）',
    ]);
    expect(roadmapSheet).toHaveTextContent('4・5種目目を追加');
    expect(screen.getAllByText('半年目以降').length).toBeGreaterThan(0);
  });

  it('保護者向けの4枚のあとに、コーチ向けの切れ目とメニュー提案を置く', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const coachSheet = await screen.findByRole('region', { name: 'コーチ向け メニュー提案' });
    const lastParentSheet = screen.getByRole('region', { name: 'レポート4ページ目' });
    expect(lastParentSheet.compareDocumentPosition(coachSheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 切れ目は画面だけに出し、紙面は保護者向けPDFから外す目印を付ける。
    expect(screen.getByText('ここからはコーチ向け').closest('[data-print-hidden]')).not.toBeNull();
    expect(coachSheet).toHaveAttribute('data-coach-only');
    expect(coachSheet).toHaveTextContent('コーチ用・保護者には渡さない');
    expect(within(coachSheet).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '13か月・6か月に当てるメニュー',
      '2目標への当て方',
    ]);
    expect(coachSheet).toHaveTextContent('主軸');
    expect(coachSheet).toHaveTextContent('対応するメニューパッケージ');
    // 保護者向けの4枚にはメニュー提案を出さない。
    expect(lastParentSheet).not.toHaveTextContent('当てるメニュー');
  });

  it('子どもページからメニュー提案へ来たときは、読み込み後に末尾の紙面まで送る', async () => {
    const scrollIntoView = vi.fn();
    // jsdom には要素のスクロールがないため、差し替えて呼ばれたかだけを見る。
    Element.prototype.scrollIntoView = scrollIntoView;
    onTestFinished(() => {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderWithProviders(<ReportPage />, { route: '/reports/assessment-1#coach-menu', path: '/reports/:id' });

    const coachSheet = await screen.findByRole('region', { name: 'コーチ向け メニュー提案' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledOnce());
    expect(scrollIntoView.mock.contexts[0]).toBe(coachSheet);
  });

  it('レポート作成後に入力が変更されていれば、印刷しない案内で知らせる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: true, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const notice = await screen.findByText('このレポートを作ったあとに、入力が変更されています');
    const container = notice.closest('[role="status"]');
    expect(container).toHaveAttribute('data-print-hidden');
    expect(within(container as HTMLElement).getByRole('link', { name: '入力画面を開く' })).toHaveAttribute('href', '/assessments/assessment-1');
  });

  it('出力後に間違いに気づいても、レポート画面から入力画面へ戻れる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const editLink = await screen.findByRole('link', { name: '入力を修正する' });
    expect(editLink).toHaveAttribute('href', '/assessments/assessment-1');
    // 印刷・PDFには出さない操作バーに置く。
    expect(editLink.closest('[data-print-hidden]')).not.toBeNull();
  });

  it('次の回があって直せない回では、入力画面へのボタンを出さない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: true, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('region', { name: 'レポート1ページ目' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '入力を修正する' })).not.toBeInTheDocument();
  });

  it('操作バーには子どもページへの導線だけを置き、一覧へはヘッダーから戻る', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    expect(await screen.findByRole('link', { name: 'はるとくんのページへ' })).toHaveAttribute('href', '/children/child-1');
    expect(screen.queryByRole('link', { name: '一覧に戻る' })).not.toBeInTheDocument();
  });

  it('保護者向けPDFは4枚だけをサーバーへ送り、ファイルとして保存する', async () => {
    const { fetchMock, click, createObjectURL, savedFileNames } = stubPdfDownload();
    renderReportPage();

    fireEvent.click(await screen.findByRole('button', { name: '保護者向けPDF' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/report/pdf'))!;
    expect(url).toBe('/api/assessments/assessment-1/report/pdf');
    expect(init?.method).toBe('POST');
    const { html } = JSON.parse(String(init?.body)) as { html: string };
    // 画面の4枚をそのまま送り、操作ボタンやコーチ向けの紙面など保護者に渡さないものは含めない。
    expect(html).toContain('はるとくんの3か月の変化');
    expect(html).not.toContain('はるとくんのメニュー提案');
    expect(html).not.toContain('ここからはコーチ向け');
    // 同じお名前のお子さまと同じフォルダに保存しても上書きしないよう、IDの末尾4文字を入れる。
    expect(html).toContain('<title>育ちマップ_はるとくん_7K3Q_第2回</title>');
    expect(html).not.toContain('保護者向けPDF');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(savedFileNames).toEqual(['育ちマップ_はるとくん_7K3Q_第2回.pdf']);
    expect(screen.getByRole('button', { name: '保護者向けPDF' })).toBeEnabled();
    // 画面ではコーチ向けの紙面を出したままにする。
    expect(screen.getByRole('region', { name: 'コーチ向け メニュー提案' })).toBeInTheDocument();
  });

  it('Googleドライブの版が古ければ、開いたときに保護者向けとコーチ向けを1回だけ保存する', async () => {
    const { fetchMock, driveRequests } = stubDrive({ upToDate: false });
    renderReportPage();

    expect(await screen.findByText(/Googleドライブに保存しています/)).toBeInTheDocument();
    expect(await screen.findByText(/Googleドライブに保存しました/)).toHaveTextContent('（10月11日 14:32）');
    expect(driveRequests).toHaveLength(1);
    const body = driveRequests[0]!;
    expect(body.generatedAt).toBe(report.generatedAt);
    // 保護者向けにはコーチ向けの紙面を入れず、コーチ向けには末尾のメニュー提案まで入れる。
    expect(body.parentHtml).toContain('<title>育ちマップ_はるとくん_7K3Q_第2回</title>');
    expect(body.parentHtml).not.toContain('はるとくんのメニュー提案');
    expect(body.coachHtml).toContain('<title>育ちマップ_はるとくん_7K3Q_第2回_コーチ用</title>');
    expect(body.coachHtml).toContain('はるとくんのメニュー提案');
    // 保存状態の案内は紙面に入れない。
    expect(body.parentHtml).not.toContain('Googleドライブに保存');
    expect(screen.getByRole('link', { name: 'フォルダを開く' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/child-folder');
    // コーチ向けはダウンロードではなく、Googleドライブのファイルで開く。
    expect(screen.queryByRole('button', { name: 'コーチ向けPDF' })).not.toBeInTheDocument();
    const coachLink = screen.getByRole('link', { name: 'コーチ向けPDF（Googleドライブ）' });
    expect(coachLink).toHaveAttribute('href', 'https://drive.google.com/file/d/coach-file/view');
    expect(coachLink).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: '保護者向けPDF' })).toBeEnabled();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/report/drive'))).toHaveLength(1);
  });

  it('保存の途中経過を、段階の文字と進み具合のバーで示す', async () => {
    const stream = controlledDriveStream();
    stubDrive({ upToDate: false, replies: [stream.reply] });
    renderReportPage();

    const progress = await screen.findByRole('progressbar', { name: 'Googleドライブへの保存' });
    expect(progress).toHaveAttribute('aria-valuetext', '保護者向けのPDFを作っています（1/3）');
    expect(screen.getByText('ほかの画面に移っても保存は続きます。')).toBeInTheDocument();

    await act(async () => stream.send({ type: 'step', step: 'renderParent' }));
    await act(async () => stream.send({ type: 'step', step: 'renderCoach' }));
    expect(screen.getByText('コーチ向けのPDFを作っています（2/3）')).toBeInTheDocument();
    await act(async () => stream.send({ type: 'step', step: 'upload' }));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText('Googleドライブに保存しています（3/3）')).toBeInTheDocument();

    await act(async () => {
      stream.send({ type: 'done', drive: SAVED_DRIVE });
      stream.close();
    });
    expect(await screen.findByText(/Googleドライブに保存しました/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('保存中にほかの画面へ移っても保存は続き、右上のパネルで進み具合と結果を示す', async () => {
    const stream = controlledDriveStream();
    const { driveRequests } = stubDrive({ upToDate: false, replies: [stream.reply] });
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/children/:id" element={<Link to="/reports/assessment-1">レポートに戻る</Link>} />
      </Routes>,
      { route: '/reports/assessment-1' },
    );
    await screen.findByRole('progressbar');
    // そのレポートの画面では帯で示すので、パネルには出さない。
    expect(screen.queryByRole('region', { name: 'はるとくん 第2回のレポートの保存' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'はるとくんのページへ' }));
    const panel = await screen.findByRole('region', { name: 'はるとくん 第2回のレポートの保存' });
    expect(panel).toHaveTextContent('Googleドライブに保存中');
    await act(async () => stream.send({ type: 'step', step: 'upload' }));
    expect(within(panel).getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Googleドライブに保存しています（3/3）');
    // 保存中は画面を閉じる前に確かめる（結果を見届けられないため）。
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);

    await act(async () => {
      stream.send({ type: 'done', drive: SAVED_DRIVE });
      stream.close();
    });
    expect(await within(panel).findByText('Googleドライブに保存しました')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'フォルダを開く' })).toHaveAttribute('href', 'https://drive.google.com/drive/folders/child-folder');
    const afterSaved = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterSaved);
    expect(afterSaved.defaultPrevented).toBe(false);

    // 戻ってきても送り直さない。
    fireEvent.click(screen.getByRole('link', { name: 'レポートに戻る' }));
    expect(await screen.findByText(/Googleドライブに保存しました/)).toBeInTheDocument();
    expect(driveRequests).toHaveLength(1);
  });

  it('保存中にパネルを閉じても保存は続き、失敗したらパネルで知らせ直す', async () => {
    const stream = controlledDriveStream();
    stubDrive({ upToDate: false, replies: [stream.reply] });
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/children/:id" element={<p>子どもページ</p>} />
      </Routes>,
      { route: '/reports/assessment-1' },
    );
    await screen.findByRole('progressbar');
    fireEvent.click(screen.getByRole('link', { name: 'はるとくんのページへ' }));
    const panel = await screen.findByRole('region', { name: 'はるとくん 第2回のレポートの保存' });
    fireEvent.click(within(panel).getByRole('button', { name: '閉じる（保存は続きます）' }));
    expect(screen.queryByRole('region', { name: 'はるとくん 第2回のレポートの保存' })).not.toBeInTheDocument();

    await act(async () => {
      stream.send({ type: 'error', error: { code: 'internal', message: 'PDFを作成できませんでした。少し待ってからもう一度お試しください。' } });
      stream.close();
    });
    const failed = await screen.findByRole('region', { name: 'はるとくん 第2回のレポートの保存' });
    expect(failed).toHaveTextContent('Googleドライブに保存できませんでした');
    expect(within(failed).getByRole('link', { name: 'レポートを開いて保存し直す' })).toHaveAttribute('href', '/reports/assessment-1');
  });

  it('保存中にレポートを開き直しても、保存をもう1本始めない', async () => {
    const stream = controlledDriveStream();
    const { driveRequests } = stubDrive({ upToDate: false, replies: [stream.reply] });
    renderWithProviders(
      <Routes>
        <Route path="/reports/:id" element={<ReportPage />} />
        <Route path="/children/:id" element={<Link to="/reports/assessment-1">レポートに戻る</Link>} />
      </Routes>,
      { route: '/reports/assessment-1' },
    );
    await screen.findByRole('progressbar');
    await act(async () => stream.send({ type: 'step', step: 'renderCoach' }));
    fireEvent.click(screen.getByRole('link', { name: 'はるとくんのページへ' }));
    fireEvent.click(await screen.findByRole('link', { name: 'レポートに戻る' }));

    const progress = await screen.findByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuetext', 'コーチ向けのPDFを作っています（2/3）');
    expect(driveRequests).toHaveLength(1);
    await act(async () => {
      stream.send({ type: 'done', drive: SAVED_DRIVE });
      stream.close();
    });
    expect(await screen.findByText(/Googleドライブに保存しました/)).toBeInTheDocument();
  });

  it('Googleドライブに保存できなかったときは理由を示し、もう一度保存できる', async () => {
    const { driveRequests } = stubDrive({
      upToDate: false,
      replies: [{ lines: [
        { type: 'step', step: 'renderParent' },
        { type: 'step', step: 'renderCoach' },
        { type: 'step', step: 'upload' },
        { type: 'error', error: { code: 'internal', message: 'Googleドライブに保存できませんでした。少し待ってからもう一度お試しください。' } },
      ] }],
    });
    renderReportPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('少し待ってからもう一度お試しください。');
    fireEvent.click(within(alert).getByRole('button', { name: 'もう一度保存する' }));

    expect(await screen.findByText(/Googleドライブに保存しました/)).toBeInTheDocument();
    expect(driveRequests).toHaveLength(2);
  });

  it('最後の行が届かずに通信が切れたら、保存できなかったことを示す', async () => {
    stubDrive({ upToDate: false, replies: [{ lines: [{ type: 'step', step: 'renderParent' }] }] });
    renderReportPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('通信が途中で切れました。');
    expect(within(alert).getByRole('button', { name: 'もう一度保存する' })).toBeInTheDocument();
  });

  it('別の画面でレポートが更新されていたら、送り直さず読み込み直しを促す', async () => {
    stubDrive({ upToDate: false, replies: [{ status: 409, code: 'conflict', message: 'レポートが更新されたため、保存を取りやめました。画面を読み込み直してください。' }] });
    renderReportPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('button', { name: '読み込み直す' })).toBeInTheDocument();
    expect(within(alert).queryByRole('button', { name: 'もう一度保存する' })).not.toBeInTheDocument();
  });

  it('Googleドライブに保存しない環境では、紙面の確認用にコーチ向けPDFを保存できる', async () => {
    const { fetchMock, click, savedFileNames } = stubPdfDownload();
    renderReportPage();

    fireEvent.click(await screen.findByRole('button', { name: 'コーチ向けPDF' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const [, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/report/pdf'))!;
    const { html } = JSON.parse(String(init?.body)) as { html: string };
    expect(html).toContain('はるとくんの3か月の変化');
    expect(html).toContain('はるとくんのメニュー提案');
    // 画面だけの切れ目は入れず、紙面の帯でコーチ用と分かるようにする。
    expect(html).not.toContain('ここからはコーチ向け');
    expect(html).toContain('コーチ用・保護者には渡さない');
    expect(html).toContain('<title>育ちマップ_はるとくん_7K3Q_第2回_コーチ用</title>');
    expect(savedFileNames).toEqual(['育ちマップ_はるとくん_7K3Q_第2回_コーチ用.pdf']);
    expect(screen.getByRole('button', { name: 'コーチ向けPDF' })).toBeEnabled();
  });

  it('PDFを作れなかったときは理由と再試行を通知する', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/report/pdf')) {
        return new Response(JSON.stringify({ error: { code: 'internal', message: 'PDFを作成できませんでした。少し待ってからもう一度お試しください。' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    renderReportPage();

    fireEvent.click(await screen.findByRole('button', { name: '保護者向けPDF' }));

    expect(await screen.findByText('PDFを作成できませんでした。少し待ってからもう一度お試しください。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'もう一度' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保護者向けPDF' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'コーチ向けPDF' })).toBeEnabled();
  });
});

interface DriveRequestBody {
  generatedAt: string;
  parentHtml: string;
  coachHtml: string;
}

const SAVED_DRIVE = {
  folderUrl: 'https://drive.google.com/drive/folders/child-folder',
  parentFileUrl: 'https://drive.google.com/file/d/parent-file/view',
  coachFileUrl: 'https://drive.google.com/file/d/coach-file/view',
  savedAt: '2026-10-11T05:32:00.000Z',
  upToDate: true,
};

/** 保存APIの応答。返し始める前の失敗（JSON）、まとめて返す途中経過（NDJSON）、テストから1行ずつ流す途中経過のどれか。 */
type DriveReply =
  | { status: number; code: string; message: string }
  | { lines: object[] }
  | { response: () => Response };

const SUCCESS_LINES = [
  { type: 'step', step: 'renderParent' },
  { type: 'step', step: 'renderCoach' },
  { type: 'step', step: 'upload' },
  { type: 'done', drive: SAVED_DRIVE },
];

function ndjsonResponse(body: BodyInit) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

/** テストから1行ずつ流せる保存APIの応答。 */
function controlledDriveStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(current) {
      controller = current;
    },
  });
  return {
    reply: { response: () => ndjsonResponse(body) } satisfies DriveReply,
    send: (event: object) => controller!.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)),
    close: () => controller!.close(),
  };
}

/** Googleドライブへの保存APIを差し替える。replies に並べた応答を先に返し、尽きたら保存に成功させる。 */
function stubDrive({ upToDate, replies = [] }: { upToDate: boolean; replies?: DriveReply[] }) {
  const initial = upToDate ? SAVED_DRIVE : { folderUrl: null, parentFileUrl: null, coachFileUrl: null, savedAt: null, upToDate: false };
  const driveRequests: DriveRequestBody[] = [];
  const pending = [...replies];
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input, init) => {
    if (String(input).endsWith('/report/drive')) {
      driveRequests.push(JSON.parse(String(init?.body)) as DriveRequestBody);
      const reply = pending.shift() ?? { lines: SUCCESS_LINES };
      if ('response' in reply) return reply.response();
      if ('lines' in reply) return ndjsonResponse(reply.lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
      return new Response(JSON.stringify({ error: { code: reply.code, message: reply.message } }), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ report, childId: '01K7A3B4C5D6E7F8G9HJKM7K3Q', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: initial }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, driveRequests };
}

function renderReportPage() {
  return renderWithProviders(<ReportPage />, { route: '/reports/assessment-1', path: '/reports/:id' });
}

/** PDF生成APIとファイル保存を差し替え、送ったHTMLと保存したファイル名を確かめられるようにする。 */
function stubPdfDownload() {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (input) => {
    if (String(input).endsWith('/report/pdf')) {
      return new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } });
    }
    return new Response(JSON.stringify({ report, childId: '01K7A3B4C5D6E7F8G9HJKM7K3Q', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  // jsdom には Blob の URL 化がないため、差し替えた URL で受ける。
  const createObjectURL = vi.fn(() => 'blob:report');
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL = createObjectURL;
    static override revokeObjectURL = vi.fn();
  });
  const savedFileNames: string[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    savedFileNames.push(this.download);
  });
  return { fetchMock, click, createObjectURL, savedFileNames };
}
