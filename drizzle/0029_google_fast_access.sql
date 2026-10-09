CREATE TABLE `google_auth_flows` (
	`id` text PRIMARY KEY NOT NULL,
	`browser_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`role` text NOT NULL,
	`user_id` text,
	`session_hash` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `google_auth_expiry_idx` ON `google_auth_flows` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_auth_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `google_auth_limit_expiry_idx` ON `google_auth_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `google_identities` (
	`subject` text PRIMARY KEY NOT NULL,
	`mobile` text NOT NULL,
	`email` text NOT NULL,
	`linked_by_user_id` text NOT NULL,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`linked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `google_identity_mobile_unique` ON `google_identities` (`mobile`);--> statement-breakpoint
CREATE UNIQUE INDEX `google_identity_email_unique` ON `google_identities` (`email`);