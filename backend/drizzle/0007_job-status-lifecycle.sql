ALTER TABLE `jobs` RENAME COLUMN "ingestionStatus" TO "status";
--> statement-breakpoint
UPDATE `jobs` SET `status` = 'queued' WHERE `status` = 'processing' AND `postingHtml` IS NULL;
--> statement-breakpoint
UPDATE `jobs` SET `status` = 'processing' WHERE `status` = 'ready';
