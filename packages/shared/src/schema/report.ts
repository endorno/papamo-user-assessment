import { z } from 'zod';

import {
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  TUNING_NOTES,
  type EngagementKey,
  type TuningKey,
} from '../master';
import {
  copmScoreSchema,
  exerciseKeySchema,
  honorificSchema,
  storedLevelSchema,
} from './assessment';

const pyramidSourceSchema = z.enum(['both', 'goal', 'issue']);

const reportLevelSchema = z.object({
  key: exerciseKeySchema,
  name: z.string(),
  parentName: z.string(),
  lv: storedLevelSchema,
  maxLv: z.number().int().positive(),
  prevLv: storedLevelSchema.optional(),
  delta: z.number().int().optional(),
  band: z.string(),
  ladderLabel: z.string(),
});

const copmReportSchema = z.object({
  id: z.string().optional(),
  continueNext: z.boolean().optional(),
  text: z.string(),
  memo: z.string(),
  areas: z.array(z.string()),
  performance: copmScoreSchema,
  satisfaction: copmScoreSchema,
  importance: copmScoreSchema,
  previous: z.object({
    performance: copmScoreSchema,
    satisfaction: copmScoreSchema,
    // ツール導入前（Excel）の採点を前回にした場合は重要度を持たない。
    importance: copmScoreSchema.optional(),
  }).optional(),
  performanceDelta: z.number().int().optional(),
  satisfactionDelta: z.number().int().optional(),
});

export const reportContentSchema = z.object({
  kind: z.enum(['first', 'comparison']),
  generator: z.string(),
  masterVersion: z.string(),
  generatedAt: z.string().datetime(),
  header: z.object({
    childName: z.string(),
    honorific: honorificSchema,
    grade: z.string(),
    ageHint: z.string(),
    joinedMonth: z.string().regex(/^\d{4}-\d{2}$/),
    seqNo: z.number().int().positive(),
    assessedOn: z.string(),
    prevAssessedOn: z.string().optional(),
    coachName: z.string(),
  }),
  levels: z.array(reportLevelSchema),
  abilities: z.array(z.object({
    key: exerciseKeySchema,
    can: z.string().nullable(),
    next: z.string().nullable(),
    blocks: z.array(z.string()),
  })),
  conditionNotes: z.array(z.object({
    key: exerciseKeySchema,
    name: z.string(),
    notes: z.array(z.string()),
  })),
  upcomingExercises: z.array(z.object({
    key: exerciseKeySchema,
    name: z.string(),
    parentName: z.string(),
    about: z.string(),
  })),
  engagement: z.array(z.object({
    key: z.enum(ENGAGEMENT_AXES.map((axis) => axis.key) as [EngagementKey, ...EngagementKey[]]),
    title: z.string(),
    subtitle: z.string(),
    level: z.number().int().min(0).max(ENGAGEMENT_LEVEL_COUNT - 1),
    levelCount: z.number().int().positive(),
    label: z.string(),
    prevLevel: z.number().int().min(0).max(ENGAGEMENT_LEVEL_COUNT - 1).optional(),
    delta: z.number().int().optional(),
  })),
  changes3m: z.array(z.string()).optional(),
  troubles: z.object({
    current: z.array(z.string()),
    byCategory: z.array(z.object({
      id: z.string(),
      icon: z.string(),
      title: z.string(),
      items: z.array(z.string()),
    })),
  }),
  troubleBackgrounds: z.array(z.object({
    id: z.number().int(),
    parentLabel: z.string(),
    block: z.string(),
    troubles: z.array(z.string()),
  })),
  risks: z.object({
    evidence: z.array(z.object({
      key: exerciseKeySchema,
      name: z.string(),
      lv: storedLevelSchema,
      maxLv: z.number().int().positive(),
      expectedLv: z.number().int().nonnegative(),
    })),
    stages: z.array(z.object({
      label: z.string(),
      theme: z.string(),
      demand: z.string(),
      gradesAhead: z.number().int().positive(),
      concerns: z.array(z.string()),
    })),
  }).nullable(),
  pyramid: z.object({
    rows: z.array(z.object({ tier: z.number().int(), items: z.array(z.string()) })),
    goalBlocks: z.array(z.string()),
    issueBlocks: z.array(z.string()),
  }),
  focusAreas: z.array(z.object({
    block: z.string(),
    tier: z.number().int(),
    source: pyramidSourceSchema,
    definition: z.string(),
    effect: z.string(),
    goals: z.array(z.string()),
  })),
  copm: z.array(copmReportSchema),
  nextDue: z.string(),
  nextReview: z.string(),
  tuning: z.array(z.object({
    key: z.enum(Object.keys(TUNING_NOTES) as [TuningKey, ...TuningKey[]]),
    label: z.string(),
    note: z.string(),
  })),
  coach: z.object({
    exerciseNotes: z.array(z.object({
      key: exerciseKeySchema,
      lv: storedLevelSchema,
      observations: z.array(z.string()),
      conditions: z.array(z.string()),
      note: z.string(),
    })),
    areaMenus: z.array(z.object({
      block: z.string(),
      tier: z.number().int(),
      source: pyramidSourceSchema,
      goals: z.array(z.string()),
      aim: z.string(),
      menus: z.array(z.object({
        name: z.string(),
        difficulty: z.string().optional(),
        form: z.string().optional(),
        equipment: z.string().optional(),
        parentBurden: z.string().optional(),
        category: z.string().optional(),
      })),
    })),
  }),
});

