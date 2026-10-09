CREATE TABLE `cancellation_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`early_hours` integer DEFAULT 24 NOT NULL,
	`late_hours` integer DEFAULT 6 NOT NULL,
	`very_late_hours` integer DEFAULT 2 NOT NULL,
	`no_show_grace_minutes` integer DEFAULT 30 NOT NULL,
	`updated_by_user_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `case_assignment_history` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`clinician_user_id` text NOT NULL,
	`assignment_type` text NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`final_fee_paise` integer,
	`assigned_at` text NOT NULL,
	`ended_at` text,
	`end_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assignment_history_case_idx` ON `case_assignment_history` (`case_id`,`assigned_at`);--> statement-breakpoint
CREATE INDEX `assignment_history_clinician_idx` ON `case_assignment_history` (`clinician_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `case_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`incident_type` text NOT NULL,
	`reported_by_user_id` text NOT NULL,
	`subject_user_id` text,
	`reason_code` text NOT NULL,
	`explanation` text,
	`timing_class` text,
	`minutes_before_reporting` integer,
	`status` text DEFAULT 'reported' NOT NULL,
	`reliability_impact` text DEFAULT 'pending_review' NOT NULL,
	`admin_notes` text,
	`admin_user_id` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `case_incident_case_idx` ON `case_incidents` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_incident_review_idx` ON `case_incidents` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `case_incident_subject_idx` ON `case_incidents` (`subject_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `incident_disputes` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`raised_by_user_id` text NOT NULL,
	`explanation` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `case_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raised_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_dispute_user_unique` ON `incident_disputes` (`incident_id`,`raised_by_user_id`);--> statement-breakpoint
CREATE TABLE `replacement_searches` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`incident_id` text NOT NULL,
	`original_clinician_user_id` text,
	`original_fee_paise` integer NOT NULL,
	`revised_offer_fee_paise` integer NOT NULL,
	`status` text DEFAULT 'required' NOT NULL,
	`offer_version` integer DEFAULT 1 NOT NULL,
	`requested_at` text,
	`accepted_at` text,
	`replacement_clinician_user_id` text,
	`response_seconds` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`incident_id`) REFERENCES `case_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`replacement_clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `replacement_search_case_active_unique` ON `replacement_searches` (`case_id`);--> statement-breakpoint
CREATE INDEX `replacement_search_status_idx` ON `replacement_searches` (`status`,`requested_at`);