DROP INDEX `users_mobile_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_mobile_role_unique` ON `users` (`mobile`,`role`);--> statement-breakpoint
CREATE INDEX `users_mobile_idx` ON `users` (`mobile`);--> statement-breakpoint
PRAGMA optimize;
