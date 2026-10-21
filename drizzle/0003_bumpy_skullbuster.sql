CREATE TABLE `ai_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`claim` text NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`location_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`candidate` text,
	`art_key` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `ai_auth` (
	`slot` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`claim` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_at` integer DEFAULT 0 NOT NULL,
	`current_id` text,
	`current_at` integer DEFAULT 0 NOT NULL
);
