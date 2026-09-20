import type { Env } from '../env';

const ENABLED_ENVIRONMENTS = new Set(['local', 'staging']);

export function nonProductionToolsEnabled(env: Env): boolean {
  return env.NON_PRODUCTION_TOOLS_ENABLED === 'true' && ENABLED_ENVIRONMENTS.has(env.APP_ENV);
}

export function stagingEmailAllowed(env: Env, email: string): boolean {
  if (env.APP_ENV !== 'staging') return true;

  const allowedEmails = new Set(
    env.STAGING_ALLOWED_EMAILS
      .split(',')
      .map((allowedEmail) => allowedEmail.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowedEmails.has(email.trim().toLowerCase());
}
