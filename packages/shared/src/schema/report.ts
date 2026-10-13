import { z } from 'zod';

import {
  COACH_CAUTIONS,
  ENGAGEMENT_AXES,
  ENGAGEMENT_LEVEL_COUNT,
  TUNING_NOTES,
  type CoachCautionKey,
  type EngagementKey,
  type TuningKey,
} from '../master';
import {
  copmScoreSchema,
  exerciseKeySchema,
  honorificSchema,
  ppiScoreSchema,
  storedLevelSchema,
} from './assessment';

// PPI は5問そろって初めてレポートになるため、レポート側では必須で受ける。
const ppiSchema = z.object({
  time: ppiScoreSchema,
  emo: ppiScoreSchema,
  soc: ppiScoreSchema,
  fut: ppiScoreSchema,
  nav: ppiScoreSchema,
});

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
  text: z.string(),
  memo: z.string(),
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
  priorities: z.array(z.object({
    key: exerciseKeySchema,
    parentName: z.string(),
    lv: storedLevelSchema,
    maxLv: z.number().int().positive(),
    grow: z.string(),
    build: z.array(z.string()),
  })),
  strengths: z.array(z.object({
    key: exerciseKeySchema,
    parentName: z.string(),
    lv: storedLevelSchema,
    maxLv: z.number().int().positive(),
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
    gone: z.array(z.string()).optional(),
    stayed: z.array(z.string()).optional(),
    added: z.array(z.string()).optional(),
  }),
  domainHits: z.array(z.object({
    id: z.number().int(),
    title: z.string(),
    parentLabel: z.string(),
    parentText: z.string(),
    pyramid: z.string(),
    troubles: z.array(z.string()),
    verdict: z.enum(['強く一致', '一致', '未測定', '不一致']),
    priorityKey: exerciseKeySchema,
    priorityName: z.string(),
    priorityParentName: z.string(),
    priorityLv: storedLevelSchema,
    priorityMaxLv: z.number().int().positive(),
    priorityMeasured: z.boolean(),
  })),
  rootDomain: z.object({
    id: z.number().int(),
    title: z.string(),
    parentLabel: z.string(),
    parentText: z.string(),
  }).nullable(),
  proprioceptionNote: z.boolean(),
  risks: z.array(z.string()),
  pyramid: z.object({
    rows: z.array(z.object({ tier: z.number().int(), items: z.array(z.string()) })),
    highlighted: z.array(z.string()),
    root: z.string(),
    rootTierLabel: z.string(),
    related: z.array(z.string()),
    sourceKey: exerciseKeySchema,
  }),
  link: z.object({ lowestKey: exerciseKeySchema, text: z.string() }),
  ppi: z.object({ current: ppiSchema, previous: ppiSchema.optional(), note: z.string() }),
  roadmap: z.object({
    month3Build: z.array(z.string()),
    month3Changes: z.array(z.string()),
    month6Links: z.array(z.string()),
    month6Changes: z.array(z.string()),
  }),
  wants: z.array(z.object({
    id: z.string(),
    group: z.string(),
    icon: z.string(),
    text: z.string(),
    short: z.string(),
    menu: z.string(),
  })),
  copm: z.array(copmReportSchema),
  growthSigns: z.array(z.string()),
  watchPoints: z.array(z.string()),
  nextDue: z.string(),
  nextReview: z.string(),
  tuning: z.array(z.object({
    key: z.enum(Object.keys(TUNING_NOTES) as [TuningKey, ...TuningKey[]]),
    label: z.string(),
    note: z.string(),
  })),
  coach: z.object({
    strategies: z.array(z.object({
      key: exerciseKeySchema,
      lv: storedLevelSchema,
      band: z.string(),
      nextLv: z.number().int(),
      nextLabel: z.string(),
      observations: z.array(z.string()),
      note: z.string(),
    })),
    memo: z.string(),
    plan: z.object({
      focus: z.array(z.object({
        key: exerciseKeySchema,
        role: z.enum(['main', 'next', 'keep']),
        lv: storedLevelSchema,
        maxLv: z.number().int().positive(),
        month3: z.array(z.string()),
        month6: z.array(z.string()),
      })),
      domainMenus: z.array(z.object({
        id: z.number().int(),
        title: z.string(),
        region: z.string(),
        menus: z.array(z.string()),
      })),
    }),
    exerciseNotes: z.array(z.object({
      key: exerciseKeySchema,
      lv: storedLevelSchema,
      observations: z.array(z.string()),
      conditions: z.array(z.string()),
      note: z.string(),
    })),
    cautions: z.array(z.object({
      key: z.enum(Object.keys(COACH_CAUTIONS) as [CoachCautionKey, ...CoachCautionKey[]]),
      title: z.string(),
      text: z.string(),
      exercises: z.array(exerciseKeySchema),
    })),
    wantPackages: z.array(z.object({
      id: z.string(),
      icon: z.string(),
      short: z.string(),
      menu: z.string(),
      axisKey: exerciseKeySchema,
      axisLv: storedLevelSchema,
      axisMaxLv: z.number().int().positive(),
      status: z.enum(['ready', 'foundationFirst', 'unmeasured']),
    })),
    copmFocus: z.object({
      mostImportant: z.object({ text: z.string(), importance: copmScoreSchema }).nullable(),
      lowSatisfaction: z.array(z.string()),
    }),
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

/** 保護者向けとコーチ向けを同時にGoogleドライブへ保存する。generatedAt は画面に表示したレポートの版。 */
export const reportDriveRequestSchema = z.object({
  generatedAt: z.string().datetime(),
  parentHtml: reportHtmlSchema,
  coachHtml: reportHtmlSchema,
});

export const reportDriveResponseSchema = z.object({
  drive: reportDriveSchema,
});

export type ReportDrive = z.infer<typeof reportDriveSchema>;
