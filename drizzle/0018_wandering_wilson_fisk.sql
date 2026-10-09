CREATE TABLE `review_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rating_id` text,
	`case_id` text NOT NULL,
	`actor_user_id` text,
	`actor_role` text,
	`action` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`rating_id`) REFERENCES `case_ratings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_audit_rating_idx` ON `review_audit_events` (`rating_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `review_audit_case_idx` ON `review_audit_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `review_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`rating_id` text NOT NULL,
	`reported_by_user_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`admin_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`rating_id`) REFERENCES `case_ratings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_report_unique` ON `review_reports` (`rating_id`,`reported_by_user_id`);--> statement-breakpoint
CREATE INDEX `review_report_status_idx` ON `review_reports` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `punctuality_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `communication_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `clinical_coordination_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `responsiveness_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `case_information_accuracy_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `payment_reliability_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `direction` text;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `status` text DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `privacy_flagged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `moderation_reason` text;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `edit_expires_at` text;