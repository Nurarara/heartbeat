CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`world_id` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`usage` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`displayed` text NOT NULL,
	`pending` text,
	`anchor` text,
	`version` integer DEFAULT 1 NOT NULL,
	`moments` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`day` text NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`lease` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
