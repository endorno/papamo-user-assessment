import { z } from 'zod';

export const apiHealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

/** コーチ名に必ず付ける呼び名。全コーチ共通なので、表示名には名前の部分だけを持つ。 */
export const COACH_TITLE = 'コーチ';
export const DISPLAY_NAME_MAX_LENGTH = 30;

export const displayNameSchema = z
  .string()
  .trim()
  // 名前の後ろに「コーチ」まで入力されても「さとうコーチコーチ」にならないよう落とす
  .transform((value) => (value.endsWith(COACH_TITLE) ? value.slice(0, -COACH_TITLE.length).trim() : value))
  .pipe(
    z
      .string()
      .min(1, '表示名を入力してください。')
      .max(DISPLAY_NAME_MAX_LENGTH, `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください。`),
  );

/** 画面とレポートに出すコーチ名（「さとう」→「さとうコーチ」）。 */
export function formatCoachName(displayName: string) {
  return `${displayName}${COACH_TITLE}`;
}

export const updateMeRequestSchema = z.object({
  displayName: displayNameSchema,
});

export const meResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: displayNameSchema.nullable(),
  /** Googleドライブの自分のフォルダ。オーナーのお子さまのレポートを初めて保存するまでは null。 */
  driveFolderUrl: z.string().url().nullable(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

export * from './domain';
export * from './master';
export * from './report';
export * from './schema';
