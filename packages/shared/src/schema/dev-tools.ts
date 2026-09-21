import { z } from 'zod';

export const sampleDataProfileSchema = z.enum(['long', 'short', 'new']);

/** 開発用APIは local / staging でしか有効にならない。 */
export const nonProductionEnvSchema = z.enum(['local', 'staging']);

export const sampleDataStatusResponseSchema = z.object({
  enabled: z.literal(true),
  environment: nonProductionEnvSchema,
  ready: z.boolean(),
  backgroundCoachCount: z.number().int().nonnegative(),
  presets: z.array(z.union([z.literal(1), z.literal(10), z.literal(30)])),
});

export const sampleChildCreateRequestSchema = z.object({
  profile: sampleDataProfileSchema,
});

export const sampleChildCreateResponseSchema = z.object({
  childId: z.string(),
  profile: sampleDataProfileSchema,
});

export const childrenClearResponseSchema = z.object({
  /** オーナーだったので記録ごと消した子どもの数。 */
  deleted: z.number().int().nonnegative(),
  /** ほかのコーチがオーナーなので担当リンクだけ外した子どもの数。 */
  unlinked: z.number().int().nonnegative(),
});

export type SampleDataProfile = z.infer<typeof sampleDataProfileSchema>;
export type SampleDataStatusResponse = z.infer<typeof sampleDataStatusResponseSchema>;
export type ChildrenClearResponse = z.infer<typeof childrenClearResponseSchema>;
