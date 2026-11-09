/*
 * レポートのPDFの刷り面と、紙面（.sheet）をA4のページに分ける採寸スクリプト。
 * ブラウザを操作する report-pdf.ts から分けているのは、紙面を確かめる検証用のスクリプトからも同じものを読み込むため（ほかに依存しない）。
 */

// A4 の余白（design-mock-v2 の印刷設定に合わせる）。
export const PAGE_MARGIN_MM = { top: 9, bottom: 9, left: 8, right: 8 } as const;
const A4_MM = { width: 210, height: 297 };
const PX_PER_MM = 96 / 25.4;

/**
 * 紙面を組む幅（CSS px）。画面のレポートの幅（.reportWrap の 860px）と同じにし、画面で見た紙面をそのまま A4 の幅に縮めて刷る。
 * 縮める率はすべての紙面で同じにする（以前は紙面ごとに 0.55〜1.1 で変えて1枚に収めていたが、内容が多いと文字が小さくなりすぎたため。2026-11-09）。
 */
export const SHEET_LAYOUT_WIDTH_PX = 860;
const PRINTABLE_WIDTH_PX = (A4_MM.width - PAGE_MARGIN_MM.left - PAGE_MARGIN_MM.right) * PX_PER_MM;
const PRINTABLE_HEIGHT_PX = (A4_MM.height - PAGE_MARGIN_MM.top - PAGE_MARGIN_MM.bottom) * PX_PER_MM;

/** page.pdf の scale。約 0.853（本文 16px が約 10pt）。 */
export const PDF_SCALE = PRINTABLE_WIDTH_PX / SHEET_LAYOUT_WIDTH_PX;

/** 1ページの高さ（紙面を組む CSS px）。採寸のビューポートにも使う。 */
export const SHEET_PAGE_HEIGHT_PX = PRINTABLE_HEIGHT_PX / PDF_SCALE;

/**
 * 1ページを少しだけはみ出す紙面は、この率までなら縮めて1ページに収める（本文 16px が約 9pt）。
 * 数行のためにほとんど空のページが足されるのを避けるため。これより多くはみ出す紙面は縮めずにページを分ける。
 */
export const SHEET_MIN_FIT_ZOOM = 0.9;

/*
 * 紙面を、内容の切れ目でA4のページに分ける。文や表の行・カードの途中では切らない。
 * 分けたページは元の紙面を複製した .sheet にし、見出し（data-page-header。「（つづき）」を出す）・フッター・枠を毎ページに付けて、
 * 枠が紙面の下まで届くよう最低高さを付ける。ページの数は内容の量で変わる（2026-11-09 PdM 了承）。
 *
 * 紙面の側（apps/web の ReportPage・CoachMenu）は次の印で切れ目を指定する。
 * - data-page-body：本文を流す要素。その子の間で切る。
 * - data-page-header / data-page-footer：毎ページに付ける見出し・フッター（本文の要素の子でもよい）。
 * - data-page-split：子の間でも切ってよい要素（一覧・表の tbody など）。表を分けたら見出しの行（thead）を付け直す。
 * - data-page-keep-next：直後の要素と同じページに置く（見出し h1〜h6 も同じ扱い）。
 * - data-page-continued：分けた2ページ目以降でだけ見せる印（hidden で描いておく）。
 * - data-page-number：保護者向けの紙面の通し番号。分けた後に1から振り直す。
 * 1つの塊がページより高いとき（入力の上限内では起きない）だけ、そのページを縮めて収める。
 *
 * 採寸は紙面1枚につき1回で済むので、以前の縮小率の二分探索（紙面1枚につき十数回）より速い。
 * コーチ向けは先頭にコーチ用の紙面（data-coach-only）があり、保護者向けはその後ろの紙面と同じなので、
 * 保護者向けに出すページ（コーチ用でない紙面のページ番号）を返す。コーチ用の印は紙面の単位でだけ付ける（ページの範囲で保護者向けを切り出すため）。
 * ページ内のスクリプトは止めているため、ここで評価する。関数ではなく文字列で渡すのは、Worker のバンドルで付く補助関数を持ち込まないため。
 */
