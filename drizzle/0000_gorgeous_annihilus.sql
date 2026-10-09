CREATE TABLE `case_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`clinician_user_id` text NOT NULL,
	`proposed_fee_paise` integer,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_response_unique` ON `case_responses` (`case_id`,`clinician_user_id`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`hospital_id` text NOT NULL,
	`procedure_name` text NOT NULL,
	`anaesthesia_type` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`offered_fee_paise` integer NOT NULL,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`hospital_id`) REFERENCES `hospitals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cases_hospital_idx` ON `cases` (`hospital_id`);--> statement-breakpoint
CREATE INDEX `cases_status_idx` ON `cases` (`status`);--> statement-breakpoint
CREATE TABLE `hospitals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`city` text DEFAULT 'Amritsar' NOT NULL,
	`google_place_id` text,
	`latitude` text,
	`longitude` text,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `hospitals_owner_idx` ON `hospitals` (`owner_user_id`);--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`provider_request_id` text,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `otp_mobile_status_idx` ON `otp_challenges` (`mobile`,`status`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`email` text,
	`full_name` text NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`medical_registration_number` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_mobile_unique` ON `users` (`mobile`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);