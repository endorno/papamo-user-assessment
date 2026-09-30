import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';

import { apiRequest, apiRequestBlob, ApiClientError, setUnauthorizedHandler } from './client';

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

  it('ファイルを受け取るときも本文をそのまま返し、失敗はJSONのエラーから例外にする', async () => {
    const session = { access_token: 'test-token' } as Session;
    const fetchMock = vi.fn(async () => new Response('%PDF-1.7', { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
    vi.stubGlobal('fetch', fetchMock);

    const blob = await apiRequestBlob('/assessments/a1/report/pdf', session, { method: 'POST', body: '{}' });
    expect(blob.size).toBe('%PDF-1.7'.length);
    const headers = new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
    expect(headers.get('Content-Type')).toBe('application/json');

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'forbidden', message: 'このレポートを閲覧する権限がありません。' } }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )));
    await expect(apiRequestBlob('/assessments/a1/report/pdf', session, { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'このレポートを閲覧する権限がありません。' });
  });
});
