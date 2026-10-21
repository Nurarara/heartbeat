CREATE TABLE `hb_billing` (
	`user_id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`plan` text DEFAULT 'trial' NOT NULL,
	`status` text DEFAULT 'none' NOT NULL,
	`period_start` integer DEFAULT 0 NOT NULL,
	`period_end` integer DEFAULT 0 NOT NULL,
	`lock` text,
	`lock_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hb_billing_customer_id_unique` ON `hb_billing` (`customer_id`);--> statement-breakpoint
CREATE TABLE `hb_checkout` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`price_id` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text,
	`secret_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_events` (
	`id` text PRIMARY KEY NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`request_id` text NOT NULL,
	`input` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hb_job_owner_request` ON `hb_jobs` (`owner`,`request_id`);--> statement-breakpoint
CREATE TABLE `hb_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`attempt_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hb_like_owner_art` ON `hb_likes` (`user_id`,`attempt_id`);--> statement-breakpoint
CREATE TABLE `hb_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`preferences` text,
	`memory` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_rate` (
	`key` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hb_session_user` ON `hb_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `hb_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hb_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hb_users_email_unique` ON `hb_users` (`email`);