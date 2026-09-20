import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

import { apiRequest, ApiClientError, setUnauthorizedHandler } from './client';

describe('apiRequest', () => {
  afterEach(() => {
    setUnauthorizedHandler(null);
    vi.unstubAllGlobals();
  });

  it('401のときにエラー情報をハンドラーへ渡してから例外にする', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: { code: 'unauthorized', message: 'ログイン情報が無効です。' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    await expect(
      apiRequest('/me', { access_token: 'test-token' } as Session),
    ).rejects.toMatchObject({ status: 401, code: 'unauthorized' });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toBeInstanceOf(ApiClientError);
  });
});
