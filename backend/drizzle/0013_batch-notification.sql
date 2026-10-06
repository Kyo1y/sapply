CREATE TABLE `batchNotification` (
	`batchId` text NOT NULL,
	`notificationId` text NOT NULL,
	`recipientEmail` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`subject` text NOT NULL,
	`htmlBody` text NOT NULL,
	`textBody` text NOT NULL,
	`providerEmailId` text,
	`sentAt` integer,
	`lastError` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`batchId`, `notificationId`),
	FOREIGN KEY (`batchId`) REFERENCES `batch`(`id`) ON UPDATE no action ON DELETE cascade
);
