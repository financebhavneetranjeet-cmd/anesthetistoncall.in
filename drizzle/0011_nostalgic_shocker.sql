ALTER TABLE `case_responses` ADD `response_type` text;--> statement-breakpoint
ALTER TABLE `case_responses` ADD `offer_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `case_responses` ADD `distance_metres` integer;--> statement-breakpoint
ALTER TABLE `case_responses` ADD `eta_minutes` integer;--> statement-breakpoint
ALTER TABLE `case_responses` ADD `location_captured_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `posted_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `cases` ADD `is_emergency` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `required_arrival_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `sos_status` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `sos_offer_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `sos_search_radius_km` integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `cases` ADD `sos_expires_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `sos_last_alerted_at` text;--> statement-breakpoint
ALTER TABLE `cases` ADD `cancelled_at` text;