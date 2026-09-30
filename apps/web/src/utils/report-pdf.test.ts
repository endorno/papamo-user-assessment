import { afterEach, describe, expect, it } from 'vitest';

import { buildReportHtml } from './report-pdf';

describe('buildReportHtml', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('レポート全体と読めるCSSを1枚のHTMLにまとめ、紙面に要らない要素とスクリプトを外す', () => {
    const style = document.createElement('style');
    style.textContent = '.sheet { color: red; }';
    document.head.append(style);
    document.body.innerHTML = `
      <main class="report">
        <div data-print-hidden><button>PDFをダウンロード</button></div>
        <section class="sheet">1枚目</section>
        <script>alert(1)</script>
      </main>`;

    const html = buildReportHtml(document.querySelector('main')!, '育ちマップ_<はると>くん');

    expect(html).toMatch(/^<!doctype html><html lang="ja">/);
    expect(html).toContain('<title>育ちマップ_&lt;はると&gt;くん</title>');
    expect(html).toMatch(/<style>[^<]*\.sheet \{\s*color: red;\s*\}/);
    expect(html).toContain('<main class="report">');
    expect(html).toContain('<section class="sheet">1枚目</section>');
    expect(html).not.toContain('PDFをダウンロード');
    expect(html).not.toContain('<script');
  });
});
