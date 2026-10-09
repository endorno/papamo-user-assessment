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

    const html = buildReportHtml(document.querySelector('main')!, '育ちマップ_<はると>くん', 'parent');

    expect(html).toMatch(/^<!doctype html><html lang="ja">/);
    expect(html).toContain('<title>育ちマップ_&lt;はると&gt;くん</title>');
    expect(html).toMatch(/<style>[^<]*\.sheet \{\s*color: red;\s*\}/);
    expect(html).toContain('<main class="report">');
    expect(html).toContain('<section class="sheet">1枚目</section>');
    expect(html).not.toContain('PDFをダウンロード');
    expect(html).not.toContain('<script');
  });

  it('保護者向けにはコーチ向けの紙面を入れず、コーチ向けには末尾まで入れる', () => {
    document.body.innerHTML = `
      <main class="report">
        <section class="sheet">4枚目</section>
        <div data-print-hidden>ここからはコーチ向け</div>
        <section class="sheet" data-coach-only>メニュー提案</section>
      </main>`;
    const root = document.querySelector('main')!;

    const parentHtml = buildReportHtml(root, '育ちマップ', 'parent');
    expect(parentHtml).toContain('4枚目');
    expect(parentHtml).not.toContain('メニュー提案');

    const coachHtml = buildReportHtml(root, '育ちマップ_コーチ用', 'coach');
    expect(coachHtml).toContain('4枚目');
    expect(coachHtml).toContain('メニュー提案');
    // 画面だけの切れ目は、どちらのPDFにも入れない。
    expect(coachHtml).not.toContain('ここからはコーチ向け');
    // 画面の表示はそのまま残す。
    expect(root).toHaveTextContent('メニュー提案');
  });
});
