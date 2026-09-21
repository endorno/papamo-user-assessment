PRAGMA defer_foreign_keys = ON;

CREATE TABLE `__gender_children` AS SELECT * FROM `children`;
CREATE TABLE `__gender_child_coaches` AS SELECT * FROM `child_coaches`;
CREATE TABLE `__gender_assessments` AS SELECT * FROM `assessments`;
CREATE TABLE `__gender_reports` AS SELECT * FROM `reports`;

DROP TABLE `reports`;
DROP TABLE `assessments`;
DROP TABLE `child_coaches`;
DROP TABLE `children`;

CREATE TABLE `children` (
  `id` text PRIMARY KEY NOT NULL,
  `share_code` text NOT NULL UNIQUE,
  `owner_share_code` text NOT NULL UNIQUE,
  `created_by` text NOT NULL REFERENCES `coaches`(`id`) ON DELETE RESTRICT,
  `name` text NOT NULL,
  `honorific` text NOT NULL,
  `gender` text NOT NULL DEFAULT 'unspecified',
  `grade_code` text NOT NULL,
  `grade_base_year` integer NOT NULL,
  `joined_on` text NOT NULL,
  `ext_unlocked` integer NOT NULL DEFAULT 0,
  `goals` text NOT NULL,
  `archived_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `children_share_code_format` CHECK (length(`share_code`) = 8 AND `share_code` NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
  CONSTRAINT `children_owner_share_code_format` CHECK (length(`owner_share_code`) = 8 AND `owner_share_code` NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
  CONSTRAINT `children_honorific` CHECK (`honorific` IN ('kun', 'chan', 'san')),
  CONSTRAINT `children_gender` CHECK (`gender` IN ('boy', 'girl', 'unspecified')),
  CONSTRAINT `children_grade_code` CHECK (`grade_code` IN ('k0', 'k1', 'k2', 'k3', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3')),
  CONSTRAINT `children_joined_on_format` CHECK (`joined_on` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CONSTRAINT `children_ext_unlocked_boolean` CHECK (`ext_unlocked` IN (0, 1)),
  CONSTRAINT `children_goals_json` CHECK (CASE WHEN json_valid(`goals`) THEN json_type(`goals`) = 'array' ELSE 0 END)
);

CREATE TABLE `child_coaches` (
  `child_id` text NOT NULL REFERENCES `children`(`id`) ON DELETE CASCADE,
  `coach_id` text NOT NULL REFERENCES `coaches`(`id`) ON DELETE RESTRICT,
  `role` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`child_id`, `coach_id`),
  CONSTRAINT `child_coaches_role` CHECK (`role` IN ('owner', 'member'))
);

CREATE TABLE `assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `child_id` text NOT NULL REFERENCES `children`(`id`) ON DELETE RESTRICT,
  `seq_no` integer NOT NULL,
  `status` text NOT NULL,
  `assessed_on` text NOT NULL,
  `coach_id` text NOT NULL REFERENCES `coaches`(`id`) ON DELETE RESTRICT,
  `unlock_ext` integer NOT NULL DEFAULT 0,
  `prev_assessment_id` text REFERENCES `assessments`(`id`) ON DELETE RESTRICT,
  `master_version` text NOT NULL,
  `data` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 1,
  `mutation_id` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text,
  CONSTRAINT `assessments_child_seq_no` UNIQUE(`child_id`, `seq_no`),
  CONSTRAINT `assessments_seq_no_positive` CHECK (`seq_no` > 0),
  CONSTRAINT `assessments_status` CHECK (`status` IN ('draft', 'done')),
  CONSTRAINT `assessments_assessed_on_format` CHECK (`assessed_on` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CONSTRAINT `assessments_unlock_ext_boolean` CHECK (`unlock_ext` IN (0, 1)),
  CONSTRAINT `assessments_data_json` CHECK (CASE WHEN json_valid(`data`) THEN json_type(`data`) = 'object' ELSE 0 END),
  CONSTRAINT `assessments_revision_positive` CHECK (`revision` > 0),
  CONSTRAINT `assessments_completion_state` CHECK ((`status` = 'draft' AND `completed_at` IS NULL) OR (`status` = 'done' AND `completed_at` IS NOT NULL))
);

CREATE TABLE `reports` (
  `id` text PRIMARY KEY NOT NULL,
  `assessment_id` text NOT NULL UNIQUE REFERENCES `assessments`(`id`) ON DELETE CASCADE,
  `assessment_revision` integer NOT NULL,
  `generator` text NOT NULL,
  `content` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `reports_assessment_revision_positive` CHECK (`assessment_revision` > 0),
  CONSTRAINT `reports_content_json` CHECK (CASE WHEN json_valid(`content`) THEN json_type(`content`) = 'object' ELSE 0 END)
);

CREATE TRIGGER `reports_assessment_consistency_insert`
BEFORE INSERT ON `reports`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `assessments`
  WHERE `id` = NEW.`assessment_id`
    AND `status` = 'done'
    AND `revision` = NEW.`assessment_revision`
)
BEGIN
  SELECT RAISE(ABORT, 'report assessment revision mismatch');
END;

CREATE TRIGGER `reports_assessment_consistency_update`
BEFORE UPDATE OF `assessment_id`, `assessment_revision` ON `reports`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `assessments`
  WHERE `id` = NEW.`assessment_id`
    AND `status` = 'done'
    AND `revision` = NEW.`assessment_revision`
)
BEGIN
  SELECT RAISE(ABORT, 'report assessment revision mismatch');
END;

INSERT INTO `children` (
  `id`, `share_code`, `owner_share_code`, `created_by`, `name`, `honorific`, `gender`,
  `grade_code`, `grade_base_year`, `joined_on`, `ext_unlocked`, `goals`, `archived_at`,
  `created_at`, `updated_at`
)
SELECT `id`, `share_code`, `owner_share_code`, `created_by`, `name`,
       CASE WHEN `honorific` = 'none' THEN 'san' ELSE `honorific` END,
       'unspecified',
       `grade_code`, `grade_base_year`, `joined_on`, `ext_unlocked`, `goals`, `archived_at`,
       `created_at`, `updated_at`
FROM `__gender_children`;
INSERT INTO `child_coaches` SELECT * FROM `__gender_child_coaches`;
INSERT INTO `assessments` SELECT * FROM `__gender_assessments` ORDER BY `child_id`, `seq_no`;
INSERT INTO `reports` SELECT * FROM `__gender_reports`;

DROP TABLE `__gender_reports`;
DROP TABLE `__gender_assessments`;
DROP TABLE `__gender_child_coaches`;
DROP TABLE `__gender_children`;

CREATE UNIQUE INDEX `child_coaches_one_owner`
ON `child_coaches` (`child_id`)
WHERE `role` = 'owner';

CREATE INDEX `child_coaches_coach_id`
ON `child_coaches` (`coach_id`, `child_id`);

CREATE UNIQUE INDEX `assessments_one_draft`
ON `assessments` (`child_id`)
WHERE `status` = 'draft';

CREATE INDEX `assessments_child_status_seq_no`
ON `assessments` (`child_id`, `status`, `seq_no`);
