import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuardedLink, useUnsavedChanges, type UnsavedChangesGuard } from './UnsavedChangesContext';
import { renderWithProviders } from '../test-utils';

function GuardedScreen({ guard }: { guard: UnsavedChangesGuard }) {
  const { registerGuard } = useUnsavedChanges();
  useEffect(() => registerGuard(guard), [guard, registerGuard]);
  return <GuardedLink to="/next">一覧へ</GuardedLink>;
}

afterEach(cleanup);

describe('未保存の確認', () => {
  it('保存が失敗したら、操作できる状態に戻して理由を伝える', async () => {
    const save = vi.fn().mockResolvedValue(false);
    renderWithProviders(<GuardedScreen guard={{ isDirty: () => true, save }} />);

    fireEvent.click(screen.getByRole('link', { name: '一覧へ' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '保存して移動' }));

    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('保存できませんでした'));
    // ダイアログは開いたまま、もう一度試せる状態に戻す。
    expect(within(dialog).getByRole('button', { name: '保存して移動' })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: '保存せずに移動' })).toBeEnabled();
  });

  it('保存が例外で終わっても「保存中…」のまま固まらない', async () => {
    const save = vi.fn().mockRejectedValue(new Error('通信に失敗しました。'));
    renderWithProviders(<GuardedScreen guard={{ isDirty: () => true, save }} />);

    fireEvent.click(screen.getByRole('link', { name: '一覧へ' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '保存して移動' }));

    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('保存できませんでした'));
    expect(within(dialog).getByRole('button', { name: '保存して移動' })).toBeEnabled();
  });

  it('未保存がなければ確認を挟まずに移動する', () => {
    const save = vi.fn().mockResolvedValue(true);
    renderWithProviders(<GuardedScreen guard={{ isDirty: () => false, save }} />);

    fireEvent.click(screen.getByRole('link', { name: '一覧へ' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('「保存せずに移動」では保存を呼ばず、画面側に破棄を伝える', async () => {
    const save = vi.fn().mockResolvedValue(true);
    const discard = vi.fn();
    renderWithProviders(<GuardedScreen guard={{ isDirty: () => true, save, discard }} />);

    fireEvent.click(screen.getByRole('link', { name: '一覧へ' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '保存せずに移動' }));

    expect(discard).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
});
