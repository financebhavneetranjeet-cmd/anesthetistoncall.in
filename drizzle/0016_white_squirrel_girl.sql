CREATE TABLE `anaesthesia_addenda` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`reason` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `anaesthesia_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anaesthesia_addendum_record_idx` ON `anaesthesia_addenda` (`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `anaesthesia_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`recorded_at` text NOT NULL,
	`payload_json` text NOT NULL,
	`retrospective` integer DEFAULT false NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `anaesthesia_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anaesthesia_entry_record_time_idx` ON `anaesthesia_entries` (`record_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `anaesthesia_record_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`version` integer NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`record_id`) REFERENCES `anaesthesia_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `anaesthesia_audit_record_idx` ON `anaesthesia_record_audit` (`record_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `anaesthesia_records` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`assigned_anaesthetist_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`record_mode` text DEFAULT 'standard' NOT NULL,
	`data_json` text DEFAULT '{}' NOT NULL,
	`final_snapshot_json` text,
	`version` integer DEFAULT 1 NOT NULL,
	`signed_by_user_id` text,
	`signed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_anaesthetist_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`signed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anaesthesia_record_case_unique` ON `anaesthesia_records` (`case_id`);--> statement-breakpoint
CREATE INDEX `anaesthesia_record_anaesthetist_idx` ON `anaesthesia_records` (`assigned_anaesthetist_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `anaesthesia_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`technique` text NOT NULL,
	`template_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anaesthesia_template_owner_name_unique` ON `anaesthesia_templates` (`owner_user_id`,`name`);