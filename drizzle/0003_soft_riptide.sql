CREATE TABLE `case_private_details` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`patient_initials` text,
	`patient_age` integer,
	`contact_phone` text,
	`location_instructions` text,
	`clinical_notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_private_details_case_unique` ON `case_private_details` (`case_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`audience_role` text,
	`case_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_role_idx` ON `notifications` (`audience_role`,`created_at`);--> statement-breakpoint
ALTER TABLE `case_responses` ADD `message` text;--> statement-breakpoint
ALTER TABLE `case_responses` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `urgency` text DEFAULT 'routine' NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `duration_minutes` integer;--> statement-breakpoint
ALTER TABLE `cases` ADD `public_notes` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `assigned_clinician_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `cases` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `assigned_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `closed_at` text;