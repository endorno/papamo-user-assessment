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
  const child = { name: 'はると', honorific: 'kun' as const, grade: '小学1年生', gradeCode: 'e1' as const, ageHint: '6〜7歳', ageGroup: 'sch' as const, joinedMonth: '2026-03' };
  const previous = {
    seqNo: 1,
    assessedOn: '2026-06-01',
    unlockExt: false,
    data: {
      lv: { post: 5, eyeh: 5, hand: 5 },
      observations: { post: ['指示理解の難しさ'], eyeh: [], hand: [] },
      observationNotes: {},
      engagement: { dur: 1, sup: 2 },
      troubles: ['姿勢がすぐ崩れる／机に伏せる・寝転がる', '忘れ物・なくし物が多い'],
      wants: ['w18'],
      copm: [
        { text: '自分で決めた目標', memo: '', performance: 5, satisfaction: 5, importance: 4 },
        { text: '姿勢よく座れるようになる', memo: '', performance: 3, satisfaction: 3, importance: 9 },
      ],
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
  it('初回レポートは保護者向けの2枚で、1枚目にスコアと種目ごとの力を出す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const firstSheet = await screen.findByRole('region', { name: 'レポート1ページ目' });
    expect(firstSheet).toHaveTextContent('本体（ご家庭説明用）｜Page 1');
    expect(within(firstSheet).getByRole('heading', { level: 1 })).toHaveTextContent('はるとくんのスコア');
    expect(firstSheet).toHaveTextContent('アセスメント日：2026年6月1日');
    // 年齢は保存しないため、学年から引いた目安を名前に添える。担当コーチの行は出さない。
    expect(firstSheet).toHaveTextContent('はるとくん（6〜7歳）小学1年生');
    expect(firstSheet).not.toHaveTextContent('担当');
    expect(firstSheet).toHaveTextContent('へやすぽアシスト');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'レポート3ページ目' })).not.toBeInTheDocument();

    // 図の読み方は育ちマップの見出しのすぐ下。総合点の分母は実施した種目（基本3種目 × 30）だけで数える。
    const hero = screen.getByRole('region', { name: '育ちマップ' });
    expect(hero).toHaveTextContent(/^育ちマップ（5つの土台のレーダーチャート）できた・できなかったの採点ではなく/);
    expect(hero).toHaveTextContent(/今の到達\s*15\s*\/90（実施した3種目の合計）/);
    // 未開放の種目は「未実施」と表示し、凡例は前回と重ねる比較のときだけ出す。
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).toHaveTextContent('未実施');
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).not.toHaveTextContent('半年目以降');
    expect(screen.queryByText('今回')).not.toBeInTheDocument();

    const abilities = within(hero).getByRole('region', { name: /実施した種目ごとの、できている力／次に高めたい力/ });
    expect(abilities).toHaveTextContent('ラインウォークLv5/30');
    expect(abilities).toHaveTextContent('できている力狭い足場で体の軸を保ち、頭を動かしても崩れない');
    expect(abilities).toHaveTextContent('次に高めたい力体の軸を安定させる');
    expect(abilities).toHaveTextContent('①前庭覚②姿勢③バランス');
    // 当日の様子の注記は、その種目のところに添える。
    expect(abilities).toHaveTextContent('当日の様子（指示理解の難しさ）');
    // 優先テーマ・強みのカードと、未測定の注記は出さない。
    expect(firstSheet).not.toHaveTextContent('これから特に伸ばしたい力');
    expect(firstSheet).not.toHaveTextContent('強み（いま伸びているところ）');
    expect(firstSheet).not.toHaveTextContent('今回まだ測っていません');
    expect(within(firstSheet).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.replace(/アルゴリズム調整中.*$/, ''))).toEqual([
      '実施した種目ごとの、できている力／次に高めたい力',
      '取り組みの様子',
    ]);
    // 暫定の箇所はコーチに分かるよう画面に目印を出し、PDFには出さない。
    const tuningTags = screen.getAllByText(/アルゴリズム調整中/);
    expect(tuningTags.length).toBeGreaterThan(0);
    for (const tag of tuningTags) expect(tag).toHaveAttribute('data-print-hidden');
  });

  it('2枚目は最重要の領域・2系統のピラミッド・目標・困りごとの背景・振り返りの予定の順に並べる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: firstReport, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const sheet = await screen.findByRole('region', { name: 'レポート2ページ目' });
    expect(sheet).toHaveTextContent('本体（ご家庭説明用）｜Page 2');
    expect(within(sheet).getByRole('heading', { level: 1 })).toHaveTextContent('発達ピラミッドから見る、育てるべき領域');
    expect(within(sheet).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.replace(/アルゴリズム調整中.*$/, ''))).toEqual([
      '最重要にすべき領域',
      'ご家族・本人の目標',
      '困りごとの背景にありそうな力',
      '今の困りごとが続いた場合に起こりうること',
      '次回の振り返りスケジュール',
    ]);

    const focus = within(sheet).getByRole('region', { name: /最重要にすべき領域/ });
    const focusItems = within(focus).getAllByRole('listitem');
    expect(focusItems).toHaveLength(3);
    expect(focusItems[0]).toHaveTextContent('1前庭覚重力の向きと体の傾きを感じ取る');
    expect(focusItems[0]).toHaveTextContent('目標「姿勢よく座れるようになる」などの達成に近づきます。');

    // ピラミッドは5段で、上の段ほど狭い。目標由来と測定・お困りごと由来を描き分け、凡例を上に置く。
    expect(sheet).toHaveTextContent('該当なし目標から必要測定・お困りごと両方');
    const pyramidRows = sheet.querySelectorAll('[class*="pyramidRow"]');
    expect(pyramidRows).toHaveLength(5);
    expect(pyramidRows[0]?.className).toMatch(/pyramidTier5/);
    expect(pyramidRows[4]?.className).toMatch(/pyramidTier1/);
    expect(within(sheet).getByText('前庭覚', { selector: '[class*="pyramidCell"]' }).className).toMatch(/pyramidBoth/);
    expect(within(sheet).getByText('視覚', { selector: '[class*="pyramidCell"]' }).className).toMatch(/pyramidNone/);

    // 目標は重要度の高い順。現在の状態は遂行度・満足度の2段の見出しにする。
    const goalTable = within(sheet).getAllByRole('table')[0]!;
    expect(goalTable).toHaveTextContent('親御さんにとっての重要度');
    expect(within(goalTable).getByRole('columnheader', { name: '現在の状態 （10段階）' })).toHaveAttribute('colspan', '2');
    expect(within(goalTable).getAllByRole('row')[1]).toHaveTextContent('遂行度満足度');
    const goalRows = within(goalTable).getAllByRole('row').slice(2);
    expect(goalRows.map((row) => row.textContent)).toEqual([
      '姿勢よく座れるようになる933①前庭覚②姿勢③バランス',
      '自分で決めた目標455—',
    ]);

    // 困りごとの背景は、優先して見る土台をピラミッドの要素名で出す。
    const backgroundTable = within(sheet).getAllByRole('table')[1]!;
    expect(backgroundTable).toHaveTextContent('姿勢がすぐ崩れる／机に伏せる・寝転がる');
    expect(backgroundTable).toHaveTextContent('ボディイメージ');

    const risk = within(sheet).getByRole('region', { name: /今の困りごとが続いた場合に起こりうること/ });
    expect(within(risk).getByText('疲れやすくなる').tagName).toBe('STRONG');
    expect(risk).toHaveTextContent('小6ごろ約5学年先（自立への移行）');
    expect(risk).toHaveTextContent('高校ごろ約9学年先（自己実現と将来設計）');

    const schedule = within(sheet).getByRole('region', { name: '次回の振り返りスケジュール' });
    expect(schedule).toHaveTextContent('3か月レビュー2026年9月1日ごろ');
    expect(schedule).toHaveTextContent('6か月レビュー2026年12月1日ごろ');
    expect(sheet).toHaveTextContent('本レポートは運動課題の到達段階の記録であり、診断ではありません。');
    // お困り度と6か月ロードマップは廃止した。
    expect(screen.queryByText(/ご家庭のお困り度/)).not.toBeInTheDocument();
    expect(screen.queryByText(/6か月成長ロードマップ/)).not.toBeInTheDocument();
  });

  it('比較レポートも同じ2枚構成で、前回との差を添える', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const firstSheet = await screen.findByRole('region', { name: 'レポート1ページ目' });
    expect(within(firstSheet).getByRole('heading', { level: 1 })).toHaveTextContent('はるとくんのスコア');
    expect(firstSheet).toHaveTextContent('アセスメント日：2026年9月1日（前回 2026年6月1日）');
    expect(firstSheet).toHaveTextContent('色の濃い線が今回、点線が3か月前です。');
    expect(screen.getByText('前回')).toBeInTheDocument();
    expect(screen.getByText('今回')).toBeInTheDocument();
    expect(within(firstSheet).getByRole('region', { name: /実施した種目ごとの/ })).toHaveTextContent('ラインウォークLv8/30（▲3）');
    expect(firstSheet).toHaveTextContent('3か月でできるようになったこと');
    expect(screen.getByRole('region', { name: 'レポート2ページ目' })).toHaveTextContent('前回 3');
    expect(screen.queryByRole('region', { name: 'レポート3ページ目' })).not.toBeInTheDocument();
  });

  it('保護者向けの2枚のあとに、コーチ向けの切れ目とメニュー提案を置く', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ report, childId: 'child-1', assessmentId: 'assessment-1', hasUnreportedChanges: false, readOnly: false, drive: null }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    renderReportPage();

    const coachSheet = await screen.findByRole('region', { name: 'コーチ向け メニュー提案' });
    const lastParentSheet = screen.getByRole('region', { name: 'レポート2ページ目' });
    expect(lastParentSheet.compareDocumentPosition(coachSheet) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 切れ目は画面だけに出し、紙面は保護者向けPDFから外す目印を付ける。
    expect(screen.getByText('ここからはコーチ向け').closest('[data-print-hidden]')).not.toBeNull();
    expect(coachSheet).toHaveAttribute('data-coach-only');
    expect(coachSheet).toHaveTextContent('コーチ用｜Page 3');
    expect(coachSheet).toHaveTextContent('コーチ用・保護者には渡さない');
    // コーチ向けは、誰が作ったレポートかが分かるよう担当を出したままにする。
    expect(coachSheet).toHaveTextContent('担当 さとうコーチ');
    expect(within(coachSheet).getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      '13か月・6か月に当てるメニュー',
      '2目標への当て方',
    ]);
    expect(coachSheet).toHaveTextContent('主軸');
    expect(coachSheet).toHaveTextContent('対応するメニューパッケージ');
    // 保護者向けの紙面にはメニュー提案を出さない。
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

  it('保護者向けPDFは2枚だけをサーバーへ送り、ファイルとして保存する', async () => {
    const { fetchMock, click, createObjectURL, savedFileNames } = stubPdfDownload();
    renderReportPage();

    fireEvent.click(await screen.findByRole('button', { name: '保護者向けPDF' }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    const [url, init] = fetchMock.mock.calls.find(([input]) => String(input).endsWith('/report/pdf'))!;
    expect(url).toBe('/api/assessments/assessment-1/report/pdf');
    expect(init?.method).toBe('POST');
    const { html } = JSON.parse(String(init?.body)) as { html: string };
    // 画面の2枚をそのまま送り、操作ボタンやコーチ向けの紙面、暫定の目印など保護者に渡さないものは含めない。
    expect(html).toContain('はるとくんのスコア');
    expect(html).toContain('発達ピラミッドから見る、育てるべき領域');
    expect(html).not.toContain('はるとくんのメニュー提案');
    expect(html).not.toContain('ここからはコーチ向け');
    expect(html).not.toContain('アルゴリズム調整中');
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
    expect(html).toContain('はるとくんのスコア');
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
