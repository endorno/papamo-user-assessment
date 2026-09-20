import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/client';
import { AuthErrorNotice } from './AuthErrorNotice';

describe('AuthErrorNotice', () => {
  it('401の原因と再試行・再ログインの操作を表示する', () => {
    const onRetry = vi.fn();
    const onLoginAgain = vi.fn();

    render(
      <AuthErrorNotice
        error={new ApiClientError('ログイン情報が無効です。', 401, 'unauthorized')}
        fullPage
        onRetry={onRetry}
        onLoginAgain={onLoginAgain}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('認証エラー（401）');
    expect(screen.getByRole('heading', { name: 'ログイン状態を確認できませんでした' })).toBeInTheDocument();
    expect(screen.getByText('API 応答: HTTP 401')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'もう一度確認する' }));
    fireEvent.click(screen.getByRole('button', { name: 'ログイン画面からやり直す' }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onLoginAgain).toHaveBeenCalledOnce();
  });
});
