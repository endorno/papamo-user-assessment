import type { Env } from '../env';

const ENABLED_ENVIRONMENTS = new Set(['local', 'staging']);

export function nonProductionToolsEnabled(env: Env): boolean {
  return env.NON_PRODUCTION_TOOLS_ENABLED === 'true' && ENABLED_ENVIRONMENTS.has(env.APP_ENV);
}
