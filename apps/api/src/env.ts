import type { Context } from 'hono';
import type { JWTPayload } from 'jose';

import type { DriveConnector } from './services/google-drive';
import type { ReportPdfRenderer } from './services/report-pdf';

export type Env = Omit<
  WorkerBindings,
  'APP_ENV' | 'NON_PRODUCTION_TOOLS_ENABLED' | 'GOOGLE_SERVICE_ACCOUNT_KEY'
> & {
  APP_ENV: 'local' | 'staging' | 'production';
  NON_PRODUCTION_TOOLS_ENABLED: 'true' | 'false';
  /**
   * Googleドライブへ保存するサービスアカウントの鍵（JSON）。`wrangler secret put` で入れる Secret のため、
   * wrangler types は .dev.vars にあるときしか型を出さない。設定していない環境があるので optional で宣言する。
   */
  GOOGLE_SERVICE_ACCOUNT_KEY?: string;
};

export interface CoachRecord {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AppVariables {
  coach: CoachRecord;
  token: JWTPayload;
  renderPdf: ReportPdfRenderer;
  drive: DriveConnector;
}

export type AppContext = Context<{
  Bindings: Env;
  Variables: AppVariables;
}>;
