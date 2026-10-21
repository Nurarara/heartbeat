ALTER TABLE `hb_billing` ADD `review_required` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `hb_devices_code_hash_unique` ON `hb_devices` (`code_hash`);