import type {
  D1Database,
  ExecutionContext,
  Fetcher,
} from '@cloudflare/workers-types';
import type { Context } from 'hono';
import type { JWTPayload } from 'jose';

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SUPABASE_URL: string;
  SUPABASE_JWT_ISSUER: string;
  SUPABASE_JWT_AUDIENCE: string;
  REPORT_GENERATOR: string;
}

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

export type WorkerExecutionContext = ExecutionContext;
