import puppeteer from '@cloudflare/puppeteer';

import type { Env } from '../env';

export type ReportPdfRenderer = (env: Env, html: string) => Promise<Uint8Array<ArrayBuffer>>;

// 受け取ったHTMLから任意の宛先へ通信させないため、Webフォント（Zen Kaku Gothic New）の配信元だけを通す。
const ALLOWED_REQUEST_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

// 起動からフォント読み込みまで通常は数秒で終わる。止まったときに Worker を待たせ続けない。
const RENDER_TIMEOUT_MS = 30_000;

// A4 の余白（design-mock-v2 の印刷設定に合わせる）。刷り面の大きさは CSS px（96dpi）に直して採寸に使う。
const PAGE_MARGIN_MM = { top: 9, bottom: 9, left: 8, right: 8 };
const A4_MM = { width: 210, height: 297 };
const PX_PER_MM = 96 / 25.4;
const PRINTABLE_WIDTH_PX = Math.floor((A4_MM.width - PAGE_MARGIN_MM.left - PAGE_MARGIN_MM.right) * PX_PER_MM);
const PRINTABLE_HEIGHT_PX = Math.floor((A4_MM.height - PAGE_MARGIN_MM.top - PAGE_MARGIN_MM.bottom) * PX_PER_MM);

/*
 * 1シート＝1ページを保証するため、シートごとに高さを実測して zoom で紙面に収める（design-mock-v2 の fitA4 を移植）。
 * 余白が大きく余るシートは少し拡大して紙面を埋める。zoom は再レイアウトを伴い高さが線形に縮まないので、測り直しながら詰める。
 * Chrome 127 以前は zoom をかけた要素の getBoundingClientRect が拡縮前の大きさを返すため、紙面上の高さは zoom を掛けて求める。
 * ページ内のスクリプトは止めているため、ここで評価する。関数ではなく文字列で渡すのは、Worker のバンドルで付く補助関数を持ち込まないため。
 */
const FIT_SHEETS_SCRIPT = `(() => {
  const target = ${PRINTABLE_HEIGHT_PX} * 0.985;
  const maxZoom = 1.1;
  const minZoom = 0.55;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:100px;zoom:0.5';
  document.body.append(probe);
  const rectIncludesZoom = probe.getBoundingClientRect().height < 75;
  probe.remove();
  for (const sheet of document.querySelectorAll('.sheet')) {
    sheet.style.zoom = '';
    sheet.style.minHeight = '';
    let zoom = Math.min(maxZoom, Math.max(minZoom, target / sheet.getBoundingClientRect().height));
    for (let attempt = 0; attempt < 10; attempt += 1) {
      sheet.style.zoom = zoom.toFixed(3);
      const rectHeight = sheet.getBoundingClientRect().height;
      const printedHeight = rectIncludesZoom ? rectHeight : rectHeight * zoom;
      if (printedHeight <= target || zoom <= minZoom) break;
      zoom = Math.max(minZoom, (zoom * target) / printedHeight - 0.004);
    }
    // 枠が紙面の下まで届くよう、残りを最低高さで埋める（min-height も zoom で拡縮される）。
    sheet.style.minHeight = target / zoom + 'px';
  }
})()`;

function isAllowedRequest(url: string) {
  if (url.startsWith('data:')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_REQUEST_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** 画面に表示したレポートのHTMLを、Browser Run のヘッドレス Chrome で A4 のPDFにする。 */
export const renderReportPdf: ReportPdfRenderer = async (env, html) => {
  const browser = await puppeteer.launch(env.BROWSER);
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
    await page.setViewport({ width: PRINTABLE_WIDTH_PX, height: PRINTABLE_HEIGHT_PX });
    await page.emulateMediaType('print');
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: RENDER_TIMEOUT_MS });
    // display=swap のフォントは読み込み前に代替フォントで描かれるため、揃ってから採寸する。
    await page.evaluate('document.fonts.ready.then(() => true)');
    await page.evaluate(FIT_SHEETS_SCRIPT);
    const pdf = await page.pdf({
      format: 'A4',
      margin: {
        top: `${PAGE_MARGIN_MM.top}mm`,
        bottom: `${PAGE_MARGIN_MM.bottom}mm`,
        left: `${PAGE_MARGIN_MM.left}mm`,
        right: `${PAGE_MARGIN_MM.right}mm`,
      },
      printBackground: true,
      displayHeaderFooter: false,
      timeout: RENDER_TIMEOUT_MS,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
};
