ALTER TABLE `children` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `coaches` ADD `drive_folder_id` text;--> statement-breakpoint
ALTER TABLE `coaches` ADD `drive_shared_email` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `drive_parent_file_id` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `drive_coach_file_id` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `drive_saved_at` text;--> statement-breakpoint
ALTER TABLE `reports` ADD `drive_report_updated_at` text;