CREATE TABLE `performance_admin_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` text,
	`case_id` text,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `performance_admin_created_idx` ON `performance_admin_actions` (`created_at`);--> statement-breakpoint
CREATE TABLE `performance_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`metric` text NOT NULL,
	`reason` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `performance_exclusion_case_idx` ON `performance_exclusions` (`case_id`,`metric`);--> statement-breakpoint
CREATE TABLE `performance_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`case_id` text,
	`flag_type` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `performance_flag_status_idx` ON `performance_flags` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `smart_score_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`emergency_availability` integer DEFAULT 25 NOT NULL,
	`emergency_eta` integer DEFAULT 30 NOT NULL,
	`emergency_reliability` integer DEFAULT 20 NOT NULL,
	`emergency_rating` integer DEFAULT 10 NOT NULL,
	`emergency_response` integer DEFAULT 10 NOT NULL,
	`emergency_fee` integer DEFAULT 5 NOT NULL,
	`planned_availability` integer DEFAULT 20 NOT NULL,
	`planned_eta` integer DEFAULT 15 NOT NULL,
	`planned_reliability` integer DEFAULT 20 NOT NULL,
	`planned_rating` integer DEFAULT 15 NOT NULL,
	`planned_response` integer DEFAULT 10 NOT NULL,
	`planned_fee` integer DEFAULT 20 NOT NULL,
	`minimum_cases` integer DEFAULT 5 NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `coordination_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `ot_readiness_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `payment_experience_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `professional_conduct_rating` integer;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `disputed_at` text;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `dispute_reason` text;--> statement-breakpoint
ALTER TABLE `case_ratings` ADD `excluded_from_score` integer DEFAULT false NOT NULL;