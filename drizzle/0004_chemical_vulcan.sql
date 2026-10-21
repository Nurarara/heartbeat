CREATE UNIQUE INDEX `ai_attempt_owner_request` ON `ai_attempts` (`owner`,`request_id`);--> statement-breakpoint
CREATE INDEX `ai_attempt_day` ON `ai_attempts` (`day`);--> statement-breakpoint
CREATE INDEX `ai_attempt_owner_created` ON `ai_attempts` (`owner`,`created_at`);