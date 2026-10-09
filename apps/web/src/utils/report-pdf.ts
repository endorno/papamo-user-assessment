function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 読めるスタイルシートは中身を、読めない別オリジンのもの（Google Fonts）は URL のまま引き継ぐ。 */
function collectStyles(ownerDocument: Document) {
  const rules: string[] = [];
  const links: string[] = [];
  for (const sheet of Array.from(ownerDocument.styleSheets)) {
    try {
      rules.push(Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n'));
    } catch {
      if (sheet.href) links.push(sheet.href);
    }
  }
  return { rules, links };
}

/** 保護者向けはコーチ向けの紙面（data-coach-only）を外した4枚、コーチ向けは末尾のメニュー提案まで含める。 */
export type ReportAudience = 'parent' | 'coach';

const REMOVED_ELEMENTS: Record<ReportAudience, string> = {
  parent: '[data-print-hidden], [data-coach-only], script',
  coach: '[data-print-hidden], script',
};

/**
 * 画面に表示しているレポートを、サーバーでそのままPDFにできる1枚のHTMLにまとめる。
 * CSS Modules のクラスは祖先要素のクラスに依存するため、シートだけでなくレポート全体を複製する。
 */
export function buildReportHtml(root: HTMLElement, title: string, audience: ReportAudience) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(REMOVED_ELEMENTS[audience]).forEach((element) => element.remove());
  const { rules, links } = collectStyles(root.ownerDocument);
  const linkTags = links.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('');
  // CSS の文字列に </style> が含まれていても、style 要素が途中で閉じないようにする。
  const css = rules.join('\n').replace(/<\/style/gi, '<\\/style');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${linkTags}<style>${css}</style></head><body>${clone.outerHTML}</body></html>`;
}

// 解放が早すぎるとダウンロードが始まる前に URL が消えるブラウザがあるため、しばらく残す。
const OBJECT_URL_LIFETIME_MS = 60_000;

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
