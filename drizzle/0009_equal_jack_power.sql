CREATE TABLE `case_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_audit_case_idx` ON `case_audit_events` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `case_ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`rater_user_id` text NOT NULL,
	`rated_user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`feedback` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rater_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rated_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_rating_unique` ON `case_ratings` (`case_id`,`rater_user_id`);--> statement-breakpoint
CREATE INDEX `case_rating_target_idx` ON `case_ratings` (`rated_user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cases` ADD `final_agreed_fee_paise` integer;--> statement-breakpoint
ALTER TABLE `cases` ADD `fee_locked_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `ot_status` text DEFAULT 'awaiting_arrival' NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `arrived_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `ot_ready_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `case_started_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `case_completed_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `actual_duration_minutes` integer;