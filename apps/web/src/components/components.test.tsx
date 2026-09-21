import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MASTER_VERSION, reportContentSchema, RuleBasedReportGenerator } from '@papamo/shared';
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

  it('次回予定のバッジは一覧に収まるよう年を省いて表示する', () => {
    render(<ChildStatusBadge state={{ key: 'ok', label: '次回 2026-12-12 予定', dueDate: '2026-12-12', order: 2 }} />);
    expect(screen.getByText('次回 12月12日 予定')).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).not.toBeInTheDocument();
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

  it('取り消せない操作はキャンセルから始め、3つ目の選択肢も出せる', () => {
    const secondary = vi.fn();
    render(
      <ConfirmDialog
        open
        title="削除しますか？"
        message="取り消せません。"
        confirmLabel="削除する"
        secondary={{ label: '前回を編集する', onClick: secondary }}
        detail={<p>前回：第1回</p>}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'キャンセル' })).toHaveFocus();
    expect(screen.getByText('前回：第1回')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '前回を編集する' }));
    expect(secondary).toHaveBeenCalledOnce();
  });

  it('確認を促す操作は確定ボタンから始め、同じ画面に2つ置いても見出しidが衝突しない', () => {
    const { container } = render(
      <>
        <ConfirmDialog open tone="primary" title="始めますか？" message="説明" confirmLabel="始める" onCancel={vi.fn()} onConfirm={vi.fn()} />
        <ConfirmDialog open={false} tone="primary" title="戻しますか？" message="説明" confirmLabel="戻す" onCancel={vi.fn()} onConfirm={vi.fn()} />
      </>,
    );
    expect(screen.getByRole('button', { name: '始める' })).toHaveFocus();
    const ids = [...container.querySelectorAll('dialog')].map((dialog) => dialog.getAttribute('aria-labelledby'));
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('レーダーは前回と今回、未開放種目を読み上げ可能にする', async () => {
    const data = {
      lv: { post: 8, eyeh: 7, hand: 6 },
      observations: {},
      observationNotes: {},
      engagement: {},
      envSupports: [],
      troubles: [],
      wants: [],
      copm: [],
      ppi: { time: 1, emo: 1, soc: 1, fut: 1, nav: 1 },
      ppiNote: '',
      memo: '',
    };
    const report = reportContentSchema.parse(await new RuleBasedReportGenerator().generate({
      child: { name: 'はると', honorific: 'kun', grade: '小学1年生', ageHint: '6〜7歳', ageGroup: 'sch' },
      coach: { displayName: 'さとうコーチ' },
      assessment: { seqNo: 2, assessedOn: '2026-09-01', unlockExt: false, data },
      previous: { seqNo: 1, assessedOn: '2026-06-01', unlockExt: false, data: { ...data, lv: { post: 5, eyeh: 6, hand: 6 } } },
      master: { version: MASTER_VERSION },
      generatedAt: '2026-09-01T00:00:00.000Z',
    }));
    render(<RadarChart report={report} extUnlocked={false} />);
    expect(screen.getByRole('img', { name: '5種目の到達レベル' })).toHaveTextContent('半年目以降');
    expect(screen.getByText('前回')).toBeInTheDocument();
    expect(screen.getByText('今回')).toBeInTheDocument();
  });
});
