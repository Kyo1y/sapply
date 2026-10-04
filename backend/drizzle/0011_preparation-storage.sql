CREATE TABLE `emailDrafts` (
	`jobId` text NOT NULL,
	`recipientEmail` text NOT NULL,
	`originalSubject` text NOT NULL,
	`revisedSubject` text,
	`originalDraft` text NOT NULL,
	`revisedDraft` text,
	`reason` text NOT NULL,
	`sources` text DEFAULT '[]' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`jobId`, `recipientEmail`),
	FOREIGN KEY (`jobId`,`recipientEmail`) REFERENCES `recruiters`(`jobId`,`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recruiters` (
	`jobId` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`linkedinUrl` text,
	`selected` integer DEFAULT false NOT NULL,
	`role_score` integer,
	`hiring_signal_score` integer,
	`human_signal_score` integer,
	`total_score` integer,
	`reason` text,
	`sources` text DEFAULT '[]' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`jobId`, `email`),
	FOREIGN KEY (`jobId`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "recruiters_complete_scores" CHECK(
        ("recruiters"."role_score" IS NULL AND "recruiters"."hiring_signal_score" IS NULL
            AND "recruiters"."human_signal_score" IS NULL AND "recruiters"."total_score" IS NULL)
        OR ("recruiters"."role_score" IS NOT NULL AND "recruiters"."hiring_signal_score" IS NOT NULL
            AND "recruiters"."human_signal_score" IS NOT NULL AND "recruiters"."total_score" IS NOT NULL
            AND "recruiters"."reason" IS NOT NULL)
    ),
	CONSTRAINT "recruiters_valid_scores" CHECK(
        "recruiters"."total_score" IS NULL OR (
            "recruiters"."role_score" IN (0, 35, 70)
            AND "recruiters"."hiring_signal_score" BETWEEN 0 AND 15
            AND "recruiters"."human_signal_score" BETWEEN 0 AND 15
            AND "recruiters"."total_score" = "recruiters"."role_score" + "recruiters"."hiring_signal_score" + "recruiters"."human_signal_score"
        )
    ),
	CONSTRAINT "recruiters_selected_has_scores" CHECK("recruiters"."selected" = 0 OR "recruiters"."total_score" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recruiters_selected_job_unique` ON `recruiters` (`jobId`) WHERE "recruiters"."selected" = 1;