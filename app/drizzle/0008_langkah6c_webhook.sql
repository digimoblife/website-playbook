CREATE TABLE `github_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`repo` text NOT NULL,
	`kind` text NOT NULL,
	`pr_number` integer,
	`commit_sha` text,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`happened_at` integer,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`state` text DEFAULT 'baru' NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` integer,
	`entry_id` integer,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "github_changes_kind_check" CHECK("github_changes"."kind" in ('pr', 'commit')),
	CONSTRAINT "github_changes_state_check" CHECK("github_changes"."state" in ('baru', 'ditinjau'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_changes_repo_pr_unq` ON `github_changes` (`repo`,`pr_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_changes_repo_sha_unq` ON `github_changes` (`repo`,`commit_sha`);--> statement-breakpoint
CREATE INDEX `github_changes_state_idx` ON `github_changes` (`state`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`delivery_id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`received_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
