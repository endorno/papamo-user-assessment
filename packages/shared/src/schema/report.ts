import { z } from 'zod';

import { exerciseKeySchema, planKeySchema } from './assessment';

const ppiSchema = z.object({
  time: z.number().int().min(0).max(5),
  emo: z.number().int().min(0).max(5),
  soc: z.number().int().min(0).max(5),
  fut: z.number().int().min(0).max(5),
  nav: z.number().int().min(0).max(5),
});

const reportLevelSchema = z.object({
  key: exerciseKeySchema,
  lv: z.number().int().min(0).max(20),
  prevLv: z.number().int().min(0).max(20).optional(),
  delta: z.number().int().optional(),
  band: z.string(),
  ladderLabel: z.string(),
});

export const reportContentSchema = z.object({
  kind: z.enum(['first', 'comparison']),
  generator: z.string(),
  masterVersion: z.string(),
  generatedAt: z.string().datetime(),
  header: z.object({
    childName: z.string(),
    honorific: z.enum(['kun', 'chan', 'san']),
    grade: z.string(),
    ageHint: z.string(),
    joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    seqNo: z.number().int().positive(),
    assessedOn: z.string(),
    prevAssessedOn: z.string().optional(),
    coachName: z.string(),
  }),
  levels: z.array(reportLevelSchema),
  upcomingExercises: z.array(z.object({ key: exerciseKeySchema, name: z.string(), parentName: z.string(), teaser: z.string() })),
  priorities: z.array(z.object({ key: exerciseKeySchema, parentName: z.string(), lv: z.number().int(), grow: z.string(), build: z.array(z.string()) })),
  strengths: z.array(z.object({ key: exerciseKeySchema, parentName: z.string(), lv: z.number().int() })),
  changes3m: z.array(z.string()).optional(),
  troubles: z.object({ current: z.array(z.string()), gone: z.array(z.string()).optional(), stayed: z.array(z.string()).optional(), added: z.array(z.string()).optional() }),
  link: z.object({ lowestKey: exerciseKeySchema, text: z.string() }),
  ppi: z.object({ current: ppiSchema, previous: ppiSchema.optional(), note: z.string() }),
  plan: z.object({ key: planKeySchema, name: z.string(), window: z.string(), items: z.array(z.string()) }).nullable(),
  outlook: z.array(z.string()),
  nextDue: z.string(),
  coach: z.object({
    strategies: z.array(z.object({ key: exerciseKeySchema, lv: z.number().int(), band: z.string(), nextLv: z.number().int(), nextLabel: z.string(), errs: z.array(z.string()) })),
    memo: z.string(),
  }),
});

export const reportResponseSchema = z.object({
  // レポート画面が子どもページへ戻れるよう、本文とは別に所属を返す。
  childId: z.string(),
  assessmentId: z.string(),
  report: reportContentSchema,
});

export type ReportResponse = z.infer<typeof reportResponseSchema>;
