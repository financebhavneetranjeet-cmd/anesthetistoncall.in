CREATE TABLE `clinical_governance_reviewers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`granted_by_user_id` text NOT NULL,
	`granted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `governance_reviewer_user_unique` ON `clinical_governance_reviewers` (`user_id`);--> statement-breakpoint
CREATE INDEX `governance_reviewer_active_idx` ON `clinical_governance_reviewers` (`active`);--> statement-breakpoint
CREATE TABLE `safety_access_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`case_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_role` text NOT NULL,
	`action` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `safety_access_incident_idx` ON `safety_access_logs` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `safety_access_user_idx` ON `safety_access_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `safety_follow_up_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`action_type` text NOT NULL,
	`details` text,
	`responsible_user_id` text,
	`target_date` text,
	`completion_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `safety_followup_incident_idx` ON `safety_follow_up_actions` (`incident_id`,`status`,`target_date`);--> statement-breakpoint
CREATE TABLE `safety_incident_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`category` text NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `safety_incident_category_unique` ON `safety_incident_categories` (`incident_id`,`category`);--> statement-breakpoint
CREATE INDEX `safety_incident_category_idx` ON `safety_incident_categories` (`category`);--> statement-breakpoint
CREATE TABLE `safety_incident_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`uploaded_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `safety_incident_documents_object_key_unique` ON `safety_incident_documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `safety_document_incident_idx` ON `safety_incident_documents` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `safety_incident_statements` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`author_role` text NOT NULL,
	`statement_type` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `safety_statement_incident_idx` ON `safety_incident_statements` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `safety_incident_timeline` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`case_id` text NOT NULL,
	`actor_user_id` text,
	`actor_role` text,
	`event_type` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `safety_incidents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `safety_timeline_incident_idx` ON `safety_incident_timeline` (`incident_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `safety_timeline_case_idx` ON `safety_incident_timeline` (`case_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `safety_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`anaesthesia_record_id` text,
	`reporter_user_id` text NOT NULL,
	`reporter_role` text NOT NULL,
	`incident_at` text NOT NULL,
	`description` text NOT NULL,
	`immediate_action` text NOT NULL,
	`patient_condition_after` text NOT NULL,
	`further_treatment` text,
	`icu_transfer` integer DEFAULT false NOT NULL,
	`cpr_occurred` integer DEFAULT false NOT NULL,
	`additional_help_called` integer DEFAULT false NOT NULL,
	`follow_up_required` integer DEFAULT false NOT NULL,
	`critical` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`reviewer_user_id` text,
	`review_decision` text,
	`submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`anaesthesia_record_id`) REFERENCES `anaesthesia_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `safety_incident_case_idx` ON `safety_incidents` (`case_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `safety_incident_status_idx` ON `safety_incidents` (`status`,`critical`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `safety_incident_reporter_idx` ON `safety_incidents` (`reporter_user_id`,`submitted_at`);