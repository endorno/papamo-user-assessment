import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/client';
import { AuthErrorNotice } from './AuthErrorNotice';

function renderNotice() {
  return render(
    <AuthErrorNotice
      error={new ApiClientError('ログイン情報が無効です。', 401, 'unauthorized')}
      fullPage
      onRetry={() => undefined}
      onLoginAgain={() => undefined}
    />,
  );
}

describe('AuthErrorNotice', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

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

  it('開発環境ではローカル環境の確認手順を出す', () => {
    vi.stubEnv('DEV', true);
    renderNotice();

    expect(screen.getByRole('alert')).toHaveTextContent('ポート 15421');
  });

  it('ステージング・本番のコーチには開発環境の情報を出さない', () => {
    vi.stubEnv('DEV', false);
    renderNotice();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('ログインの有効期限が切れた可能性があります');
    expect(alert).not.toHaveTextContent('Supabase');
    expect(alert).not.toHaveTextContent('15421');
    expect(alert).not.toHaveTextContent('API と Web');
  });
});
