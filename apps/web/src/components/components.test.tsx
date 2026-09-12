import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportContentSchema } from '@papamo/shared';
import { ChildStatusBadge } from './ChildStatusBadge';
import { ConfirmDialog } from './ConfirmDialog';
import { CopyCode } from './CopyCode';
import { RadarChart } from './RadarChart';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('共通UI', () => {
  it('状態バッジは色だけでなく記号と説明を表示する', () => {
    render(<ChildStatusBadge state={{ key: 'due', label: '次回まであと3日', daysLeft: 3, order: 0.5 }} />);
    expect(screen.getByText('次回まであと3日')).toHaveTextContent('!');
  });

  it('共有コードをクリップボードへコピーし、結果を通知する', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CopyCode code="ABCD-EFGH" label="担当に追加するコード" description="説明" />);
    fireEvent.click(screen.getByRole('button', { name: 'コピー' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('コピーしました'));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
  });

  it('破壊操作の確認はモーダルダイアログで行う', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="削除しますか？" message="取り消せません。" confirmLabel="削除する" onCancel={onCancel} onConfirm={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('レーダーは前回と今回、未開放種目を読み上げ可能にする', () => {
    const report = reportContentSchema.parse({
      kind: 'comparison',
      generator: 'rule_v1',
      masterVersion: '2026-09',
      generatedAt: '2026-09-01T00:00:00.000Z',
      header: { childName: 'はると', honorific: 'kun', grade: '小学1年生', ageHint: '6〜7歳', seqNo: 2, assessedOn: '2026-09-01', prevAssessedOn: '2026-06-01', coachName: 'さとうコーチ' },
      levels: [
        { key: 'post', lv: 8, prevLv: 5, delta: 3, band: '17cm 一巡', ladderLabel: '課題' },
        { key: 'eyeh', lv: 7, prevLv: 6, delta: 1, band: '一人操作・逆手', ladderLabel: '課題' },
        { key: 'hand', lv: 6, prevLv: 6, delta: 0, band: '手形の切り替え', ladderLabel: '課題' },
      ],
      upcomingExercises: [
        { key: 'sacc', name: 'あしあとものまね', parentName: '見つけて覚える力', teaser: '説明' },
        { key: 'inhi', name: '信号ゲーム', parentName: '止まる・切り替える力', teaser: '説明' },
      ],
      priorities: [],
      strengths: [],
      changes3m: [],
      troubles: { current: [], gone: [], stayed: [], added: [] },
      link: { lowestKey: 'hand', text: '見立て' },
      ppi: { current: { time: 1, emo: 1, soc: 1, fut: 1, nav: 1 }, previous: { time: 2, emo: 2, soc: 2, fut: 2, nav: 2 }, note: '' },
      plan: null,
      outlook: [],
      nextDue: '2026-12-01',
      coach: { strategies: [], memo: '' },
    });
    render(<RadarChart report={report} extUnlocked={false} />);
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).toHaveTextContent('半年目以降');
    expect(screen.getByText('前回')).toBeInTheDocument();
    expect(screen.getByText('今回')).toBeInTheDocument();
  });
});
