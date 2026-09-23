CREATE TABLE `github_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pr_number` integer NOT NULL,
	`pr_title` text NOT NULL,
	`pr_url` text NOT NULL,
	`entry_id` integer NOT NULL,
	`imported_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`actor_id` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `github_imports_pr_number_idx` ON `github_imports` (`pr_number`);--> statement-breakpoint
ALTER TABLE `entries` ADD `source_pr_number` integer;