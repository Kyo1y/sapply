CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`domain` text,
	`resolutionStatus` text DEFAULT 'unresolved' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_normalizedName_unique` ON `companies` (`normalizedName`);--> statement-breakpoint
CREATE TABLE `companyAliases` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`name` text NOT NULL,
	`normalizedName` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companyAliases_normalizedName_unique` ON `companyAliases` (`normalizedName`);--> statement-breakpoint
CREATE INDEX `companyAliases_companyId_idx` ON `companyAliases` (`companyId`);--> statement-breakpoint
CREATE TABLE `companyDiscoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`discoverySource` text NOT NULL,
	`observedName` text NOT NULL,
	`firstSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastSeenAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companyDiscoveries_companyId_idx` ON `companyDiscoveries` (`companyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `companyDiscoveries_companyId_source_unique` ON `companyDiscoveries` (`companyId`,`discoverySource`);--> statement-breakpoint
CREATE TABLE `companySources` (
	`id` text PRIMARY KEY NOT NULL,
	`companyId` text NOT NULL,
	`provider` text NOT NULL,
	`externalKey` text NOT NULL,
	`sourceUrl` text NOT NULL,
	`verificationStatus` text DEFAULT 'unverified' NOT NULL,
	`pollingEnabled` integer DEFAULT false NOT NULL,
	`lastPolledAt` integer,
	`lastSuccessfulPollAt` integer,
	`lastError` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`companyId`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `companySources_companyId_idx` ON `companySources` (`companyId`);--> statement-breakpoint
CREATE UNIQUE INDEX `companySources_provider_externalKey_unique` ON `companySources` (`provider`,`externalKey`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `companyId` text REFERENCES companies(id) ON DELETE set null;
