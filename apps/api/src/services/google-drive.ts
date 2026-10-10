import { importPKCS8, SignJWT } from 'jose';

import type { Env } from '../env';

/*
 * Googleドライブ（共有ドライブ）へのアクセス。googleapis の SDK は Node 前提で重いため、REST API を fetch で呼ぶ。
 * 認証はサービスアカウントの鍵で署名した JWT をアクセストークンに引き換える（OAuth 2.0 の JWT bearer）。
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
// サービスアカウントが触れるのは共有されたフォルダだけなので、drive スコープでも範囲はそこに限られる。
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const PDF_MIME_TYPE = 'application/pdf';
const TOKEN_LIFETIME_SECONDS = 3600;
// 期限ぎりぎりのトークンで送らないよう、少し早めに取り直す。
const TOKEN_REFRESH_MARGIN_MS = 60_000;
// Drive が応答しないときに Worker を待たせ続けない。PDF のアップロードでも通常は数秒で終わる。
const REQUEST_TIMEOUT_MS = 20_000;
// 混雑（429）や一時的な障害（5xx）は少し待てば通ることが多いため、1回だけ送り直す。
const RETRY_DELAY_MS = 800;
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface DriveItem {
  id: string;
  name: string;
  parents: string[];
  /** ゴミ箱にあるか。親フォルダごとゴミ箱へ移された場合も true になる。 */
  trashed: boolean;
}

export interface DriveClient {
  /** 見つからない（消された・権限がない）ときは null。 */
  get(id: string): Promise<DriveItem | null>;
  createFolder(name: string, parentId: string): Promise<string>;
  /** 名前の変更と、別のフォルダへの移動。 */
  update(id: string, changes: { name?: string; moveTo?: string; moveFrom?: string[] }): Promise<void>;
  /** 閲覧者として共有する。通知メールは送らない（サイトのリンクから開くため）。 */
  shareAsReader(id: string, email: string): Promise<void>;
  createPdf(name: string, parentId: string, pdf: Uint8Array<ArrayBuffer>): Promise<string>;
  /** 同じファイルの中身と名前を差し替える（リンクは変わらない）。見つからないときは false。 */
  replacePdf(id: string, name: string, pdf: Uint8Array<ArrayBuffer>): Promise<boolean>;
  trash(id: string): Promise<void>;
}

export interface DriveConnection {
  client: DriveClient;
  /** 保存先の親フォルダ（共有ドライブ内）。この下にコーチごとのフォルダを作る。 */
  rootFolderId: string;
}

/** 設定がそろっていない環境（ローカルなど）では null を返し、Drive への保存を行わない。 */
export type DriveConnector = (env: Env) => DriveConnection | null;

export class GoogleDriveError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    // ログに残すため、ファイル名などを含みうる Google 側のメッセージは載せず、理由のコードだけにする。
    super(`Google Drive API の ${operation} が失敗しました（${status}${reason ? ` ${reason}` : ''}）`);
    this.name = 'GoogleDriveError';
  }
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

/** サービスアカウントの鍵（Google Cloud からダウンロードした JSON）を読む。 */
export function parseServiceAccountKey(value: string | undefined): ServiceAccountCredentials | null {
  if (!value?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // JSON の解析エラーは入力の一部（鍵の文字列）をメッセージに含むため、元のエラーは使わない。
    throw new Error('サービスアカウントの鍵を JSON として読めません。');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new Error('サービスアカウントの鍵が JSON のオブジェクトではありません。');
  const { client_email: clientEmail, private_key: privateKey } = parsed as Record<string, unknown>;
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string' || !clientEmail || !privateKey) {
    throw new Error('サービスアカウントの鍵に client_email と private_key がありません。');
  }
  return { clientEmail, privateKey };
}

