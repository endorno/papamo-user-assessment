import { drizzle } from 'drizzle-orm/d1';

import { assessments, childCoaches, children, coaches, reports } from './schema';
import type { Env } from '../env';

const schema = { assessments, childCoaches, children, coaches, reports };

function createClient(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type Db = ReturnType<typeof createClient>;

// drizzle のラッパーはバインディングを包むだけで状態を持たない。
// リクエストごとに作り直す必要がないので、D1 バインディング単位で使い回す。
const clients = new WeakMap<D1Database, Db>();

export function dbFor(env: Env): Db {
  const cached = clients.get(env.DB);
  if (cached) return cached;
  const client = createClient(env.DB);
  clients.set(env.DB, client);
  return client;
}
