CREATE TABLE `clinician_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`state_council` text DEFAULT 'Punjab Medical Council' NOT NULL,
	`registration_number` text NOT NULL,
	`qualification` text NOT NULL,
	`city` text DEFAULT 'Amritsar' NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`availability_status` text DEFAULT 'unavailable' NOT NULL,
	`available_until` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clinician_registration_unique` ON `clinician_profiles` (`state_council`,`registration_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `clinician_user_unique` ON `clinician_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `clinician_available_idx` ON `clinician_profiles` (`verification_status`,`availability_status`,`available_until`);--> statement-breakpoint
CREATE TABLE `verification_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`document_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_documents_object_key_unique` ON `verification_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `verification_documents_user_idx` ON `verification_documents` (`user_id`);