import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const coaches = sqliteTable('coaches', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type CoachRow = typeof coaches.$inferSelect;

export const children = sqliteTable('children', {
  id: text('id').primaryKey(),
  shareCode: text('share_code').notNull().unique(),
  ownerShareCode: text('owner_share_code').notNull().unique(),
  createdBy: text('created_by').notNull(),
  name: text('name').notNull(),
  honorific: text('honorific').notNull(),
  gradeCode: text('grade_code').notNull(),
  gradeBaseYear: integer('grade_base_year').notNull(),
  joinedOn: text('joined_on').notNull(),
  extUnlocked: integer('ext_unlocked', { mode: 'boolean' }).notNull().default(false),
  goals: text('goals').notNull(),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const childCoaches = sqliteTable(
  'child_coaches',
  {
    childId: text('child_id').notNull(),
    coachId: text('coach_id').notNull(),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.childId, table.coachId] }),
  }),
);

export const assessments = sqliteTable('assessments', {
  id: text('id').primaryKey(),
  childId: text('child_id').notNull(),
  seqNo: integer('seq_no').notNull(),
  status: text('status').notNull(),
  assessedOn: text('assessed_on').notNull(),
  coachId: text('coach_id').notNull(),
  unlockExt: integer('unlock_ext', { mode: 'boolean' }).notNull().default(false),
  prevAssessmentId: text('prev_assessment_id'),
  masterVersion: text('master_version').notNull(),
  data: text('data').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  assessmentId: text('assessment_id').notNull().unique(),
  generator: text('generator').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
