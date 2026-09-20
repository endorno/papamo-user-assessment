import type { Context } from 'hono';
import type { JWTPayload } from 'jose';

export type Env = Omit<
  WorkerBindings,
  'APP_ENV' | 'NON_PRODUCTION_TOOLS_ENABLED' | 'STAGING_ALLOWED_EMAILS'
> & {
  APP_ENV: 'local' | 'staging' | 'production';
  NON_PRODUCTION_TOOLS_ENABLED: 'true' | 'false';
  STAGING_ALLOWED_EMAILS: string;
};

export interface CoachRecord {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AppVariables {
  coach: CoachRecord;
  token: JWTPayload;
}

export type AppContext = Context<{
  Bindings: Env;
  Variables: AppVariables;
}>;
