import { describe, expect, it } from 'vitest';

import { reportFileTitle } from './report-file';

describe('レポートPDFのファイル名', () => {
  const report = { childId: '01K7A3B4C5D6E7F8G9HJKM7K3Q', childName: 'はると', honorific: 'kun' as const, seqNo: 3 };

  it('保護者向けは名前・敬称・短縮ID・回で作る', () => {
    expect(reportFileTitle(report, 'parent')).toBe('育ちマップ_はるとくん_7K3Q_第3回');
  });

  it('コーチ向けは保護者向けと取り違えないよう末尾に「コーチ用」を付ける', () => {
    expect(reportFileTitle(report, 'coach')).toBe('育ちマップ_はるとくん_7K3Q_第3回_コーチ用');
  });
});
