CREATE TABLE `availability_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`clinician_user_id` text NOT NULL,
	`status` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`preferred_area` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `availability_slot_clinician_time_idx` ON `availability_slots` (`clinician_user_id`,`start_at`,`end_at`);--> statement-breakpoint
ALTER TABLE `cases` ADD `is_planned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `booking_status` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `booking_buffer_minutes` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `schedule_revision` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `reschedule_requested_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `cancellation_reason` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `cancelled_by_user_id` text REFERENCES users(id);