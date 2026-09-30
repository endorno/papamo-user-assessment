import type { Context } from 'hono';
import type { JWTPayload } from 'jose';

import type { ReportPdfRenderer } from './services/report-pdf';

export type Env = Omit<
  WorkerBindings,
  'APP_ENV' | 'NON_PRODUCTION_TOOLS_ENABLED'
> & {
  APP_ENV: 'local' | 'staging' | 'production';
  NON_PRODUCTION_TOOLS_ENABLED: 'true' | 'false';
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
}

export type AppContext = Context<{
  Bindings: Env;
  Variables: AppVariables;
}>;
