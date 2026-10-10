import { exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';

import type { Env } from '../env';
import {
  connectGoogleDrive,
  createGoogleDriveClient,
  GoogleDriveError,
  parseServiceAccountKey,
  type ServiceAccountCredentials,
} from './google-drive';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface Recorded {
  url: URL;
  method: string;
  headers: Headers;
  body: string;
}

/** 受け取ったリクエストを記録し、用意した応答を順に返す。トークンの取得には常に同じトークンを返す。 */
function fakeFetch(responses: Response[]) {
  const requests: Recorded[] = [];
  const tokenRequests: URLSearchParams[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body instanceof Blob ? await init.body.text() : String(init?.body ?? '');
    if (url.href === TOKEN_URL) {
      tokenRequests.push(new URLSearchParams(body));
      return Response.json({ access_token: 'access-token', expires_in: 3600 });
    }
    requests.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers), body });
    const response = responses.shift();
    if (!response) throw new Error(`想定外のリクエスト: ${url.href}`);
    return response;
  }) as typeof fetch;
  return { impl, requests, tokenRequests };
}

async function testCredentials() {
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  // トークンはサービスアカウントごとに使い回すため、テストごとに別のアカウントにする。
  const credentials: ServiceAccountCredentials = {
    clientEmail: `drive-${crypto.randomUUID()}@example.iam.gserviceaccount.com`,
    privateKey: await exportPKCS8(privateKey),
  };
  return { credentials, publicKey };
}

describe('Googleドライブの REST クライアント', () => {
  it('サービスアカウントの鍵で署名した JWT をトークンに引き換え、共有ドライブ向けにフォルダを作る', async () => {
    const { credentials, publicKey } = await testCredentials();
    const fake = fakeFetch([Response.json({ id: 'folder-1' }), Response.json({ id: 'folder-2' })]);
    const client = createGoogleDriveClient(credentials, fake.impl);

    await expect(client.createFolder('さとうコーチ', 'root')).resolves.toBe('folder-1');
    await expect(client.createFolder('はるとくん', 'folder-1')).resolves.toBe('folder-2');

    // トークンは期限まで使い回す。
    expect(fake.tokenRequests).toHaveLength(1);
    expect(fake.tokenRequests[0]?.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const { payload } = await jwtVerify(fake.tokenRequests[0]!.get('assertion')!, publicKey, {
      issuer: credentials.clientEmail,
      audience: TOKEN_URL,
    });
    expect(payload.scope).toBe('https://www.googleapis.com/auth/drive');

    const [request] = fake.requests;
    expect(request?.method).toBe('POST');
    expect(request?.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request?.url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(JSON.parse(request!.body)).toEqual({
      name: 'さとうコーチ',
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    });
  });

  it('PDF は multipart で送り、差し替えでは同じファイルの中身と名前を変える', async () => {
    const { credentials } = await testCredentials();
    const fake = fakeFetch([Response.json({ id: 'file-1' }), Response.json({ id: 'file-1' })]);
    const client = createGoogleDriveClient(credentials, fake.impl);
    const pdf = new Uint8Array(new TextEncoder().encode('%PDF-1.7 test'));

    await expect(client.createPdf('第1回.pdf', 'child-folder', pdf)).resolves.toBe('file-1');
    await expect(client.replacePdf('file-1', '第1回_更新.pdf', pdf)).resolves.toBe(true);

    const [created, replaced] = fake.requests;
    expect(created?.url.pathname).toBe('/upload/drive/v3/files');
    expect(created?.url.searchParams.get('uploadType')).toBe('multipart');
    expect(created?.headers.get('Content-Type')).toMatch(/^multipart\/related; boundary=/);
    expect(created?.body).toContain('{"name":"第1回.pdf","mimeType":"application/pdf","parents":["child-folder"]}');
    expect(created?.body).toContain('%PDF-1.7 test');
    expect(replaced?.method).toBe('PATCH');
    expect(replaced?.url.pathname).toBe('/upload/drive/v3/files/file-1');
    expect(replaced?.body).toContain('{"name":"第1回_更新.pdf","trashed":false}');
  });

  it('見つからないものは null / false で返し、移動・共有・ゴミ箱は所定の形で送る', async () => {
    const { credentials } = await testCredentials();
    const notFound = () => Response.json({ error: { errors: [{ reason: 'notFound' }] } }, { status: 404 });
    const fake = fakeFetch([
      notFound(),
      notFound(),
      Response.json({ id: 'folder', name: 'はるとくん', parents: ['coach'], trashed: true }),
      Response.json({}),
      Response.json({}),
      Response.json({}),
    ]);
    const client = createGoogleDriveClient(credentials, fake.impl);

    await expect(client.get('missing')).resolves.toBeNull();
    await expect(client.replacePdf('missing', 'a.pdf', new Uint8Array([1]))).resolves.toBe(false);
    await expect(client.get('folder')).resolves.toEqual({ id: 'folder', name: 'はるとくん', parents: ['coach'], trashed: true });
    await client.update('folder', { name: 'はるとくん_7K3Q', moveTo: 'new-coach', moveFrom: ['coach'] });
    await client.shareAsReader('coach-folder', 'coach@gmail.com');
    await client.trash('file');

    const [, , , moved, shared, trashed] = fake.requests;
    expect(moved?.url.searchParams.get('addParents')).toBe('new-coach');
    expect(moved?.url.searchParams.get('removeParents')).toBe('coach');
    expect(JSON.parse(moved!.body)).toEqual({ name: 'はるとくん_7K3Q' });
    expect(shared?.url.pathname).toBe('/drive/v3/files/coach-folder/permissions');
    expect(shared?.url.searchParams.get('sendNotificationEmail')).toBe('false');
    expect(JSON.parse(shared!.body)).toEqual({ type: 'user', role: 'reader', emailAddress: 'coach@gmail.com' });
    expect(JSON.parse(trashed!.body)).toEqual({ trashed: true });
  });

  it('一時的な障害は1回だけ送り直し、続けて失敗したら理由のコードだけを持つエラーにする', async () => {
    const { credentials } = await testCredentials();
    const unavailable = () => Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 });
    const forbidden = Response.json(
      { error: { message: 'はるとくん_7K3Q に書き込めません', errors: [{ reason: 'insufficientFilePermissions' }] } },
      { status: 403 },
    );
    const fake = fakeFetch([unavailable(), Response.json({ id: 'folder-1' }), forbidden]);
    const client = createGoogleDriveClient(credentials, fake.impl);

    await expect(client.createFolder('さとうコーチ', 'root')).resolves.toBe('folder-1');
    const failure = await client.createFolder('はるとくん', 'root').catch((caught: unknown) => caught);
    expect(failure).toBeInstanceOf(GoogleDriveError);
    expect(failure).toMatchObject({ status: 403, reason: 'insufficientFilePermissions' });
    // ログに出るメッセージに、Google 側のメッセージ（ファイル名を含みうる）を載せない。
    expect((failure as Error).message).not.toContain('はるとくん');
    expect(fake.requests).toHaveLength(3);
  });
});

