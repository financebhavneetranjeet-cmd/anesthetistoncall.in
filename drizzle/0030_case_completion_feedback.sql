CREATE TABLE `case_completion_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`respondent_user_id` text NOT NULL,
	`respondent_side` text NOT NULL,
	`answers_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`respondent_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completion_feedback_case_user_unique` ON `case_completion_feedback` (`case_id`,`respondent_user_id`);--> statement-breakpoint
CREATE INDEX `completion_feedback_user_idx` ON `case_completion_feedback` (`respondent_user_id`,`case_id`);--> statement-breakpoint
ALTER TABLE `cases` ADD `feedback_required` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER case_feedback_on_completion AFTER UPDATE OF status ON cases
WHEN NEW.status='completed' AND OLD.status<>'completed'
BEGIN UPDATE cases SET feedback_required=1 WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER case_feedback_on_completed_insert AFTER INSERT ON cases
WHEN NEW.status='completed'
BEGIN UPDATE cases SET feedback_required=1 WHERE id=NEW.id; END;
