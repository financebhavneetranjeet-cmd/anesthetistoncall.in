CREATE TABLE `case_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`payer_user_id` text NOT NULL,
	`payee_user_id` text NOT NULL,
	`total_amount_paise` integer NOT NULL,
	`confirmed_amount_paise` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'due' NOT NULL,
	`due_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`settled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_payment_case_unique` ON `case_payments` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_payment_payee_idx` ON `case_payments` (`payee_user_id`,`status`);--> statement-breakpoint
CREATE INDEX `case_payment_payer_idx` ON `case_payments` (`payer_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `payment_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`actor_user_id` text,
	`event_type` text NOT NULL,
	`details` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `case_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_audit_payment_idx` ON `payment_audit_events` (`payment_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `payment_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`paid_at` text NOT NULL,
	`status` text DEFAULT 'marked' NOT NULL,
	`marked_by_user_id` text NOT NULL,
	`confirmed_by_user_id` text,
	`confirmed_at` text,
	`dispute_reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `case_payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`confirmed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_entry_idempotency_unique` ON `payment_entries` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payment_entries_payment_idx` ON `payment_entries` (`payment_id`,`created_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO case_payments(id,case_id,payer_user_id,payee_user_id,total_amount_paise,status,due_at)
SELECT lower(hex(randomblob(16))),c.id,h.owner_user_id,c.assigned_clinician_user_id,c.final_agreed_fee_paise,'due',COALESCE(c.case_completed_at,CURRENT_TIMESTAMP)
FROM cases c JOIN hospitals h ON h.id=c.hospital_id
WHERE c.status='completed' AND c.final_agreed_fee_paise IS NOT NULL AND c.assigned_clinician_user_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER create_case_payment_after_completion
AFTER UPDATE OF status ON cases
WHEN NEW.status='completed' AND OLD.status<>'completed' AND NEW.final_agreed_fee_paise IS NOT NULL AND NEW.assigned_clinician_user_id IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO case_payments(id,case_id,payer_user_id,payee_user_id,total_amount_paise,status,due_at)
 SELECT lower(hex(randomblob(16))),NEW.id,h.owner_user_id,NEW.assigned_clinician_user_id,NEW.final_agreed_fee_paise,'due',CURRENT_TIMESTAMP FROM hospitals h WHERE h.id=NEW.hospital_id;
END;
