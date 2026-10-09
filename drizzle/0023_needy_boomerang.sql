ALTER TABLE `clinician_profiles` ADD `pmc_verification_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `clinician_profiles` ADD `pmc_verification_checked_at` text;--> statement-breakpoint
ALTER TABLE `clinician_profiles` ADD `pmc_verification_note` text;