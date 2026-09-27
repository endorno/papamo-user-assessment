CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`child_id` text NOT NULL,
	`seq_no` integer NOT NULL,
	`status` text NOT NULL,
	`assessed_on` text NOT NULL,
	`coach_id` text NOT NULL,
	`unlock_ext` integer DEFAULT false NOT NULL,
	`prev_assessment_id` text,
	`master_version` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`mutation_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prev_assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "assessments_seq_no_positive" CHECK("assessments"."seq_no" > 0),
	CONSTRAINT "assessments_status" CHECK("assessments"."status" IN ('draft', 'done')),
	CONSTRAINT "assessments_assessed_on_format" CHECK("assessments"."assessed_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "assessments_unlock_ext_boolean" CHECK("assessments"."unlock_ext" IN (0, 1)),
	CONSTRAINT "assessments_data_json" CHECK(CASE WHEN json_valid("assessments"."data") THEN json_type("assessments"."data") = 'object' ELSE 0 END),
	CONSTRAINT "assessments_revision_positive" CHECK("assessments"."revision" > 0),
	CONSTRAINT "assessments_completion_state" CHECK(("assessments"."status" = 'draft' AND "assessments"."completed_at" IS NULL) OR ("assessments"."status" = 'done' AND "assessments"."completed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_one_draft` ON `assessments` (`child_id`) WHERE "assessments"."status" = 'draft';--> statement-breakpoint
CREATE INDEX `assessments_child_status_seq_no` ON `assessments` (`child_id`,`status`,`seq_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessments_child_seq_no` ON `assessments` (`child_id`,`seq_no`);--> statement-breakpoint
CREATE TABLE `child_coaches` (
	`child_id` text NOT NULL,
	`coach_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`child_id`, `coach_id`),
	FOREIGN KEY (`child_id`) REFERENCES `children`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "child_coaches_role" CHECK("child_coaches"."role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `child_coaches_one_owner` ON `child_coaches` (`child_id`) WHERE "child_coaches"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `child_coaches_coach_id` ON `child_coaches` (`coach_id`,`child_id`);--> statement-breakpoint
CREATE TABLE `children` (
	`id` text PRIMARY KEY NOT NULL,
	`share_code` text NOT NULL,
	`owner_share_code` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`honorific` text NOT NULL,
	`gender` text DEFAULT 'unspecified' NOT NULL,
	`grade_code` text NOT NULL,
	`grade_base_year` integer NOT NULL,
	`joined_month` text NOT NULL,
	`ext_unlocked` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `coaches`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "children_share_code_format" CHECK(length("children"."share_code") = 8 AND "children"."share_code" NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
	CONSTRAINT "children_owner_share_code_format" CHECK(length("children"."owner_share_code") = 8 AND "children"."owner_share_code" NOT GLOB '*[^ABCDEFGHJKLMNPQRSTUVWXYZ23456789]*'),
	CONSTRAINT "children_honorific" CHECK("children"."honorific" IN ('kun', 'chan', 'san')),
	CONSTRAINT "children_gender" CHECK("children"."gender" IN ('boy', 'girl', 'unspecified')),
	CONSTRAINT "children_grade_code" CHECK("children"."grade_code" IN ('k0', 'k1', 'k2', 'k3', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'j1', 'j2', 'j3')),
	CONSTRAINT "children_joined_month_format" CHECK("children"."joined_month" GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]' AND substr("children"."joined_month", 6, 2) BETWEEN '01' AND '12'),
	CONSTRAINT "children_ext_unlocked_boolean" CHECK("children"."ext_unlocked" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `children_share_code_unique` ON `children` (`share_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `children_owner_share_code_unique` ON `children` (`owner_share_code`);--> statement-breakpoint
CREATE TABLE `coaches` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`assessment_revision` integer NOT NULL,
	`generator` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reports_assessment_revision_positive" CHECK("reports"."assessment_revision" > 0),
	CONSTRAINT "reports_content_json" CHECK(CASE WHEN json_valid("reports"."content") THEN json_type("reports"."content") = 'object' ELSE 0 END)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_assessment_id_unique` ON `reports` (`assessment_id`);