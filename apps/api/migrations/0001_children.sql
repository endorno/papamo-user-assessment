CREATE TABLE `children` (
  `id` text PRIMARY KEY NOT NULL,
  `share_code` text NOT NULL UNIQUE,
  `owner_share_code` text NOT NULL UNIQUE,
  `created_by` text NOT NULL,
  `name` text NOT NULL,
  `honorific` text NOT NULL,
  `grade_code` text NOT NULL,
  `grade_base_year` integer NOT NULL,
  `joined_on` text NOT NULL,
  `ext_unlocked` integer NOT NULL DEFAULT 0,
  `goals` text NOT NULL,
  `archived_at` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);

CREATE TABLE `child_coaches` (
  `child_id` text NOT NULL,
  `coach_id` text NOT NULL,
  `role` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY(`child_id`, `coach_id`)
);

CREATE TABLE `assessments` (
  `id` text PRIMARY KEY NOT NULL,
  `child_id` text NOT NULL,
  `seq_no` integer NOT NULL,
  `status` text NOT NULL,
  `assessed_on` text NOT NULL,
  `coach_id` text NOT NULL,
  `unlock_ext` integer NOT NULL DEFAULT 0,
  `prev_assessment_id` text,
  `master_version` text NOT NULL,
  `data` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text,
  UNIQUE(`child_id`, `seq_no`)
);

CREATE TABLE `reports` (
  `id` text PRIMARY KEY NOT NULL,
  `assessment_id` text NOT NULL UNIQUE,
  `generator` text NOT NULL,
  `content` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