/**
 * Googleドライブに保存したレポートPDFの状態。保存先はオーナーのコーチフォルダの下の、お子さまのフォルダ。
 * URL は保存したことがあるものだけ入る。開いた人に閲覧権限があるかどうかは Drive 側で決まる。
 */
export const reportDriveSchema = z.object({
  folderUrl: z.string().url().nullable(),
  parentFileUrl: z.string().url().nullable(),
  coachFileUrl: z.string().url().nullable(),
  savedAt: z.string().datetime().nullable(),
  /** いまのレポート（generatedAt）を保存済みか。false ならレポート画面が開いたときに保存し直す。 */
  upToDate: z.boolean(),
});

export const reportResponseSchema = z.object({
  // レポート画面が子どもページへ戻れるよう、本文とは別に所属を返す。
  childId: z.string(),
  assessmentId: z.string(),
  report: reportContentSchema,
  /** レポート作成後に入力を編集し、まだ反映していないか。 */
  hasUnreportedChanges: z.boolean(),
  /** 次の回がある・アーカイブ中などで、この回の入力を直せないか。レポート画面から入力画面へ戻るボタンの文言に使う。 */
  readOnly: z.boolean(),
  /** Googleドライブへの保存を設定していない環境（ローカルなど）では null。 */
  drive: reportDriveSchema.nullable(),
});

// 画面に表示したレポートをそのままPDFにするため、DOMとCSSを1つにしたHTMLを受け取る。
export const REPORT_PDF_HTML_MAX_LENGTH = 3_000_000;

const reportHtmlSchema = z.string()
  .min(1, 'レポートの内容を読み取れませんでした。画面を再読み込みしてからもう一度お試しください。')
  .max(REPORT_PDF_HTML_MAX_LENGTH, 'レポートが大きすぎてPDFにできませんでした。');

export const reportPdfRequestSchema = z.object({
  html: reportHtmlSchema,
});

/**
 * 保護者向けとコーチ向けを同時にGoogleドライブへ保存する。generatedAt は画面に表示したレポートの版。
 * html はコーチ向け（コーチ用の紙面＋本体）。保護者向けは、サーバーが同じ紙面からコーチ用の紙面を除いたページを書き出す。
 */
export const reportDriveRequestSchema = z.object({
  generatedAt: z.string().datetime(),
  html: reportHtmlSchema,
});

/**
 * Googleドライブへの保存の段階。保存は十数秒かかるため、サーバーは段階に入るたびに知らせ、画面は進み具合として示す。
 * PDFの作成（ヘッドレス Chrome の起動を含む）も Drive への送信も途中経過を返さないため、段階より細かくは知らせない。
 * 紙面の読み込みと採寸は1回だけで、保護者向けの段階に含む（コーチ向けの段階は書き出しだけ）。
 */
export const REPORT_DRIVE_STEPS = ['renderParent', 'renderCoach', 'upload'] as const;

export const reportDriveStepSchema = z.enum(REPORT_DRIVE_STEPS);

/**
 * 保存APIが1行ずつ返す途中経過（NDJSON）。最後の行は done か error。
 * 返し始めた後のエラーは HTTP のステータスにできないため error の行で知らせる（返し始める前のエラーは通常の JSON）。
 */
export const reportDriveEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('step'), step: reportDriveStepSchema }),
  z.object({ type: z.literal('done'), drive: reportDriveSchema }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      code: z.enum(['forbidden', 'not_found', 'validation', 'conflict', 'internal']),
      message: z.string(),
    }),
  }),
]);

export type ReportDrive = z.infer<typeof reportDriveSchema>;
export type ReportDriveStep = z.infer<typeof reportDriveStepSchema>;
export type ReportDriveEvent = z.infer<typeof reportDriveEventSchema>;