export function driveFolderUrl(id: string) {
  return `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
}

export function driveFileUrl(id: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}

type Fetch = typeof fetch;

// アクセストークンは1時間有効。リクエストごとに取り直さないよう、Worker のインスタンス内で使い回す。
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function errorReason(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string | { status?: string; errors?: { reason?: string }[] } }
    | null;
  if (typeof body?.error === 'string') return body.error;
  return body?.error?.errors?.[0]?.reason ?? body?.error?.status;
}

async function fetchAccessToken(credentials: ServiceAccountCredentials, fetchImpl: Fetch) {
  const key = await importPKCS8(credentials.privateKey, 'RS256');
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: DRIVE_SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(credentials.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + TOKEN_LIFETIME_SECONDS)
    .sign(key);
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new GoogleDriveError('token', response.status, await errorReason(response));
  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new GoogleDriveError('token', response.status, 'missing_access_token');
  return {
    token: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000 - TOKEN_REFRESH_MARGIN_MS,
  };
}

function multipartBody(metadata: Record<string, unknown>, pdf: Uint8Array<ArrayBuffer>) {
  const boundary = `papamo-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${PDF_MIME_TYPE}\r\n\r\n`,
    pdf,
    `\r\n--${boundary}--`,
  ]);
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

function query(params: Record<string, string>) {
  // 共有ドライブ内のファイルを扱うには supportsAllDrives が必要。
  return new URLSearchParams({ supportsAllDrives: 'true', ...params }).toString();
}

export function createGoogleDriveClient(credentials: ServiceAccountCredentials, fetchImpl: Fetch = fetch): DriveClient {
  async function accessToken() {
    const cached = tokenCache.get(credentials.clientEmail);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const fresh = await fetchAccessToken(credentials, fetchImpl);
    tokenCache.set(credentials.clientEmail, fresh);
    return fresh.token;
  }

  /** 認証をつけて送る。404 を呼び出し側で扱えるよう、allowNotFound のときは null を返す。 */
  async function send(operation: string, url: string, init: RequestInit, allowNotFound = false): Promise<Response | null> {
    for (let attempt = 0; ; attempt += 1) {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${await accessToken()}`);
      const response = await fetchImpl(url, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.ok) return response;
      if (allowNotFound && response.status === 404) return null;
      if (response.status === 401) tokenCache.delete(credentials.clientEmail);
      const retryable = RETRYABLE_STATUSES.has(response.status) || response.status === 401;
      if (attempt === 0 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        continue;
      }
      throw new GoogleDriveError(operation, response.status, await errorReason(response));
    }
  }

  async function idOf(response: Response | null) {
    const body = (await response?.json()) as { id?: string } | undefined;
    if (!body?.id) throw new GoogleDriveError('create', response?.status ?? 0, 'missing_id');
    return body.id;
  }

  return {
    async get(id) {
      const response = await send('get', `${DRIVE_API}/files/${encodeURIComponent(id)}?${query({ fields: 'id,name,parents,trashed' })}`, {}, true);
      if (!response) return null;
      const body = (await response.json()) as { id: string; name: string; parents?: string[]; trashed?: boolean };
      return { id: body.id, name: body.name, parents: body.parents ?? [], trashed: Boolean(body.trashed) };
    },

    async createFolder(name, parentId) {
      const response = await send('create_folder', `${DRIVE_API}/files?${query({ fields: 'id' })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] }),
      });
      return idOf(response);
    },

    async update(id, changes) {
      const params: Record<string, string> = {};
      if (changes.moveTo) {
        params.addParents = changes.moveTo;
        if (changes.moveFrom?.length) params.removeParents = changes.moveFrom.join(',');
      }
      await send('update', `${DRIVE_API}/files/${encodeURIComponent(id)}?${query(params)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes.name === undefined ? {} : { name: changes.name }),
      });
    },

    async shareAsReader(id, email) {
      await send('share', `${DRIVE_API}/files/${encodeURIComponent(id)}/permissions?${query({ sendNotificationEmail: 'false' })}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user', role: 'reader', emailAddress: email }),
      });
    },

    async createPdf(name, parentId, pdf) {
      const { body, contentType } = multipartBody({ name, mimeType: PDF_MIME_TYPE, parents: [parentId] }, pdf);
      const response = await send('create_pdf', `${DRIVE_UPLOAD_API}/files?${query({ uploadType: 'multipart', fields: 'id' })}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      });
      return idOf(response);
    },

    async replacePdf(id, name, pdf) {
      // ゴミ箱に移されていた場合も、レポートの保存先として戻す。
      const { body, contentType } = multipartBody({ name, trashed: false }, pdf);
      const response = await send('replace_pdf', `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(id)}?${query({ uploadType: 'multipart', fields: 'id' })}`, {
        method: 'PATCH',
        headers: { 'Content-Type': contentType },
        body,
      }, true);
      return response !== null;
    },

    async trash(id) {
      await send('trash', `${DRIVE_API}/files/${encodeURIComponent(id)}?${query({})}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
    },
  };
}

/** 保存先フォルダとサービスアカウントの鍵がそろっているときだけ Drive へ保存する。 */
export const connectGoogleDrive: DriveConnector = (env) => {
  const rootFolderId = env.DRIVE_ROOT_FOLDER_ID?.trim();
  if (!rootFolderId) return null;
  let credentials: ServiceAccountCredentials | null;
  try {
    credentials = parseServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY);
  } catch (caught) {
    // 鍵の中身はログに出さない。設定の誤りに気づけるよう、読めなかったことだけを残す。
    console.error(JSON.stringify({
      event: 'google_drive_misconfigured',
      error: caught instanceof Error ? caught.message : 'unknown',
    }));
    return null;
  }
  if (!credentials) return null;
  return { client: createGoogleDriveClient(credentials), rootFolderId };
};
