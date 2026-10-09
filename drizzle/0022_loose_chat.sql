ALTER TABLE `user_access_audit_logs` ADD `suspension_expires_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `suspended_until` text;