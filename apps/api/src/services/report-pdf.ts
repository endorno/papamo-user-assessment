import puppeteer, { type Page } from '@cloudflare/puppeteer';

import type { Env } from '../env';
import {
  PAGE_MARGIN_MM,
  PAGINATE_SHEETS_SCRIPT,
  PDF_SCALE,
  SHEET_LAYOUT_WIDTH_PX,
  SHEET_PAGE_HEIGHT_PX,
  type SheetPagination,
} from './report-pdf-layout';

/**
 * 1つのHTMLから書き出すPDF。pages は書き出すページ（all：全ページ、parent：コーチ用の紙面を除いたページ）。
 * title は PDF の文書名（ビューアのタイトルに出る）。省略時はHTMLの title のまま。
 */
export interface ReportPdfOutput {
  pages: 'all' | 'parent';
  title?: string;
}

/** 段階ごとの知らせ（Drive 保存の進み具合を画面に知らせ、所要時間を記録するため）。 */
export interface ReportPdfProgress {
  /** ブラウザを起動し終えたとき。 */
  onLaunched?: () => void;
  /** 紙面をページに分け終えた後、各PDFを書き出し始めるとき。 */
  onOutputStart?: (index: number) => void;
}

/**
 * 渡したHTMLを1回だけ読み込んで採寸し、outputs の順にPDFを返す。
 * コーチ向け（コーチ用の紙面＋本体）のHTMLから、保護者向け（本体だけ）も同じ紙面のページの範囲で切り出す。
 * 保護者向けとコーチ向けを別々に読み込むと、フォントの読み込みと採寸が2回になって遅いため（2026-11-09）。
 */
export type ReportPdfRenderer = (
  env: Env,
  html: string,
  outputs: readonly ReportPdfOutput[],
  progress?: ReportPdfProgress,
) => Promise<Uint8Array<ArrayBuffer>[]>;

// 受け取ったHTMLから任意の宛先へ通信させないため、Webフォント（Zen Kaku Gothic New）の配信元だけを通す。
const ALLOWED_REQUEST_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// 起動からフォント読み込みまで通常は数秒で終わる。止まったときに Worker を待たせ続けない。
const RENDER_TIMEOUT_MS = 30_000;

// 紙面を組んで（フォントの読み込みが始まって）から、使う文字のフォントがそろうのを待つ。
// networkidle0（通信が0.5秒止まるまで待つ）より、要るフォントだけを待つほうが早く終わる。
const WAIT_FOR_FONTS_SCRIPT = 'void document.body.getBoundingClientRect(); document.fonts.ready.then(() => true)';

function isAllowedRequest(url: string) {
  if (url.startsWith('data:')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_REQUEST_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * ページ内で評価して結果を待つ。応答が無いときに既定の3分（protocolTimeout）待たせず、PDFの作成を失敗にする
 * （ローカルの wrangler dev では、フォントの読み込み中にページが応答しなくなることがあった。2026-11-09）。
 */
async function evaluateWithin<T>(page: Page, script: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('紙面の採寸が時間内に終わりませんでした。')), RENDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([page.evaluate(script) as Promise<T>, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function pageRangeOf(output: ReportPdfOutput, pagination: SheetPagination) {
  if (output.pages === 'all') return undefined;
  if (!pagination.parentPages.length) throw new Error('保護者向けの紙面がありません。');
  return pagination.parentPages.join(',');
}

/** 画面に表示したレポートのHTMLを、Browser Run のヘッドレス Chrome で A4 のPDFにする。 */
export const renderReportPdf: ReportPdfRenderer = async (env, html, outputs, progress) => {
  const browser = await puppeteer.launch(env.BROWSER);
  progress?.onLaunched?.();
  try {
    const page = await browser.newPage();
    // 送られてくるのは描画済みのスナップショットなので、ページ内のスクリプトは動かさない。
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (isAllowedRequest(request.url())) {
        void request.continue();
      } else {
        void request.abort();
      }
    });
    // 採寸を紙面と同じ幅・同じ印刷用スタイルで行う。
    await page.setViewport({ width: SHEET_LAYOUT_WIDTH_PX, height: Math.floor(SHEET_PAGE_HEIGHT_PX) });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    // display=swap のフォントは読み込み前に代替フォントで描かれるため、そろってから採寸する。
    await evaluateWithin(page, WAIT_FOR_FONTS_SCRIPT);
    const pagination = await evaluateWithin<SheetPagination>(page, PAGINATE_SHEETS_SCRIPT);

    const pdfs: Uint8Array<ArrayBuffer>[] = [];
    for (const [index, output] of outputs.entries()) {
      progress?.onOutputStart?.(index);
      if (output.title !== undefined) await page.evaluate(`document.title = ${JSON.stringify(output.title)}`);
      const pdf = await page.pdf({
        format: 'A4',
        margin: {
          top: `${PAGE_MARGIN_MM.top}mm`,
          bottom: `${PAGE_MARGIN_MM.bottom}mm`,
          left: `${PAGE_MARGIN_MM.left}mm`,
          right: `${PAGE_MARGIN_MM.right}mm`,
        },
        scale: PDF_SCALE,
        pageRanges: pageRangeOf(output, pagination),
        printBackground: true,
        displayHeaderFooter: false,
        timeout: RENDER_TIMEOUT_MS,
      });
      pdfs.push(new Uint8Array(pdf));
    }
    return pdfs;
  } finally {
    await browser.close();
  }
};
