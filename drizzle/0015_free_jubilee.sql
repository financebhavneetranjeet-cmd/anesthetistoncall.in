CREATE TABLE `case_delays` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`reason` text NOT NULL,
	`notes` text,
	`delay_minutes` integer NOT NULL,
	`reported_by_user_id` text NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_delay_case_idx` ON `case_delays` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `case_ot_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`ot_room_id` text NOT NULL,
	`scheduled_start` text NOT NULL,
	`scheduled_end` text NOT NULL,
	`assigned_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`ot_room_id`) REFERENCES `ot_rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_ot_assignment_case_unique` ON `case_ot_assignments` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_ot_assignment_room_time_idx` ON `case_ot_assignments` (`ot_room_id`,`scheduled_start`,`scheduled_end`);--> statement-breakpoint
CREATE TABLE `ot_case_states` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`anaesthesia_started_at` text,
	`surgery_started_at` text,
	`surgery_ended_at` text,
	`recovery_status` text,
	`recovery_started_at` text,
	`recovery_ended_at` text,
	`updated_by_user_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ot_case_state_case_unique` ON `ot_case_states` (`case_id`);--> statement-breakpoint
CREATE TABLE `ot_preparation_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`check_type` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`completed_by_user_id` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ot_preparation_case_check_unique` ON `ot_preparation_checks` (`case_id`,`check_type`);--> statement-breakpoint
CREATE TABLE `ot_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`hospital_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'free' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hospital_id`) REFERENCES `hospitals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ot_room_hospital_name_unique` ON `ot_rooms` (`hospital_id`,`name`);--> statement-breakpoint
CREATE INDEX `ot_room_hospital_status_idx` ON `ot_rooms` (`hospital_id`,`status`);