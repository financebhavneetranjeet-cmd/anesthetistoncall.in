CREATE TABLE `user_access_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`admin_actor` text NOT NULL,
	`previous_status` text NOT NULL,
	`new_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_access_audit_user_idx` ON `user_access_audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_access_audit_created_idx` ON `user_access_audit_logs` (`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `account_status` text DEFAULT 'active' NOT NULL;