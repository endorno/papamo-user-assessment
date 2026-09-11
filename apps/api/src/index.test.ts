import { describe, expect, it } from 'vitest';

import { api } from './index';

describe('API の足場', () => {
  it('ヘルスチェックを返す', async () => {
    const response = await api.fetch(
      new Request('https://example.com/api/health'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('認証が必要な API はトークンなしで 401 を返す', async () => {
    const response = await api.fetch(
      new Request('https://example.com/api/unknown'),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'unauthorized',
        message: 'ログインが必要です。',
      },
    });
  });
});
