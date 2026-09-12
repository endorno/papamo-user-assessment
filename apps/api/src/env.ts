import type { Context } from 'hono';
import type { JWTPayload } from 'jose';

export type Env = WorkerBindings;

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
