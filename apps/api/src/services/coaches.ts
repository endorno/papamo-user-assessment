import { eq } from 'drizzle-orm';

import { dbFor } from '../db/client';
import { coaches } from '../db/schema';
import type { CoachRecord, Env } from '../env';

/** 保存後のコーチ情報を読み直して返す。行が消えているのは想定外なので例外にする。 */
async function coachRecord(env: Env, coachId: string): Promise<CoachRecord> {
  const row = await dbFor(env).select().from(coaches).where(eq(coaches.id, coachId)).get();
  if (!row) {
    throw new Error('コーチ情報の取得に失敗しました。');
  }
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function upsertCoach(
  env: Env,
  input: { id: string; email: string },
): Promise<CoachRecord> {
  const now = new Date().toISOString();

  await dbFor(env)
    .insert(coaches)
    .values({
      id: input.id,
      email: input.email,
      displayName: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: coaches.id,
      set: {
        email: input.email,
        updatedAt: now,
      },
    })
    .run();

  return coachRecord(env, input.id);
}

export async function updateCoachDisplayName(
  env: Env,
  coachId: string,
  displayName: string,
): Promise<CoachRecord> {
  await dbFor(env)
    .update(coaches)
    .set({ displayName, updatedAt: new Date().toISOString() })
    .where(eq(coaches.id, coachId))
    .run();

  return coachRecord(env, coachId);
}