describe('Googleドライブの設定', () => {
  it('鍵が無ければ保存しない。鍵の中身はエラーメッセージに出さない', () => {
    expect(parseServiceAccountKey(undefined)).toBeNull();
    expect(parseServiceAccountKey('  ')).toBeNull();
    expect(() => parseServiceAccountKey('{"private_key":"-----BEGIN PRIVATE KEY-----secret')).toThrow('サービスアカウントの鍵を JSON として読めません。');
    expect(() => parseServiceAccountKey('{"client_email":"a@example.com"}')).toThrow('client_email と private_key');
    expect(parseServiceAccountKey('{"client_email":"a@example.com","private_key":"key","project_id":"p"}'))
      .toEqual({ clientEmail: 'a@example.com', privateKey: 'key' });
  });

  it('保存先フォルダと鍵の両方がそろったときだけ接続する', () => {
    const key = JSON.stringify({ client_email: 'a@example.com', private_key: 'key' });
    const env = (overrides: Partial<Env>) => overrides as Env;
    expect(connectGoogleDrive(env({ DRIVE_ROOT_FOLDER_ID: '', GOOGLE_SERVICE_ACCOUNT_KEY: key }))).toBeNull();
    expect(connectGoogleDrive(env({ DRIVE_ROOT_FOLDER_ID: 'root' }))).toBeNull();
    expect(connectGoogleDrive(env({ DRIVE_ROOT_FOLDER_ID: 'root', GOOGLE_SERVICE_ACCOUNT_KEY: 'not-json' }))).toBeNull();
    expect(connectGoogleDrive(env({ DRIVE_ROOT_FOLDER_ID: ' root ', GOOGLE_SERVICE_ACCOUNT_KEY: key }))?.rootFolderId).toBe('root');
  });
});
