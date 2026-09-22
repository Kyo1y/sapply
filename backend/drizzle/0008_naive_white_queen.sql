ALTER TABLE `jobs` ADD `provider` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `companyName` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `applyUrl` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `displayedAge` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `salaryText` text;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_provider_externalId_unique` ON `jobs` (`provider`,`externalId`);