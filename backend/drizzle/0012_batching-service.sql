CREATE TABLE `batch` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `jobs` ADD `batchId` text REFERENCES batch(id);--> statement-breakpoint
ALTER TABLE `jobs` ADD `pendingAt` integer;--> statement-breakpoint
CREATE INDEX `jobs_batchId_idx` ON `jobs` (`batchId`);--> statement-breakpoint
CREATE INDEX `jobs_unbatched_pending_idx` ON `jobs` (`pendingAt`) WHERE "jobs"."status" = 'pending' AND "jobs"."batchId" IS NULL;--> statement-breakpoint
-- Older pending rows used updatedAt to record the completed preparation step.
UPDATE `jobs` SET `pendingAt` = `updatedAt` WHERE `status` = 'pending' AND `pendingAt` IS NULL;