export const PAGINATE_SHEETS_SCRIPT = `(() => {
  // 刷るときの丸めで次のページにはみ出さないよう、少しだけ余らせる。
  const target = ${SHEET_PAGE_HEIGHT_PX} * 0.985;
  // 切れ目の位置からの見積もりに足すゆとり（直前の要素の下の余白など、測っていない分）。
  const allowance = 12;
  // 少しだけはみ出す紙面は、ほとんど空のページを足すより、この率までなら縮めて1ページに収める。
  const minFitZoom = ${SHEET_MIN_FIT_ZOOM};
  if (document.querySelector('.sheet:not([data-coach-only]) [data-coach-only]')) {
    throw new Error('コーチ用の印が保護者向けの紙面の中にあります。');
  }
  const rect = (element) => element.getBoundingClientRect();
  const px = (value) => parseFloat(value) || 0;
  const isMarker = (element) => element.hasAttribute('data-page-header') || element.hasAttribute('data-page-footer');
  const keepsNext = (element) => /^H[1-6]$/.test(element.tagName) || element.hasAttribute('data-page-keep-next') || element.hasAttribute('data-page-header');

  // この要素の手前で切ってよいか。その入れ物の最初の要素（入れ物ごと次へ送る）と、見出しの直後は切らない。
  function breakable(element) {
    if (isMarker(element)) return false;
    const previous = element.previousElementSibling;
    return Boolean(previous) && !keepsNext(previous);
  }

  function candidatesOf(body) {
    const containers = [body, ...body.querySelectorAll('[data-page-split]')];
    return containers.flatMap((container) => [...container.children].filter(breakable));
  }

  // 切れ目より前の部分の下に残る、入れ物の下側の余白と枠。
  function closingSpace(element, body) {
    let space = 0;
    for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      space += px(style.paddingBottom) + px(style.borderBottomWidth) + px(style.marginBottom);
    }
    return space;
  }

  // 本文の終わりから紙面の下端まで（フッター・カードの下の余白と枠）。
  function tailOf(sheet, body) {
    const footer = body.querySelector(':scope > [data-page-footer]');
    if (footer) return rect(sheet).bottom - rect(footer).top;
    const style = getComputedStyle(body);
    return rect(sheet).bottom - (rect(body).bottom - px(style.paddingBottom) - px(style.borderBottomWidth));
  }

  function shallowClone(element) {
    const clone = element.cloneNode(false);
    clone.removeAttribute('id');
    // 表を分けたら、次のページでも列の見出しが読めるように付け直す。
    if (element.tagName === 'TABLE') {
      for (const part of element.querySelectorAll(':scope > colgroup, :scope > thead')) clone.append(part.cloneNode(true));
    }
    return clone;
  }

  function moveFrom(node, into, before) {
    for (let current = node; current;) {
      const next = current.nextSibling;
      if (!(current.nodeType === 1 && current.hasAttribute('data-page-footer'))) into.insertBefore(current, before);
      current = next;
    }
  }

  // element の手前で紙面を分け、element 以降を紙面の直後に足したページへ移す。入れ物は浅く複製して続きを入れる。
  function splitBefore(sheet, body, element) {
    let current = element;
    while (current.parentElement !== body) {
      const parent = current.parentElement;
      const clone = shallowClone(parent);
      moveFrom(current, clone, null);
      if (parent.tagName === 'OL') clone.start = parent.start + parent.children.length;
      parent.after(clone);
      current = clone;
    }
    const page = sheet.cloneNode(true);
    page.removeAttribute('id');
    page.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    const pageBody = page.querySelector('[data-page-body]');
    for (const child of [...pageBody.children]) {
      if (!isMarker(child)) child.remove();
    }
    page.querySelectorAll('[data-page-continued]').forEach((node) => { node.hidden = false; });
    moveFrom(current, pageBody, pageBody.querySelector(':scope > [data-page-footer]'));
    sheet.after(page);
    return page;
  }

  for (const first of [...document.querySelectorAll('.sheet')]) {
    let sheet = first;
    sheet.style.minHeight = '';
    // 縮めて収める紙面は分けない（縮める率は後でまとめて決める）。
    if (target / rect(sheet).height >= minFitZoom) continue;
    // 1枚がページに収まるまで、収まる範囲でいちばん後ろの切れ目で分けていく。
    for (let guard = 0; guard < 100; guard += 1) {
      const body = sheet.querySelector('[data-page-body]');
      const sheetRect = rect(sheet);
      if (!body || sheetRect.height <= target) break;
      const tail = tailOf(sheet, body);
      let best = null;
      let earliest = null;
      for (const candidate of candidatesOf(body)) {
        const top = rect(candidate).top - sheetRect.top;
        if (top <= 0) continue;
        if (!earliest || top < earliest.top) earliest = { candidate, top };
        const height = top + closingSpace(candidate, body) + tail + allowance;
        if (height <= target && (!best || top > best.top)) best = { candidate, top };
      }
      // どこで切っても収まらない（最初の塊がページより高い）ときは、なるべく前で切って残りを次へ送る。
      const chosen = best ?? earliest;
      if (!chosen) break;
      sheet = splitBefore(sheet, body, chosen.candidate);
    }
  }

  const pages = [...document.querySelectorAll('.sheet')];
  for (const page of pages) {
    const height = rect(page).height;
    // 少しだけはみ出す紙面と、1つの塊がページより高いページを縮める。
    // 縮めると紙面の幅が広がって行が減るので、高さの比で縮めれば必ず収まる（測り直さずに済む）。
    const zoom = height > target ? Math.floor((target / height) * 1000) / 1000 : 1;
    if (zoom < 1) page.style.zoom = String(zoom);
    // 枠が紙面の下まで届くよう、残りを最低高さで埋める（min-height も zoom で拡縮される）。
    page.style.minHeight = target / zoom + 'px';
  }
  document.querySelectorAll('[data-page-number]').forEach((node, index) => { node.textContent = String(index + 1); });
  const parentPages = pages.flatMap((page, index) => (page.hasAttribute('data-coach-only') ? [] : [index + 1]));
  // 「（つづき）」など、分けた後に初めて出る文字のフォントを待つ。
  return document.fonts.ready.then(() => ({ pageCount: pages.length, parentPages }));
})()`;

/** 採寸の結果。parentPages は保護者向けに出すページ（1始まり）。 */
export interface SheetPagination {
  pageCount: number;
  parentPages: number[];
}
