CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`sourceUrl` text NOT NULL,
	`ingestionStatus` text DEFAULT 'queued' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_sourceUrl_unique` ON `jobs` (`sourceUrl`);