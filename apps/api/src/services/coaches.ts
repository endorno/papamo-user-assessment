import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

import { coaches } from '../db/schema';
import type { CoachRecord, Env } from '../env';

export async function upsertCoach(
  env: Env,
  input: { id: string; email: string },
): Promise<CoachRecord> {
  const now = new Date().toISOString();
  const db = drizzle(env.DB, { schema: { coaches } });

  await db
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

  const row = await db.select().from(coaches).where(eq(coaches.id, input.id)).get();
  if (!row) {
    throw new Error('コーチ情報の取得に失敗しました。');
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
  };
}

export async function updateCoachDisplayName(
  env: Env,
  coachId: string,
  displayName: string,
): Promise<CoachRecord> {
  const db = drizzle(env.DB, { schema: { coaches } });
  await db
    .update(coaches)
    .set({ displayName, updatedAt: new Date().toISOString() })
    .where(eq(coaches.id, coachId))
    .run();

  const row = await db.select().from(coaches).where(eq(coaches.id, coachId)).get();
  if (!row) {
    throw new Error('コーチ情報の取得に失敗しました。');
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
  };
}
