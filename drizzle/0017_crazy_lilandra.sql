CREATE TABLE `payment_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`case_id` text NOT NULL,
	`raised_by_user_id` text NOT NULL,
	`reason` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`supporting_note` text,
	`status` text DEFAULT 'open' NOT NULL,
	`admin_remarks` text,
	`resolution_history_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `case_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`raised_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_issue_payment_idx` ON `payment_issues` (`payment_id`,`status`);--> statement-breakpoint
CREATE INDEX `payment_issue_case_idx` ON `payment_issues` (`case_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cases` ADD `completion_requested_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `completion_requested_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `cases` ADD `completion_confirmed_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `completion_confirmed_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `payment_audit_events` ADD `actor_role` text;--> statement-breakpoint
ALTER TABLE `payment_audit_events` ADD `previous_value` text;--> statement-breakpoint
ALTER TABLE `payment_audit_events` ADD `new_value` text;--> statement-breakpoint
ALTER TABLE `payment_entries` ADD `note` text;