ALTER TABLE `jobs` ADD `companySourceId` text REFERENCES companySources(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `jobs` ADD `externalId` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `title` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `location` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `postedAt` integer;--> statement-breakpoint
CREATE INDEX `jobs_companyId_idx` ON `jobs` (`companyId`);--> statement-breakpoint
CREATE INDEX `jobs_postedAt_idx` ON `jobs` (`postedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_companySourceId_externalId_unique` ON `jobs` (`companySourceId`,`externalId`);
