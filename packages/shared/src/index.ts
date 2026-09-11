import { z } from 'zod';

export const apiHealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('api'),
});

export type ApiHealthResponse = z.infer<typeof apiHealthResponseSchema>;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, '表示名を入力してください。')
  .max(30, '表示名は30文字以内で入力してください。');

export const updateMeRequestSchema = z.object({
  displayName: displayNameSchema,
});

export const meResponseSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: displayNameSchema.nullable(),
});

export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;

export * from './domain';
export * from './master';
export * from './report';
export * from './schema';
