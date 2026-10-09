ALTER TABLE `case_private_details` ADD `patient_sex` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `specialty` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `location` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `bidding_enabled` integer DEFAULT false NOT NULL;