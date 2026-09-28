import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

export const coaches = sqliteTable('coaches', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});


export const children = sqliteTable(
  'children',
  {
    id: text('id').primaryKey(),
    shareCode: text('share_code').notNull().unique(),
    ownerShareCode: text('owner_share_code').notNull().unique(),
    createdBy: text('created_by').notNull().references(() => coaches.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    honorific: text('honorific').notNull(),
    gender: text('gender').notNull().default('unspecified'),
    gradeCode: text('grade_code').notNull(),
    gradeBaseYear: integer('grade_base_year').notNull(),
    joinedMonth: text('joined_month').notNull(),
    extUnlocked: integer('ext_unlocked', { mode: 'boolean' }).notNull().default(false),
    archivedAt: text('archived_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('children_share_code_format', sql`length(${table.shareCode}) = 8 AND ${table.shareCode} NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'`),
    check('children_owner_share_code_format', sql`length(${table.ownerShareCode}) = 8 AND ${table.ownerShareCode} NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'`),
    check('children_honorific', sql`${table.honorific} IN ('kun', 'chan', 'san')`),
    check('children_gender', sql`${table.gender} IN ('boy', 'girl', 'unspecified')`),
    check('children_grade_code', sql`${table.gradeCode} IN ('k0', 'k1', 'k2', 'k3', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3')`),
    check('children_joined_month_format', sql`${table.joinedMonth} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr(${table.joinedMonth}, 6, 2) BETWEEN '01' AND '12'`),
    check('children_ext_unlocked_boolean', sql`${table.extUnlocked} IN (0, 1)`),
  ],
);

export const childCoaches = sqliteTable(
  'child_coaches',
  {
    childId: text('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.childId, table.coachId] }),
    check('child_coaches_role', sql`${table.role} IN ('owner', 'member')`),
    uniqueIndex('child_coaches_one_owner').on(table.childId).where(sql`${table.role} = 'owner'`),
    index('child_coaches_coach_id').on(table.coachId, table.childId),
  ],
);

export const assessments = sqliteTable(
  'assessments',
  {
    id: text('id').primaryKey(),
    childId: text('child_id').notNull().references(() => children.id, { onDelete: 'restrict' }),
    seqNo: integer('seq_no').notNull(),
    status: text('status').notNull(),
    assessedOn: text('assessed_on').notNull(),
    coachId: text('coach_id').notNull().references(() => coaches.id, { onDelete: 'restrict' }),
    unlockExt: integer('unlock_ext', { mode: 'boolean' }).notNull().default(false),
    prevAssessmentId: text('prev_assessment_id').references(
      (): AnySQLiteColumn => assessments.id,
      { onDelete: 'restrict' },
    ),
    masterVersion: text('master_version').notNull(),
    data: text('data').notNull(),
    revision: integer('revision').notNull().default(1),
    mutationId: text('mutation_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => [
    unique('assessments_child_seq_no').on(table.childId, table.seqNo),
    uniqueIndex('assessments_one_draft').on(table.childId).where(sql`${table.status} = 'draft'`),
    index('assessments_child_status_seq_no').on(table.childId, table.status, table.seqNo),
    check('assessments_seq_no_positive', sql`${table.seqNo} > 0`),
    check('assessments_status', sql`${table.status} IN ('draft', 'done')`),
    check('assessments_assessed_on_format', sql`${table.assessedOn} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'`),
    check('assessments_unlock_ext_boolean', sql`${table.unlockExt} IN (0, 1)`),
    check(
      'assessments_data_json',
      sql`CASE WHEN json_valid(${table.data}) THEN json_type(${table.data}) = 'object' ELSE 0 END`,
    ),
    check('assessments_revision_positive', sql`${table.revision} > 0`),
    check(
      'assessments_completion_state',
      sql`(${table.status} = 'draft' AND ${table.completedAt} IS NULL) OR (${table.status} = 'done' AND ${table.completedAt} IS NOT NULL)`,
    ),
  ],
);

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    assessmentId: text('assessment_id').notNull().unique().references(() => assessments.id, { onDelete: 'cascade' }),
    assessmentRevision: integer('assessment_revision').notNull(),
    generator: text('generator').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    check('reports_assessment_revision_positive', sql`${table.assessmentRevision} > 0`),
    check(
      'reports_content_json',
      sql`CASE WHEN json_valid(${table.content}) THEN json_type(${table.content}) = 'object' ELSE 0 END`,
    ),
  ],
);
