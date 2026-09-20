import { z } from 'zod';

export const sampleDataProfileSchema = z.enum(['long', 'short', 'new']);

export const sampleDataStatusResponseSchema = z.object({
  enabled: z.literal(true),
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

export type SampleDataProfile = z.infer<typeof sampleDataProfileSchema>;
export type SampleDataStatusResponse = z.infer<typeof sampleDataStatusResponseSchema>;
export type SampleChildCreateRequest = z.infer<typeof sampleChildCreateRequestSchema>;
export type SampleChildCreateResponse = z.infer<typeof sampleChildCreateResponseSchema>;
