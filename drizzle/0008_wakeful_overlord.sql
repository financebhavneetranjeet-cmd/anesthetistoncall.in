CREATE TABLE `case_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`clinician_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`consented_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`arrived_at` text,
	`cancelled_at` text,
	`latest_latitude` text,
	`latest_longitude` text,
	`latest_accuracy_metres` integer,
	`latest_updated_at` text,
	`distance_metres` integer,
	`duration_seconds` integer,
	`static_duration_seconds` integer,
	`route_polyline` text,
	`traffic_message` text,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinician_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_journey_case_unique` ON `case_journeys` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_journey_status_idx` ON `case_journeys` (`status`,`latest_updated_at`);--> statement-breakpoint
CREATE TABLE `journey_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`accuracy_metres` integer,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `case_journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journey_locations_journey_idx` ON `journey_locations` (`journey_id`,`recorded_at`);