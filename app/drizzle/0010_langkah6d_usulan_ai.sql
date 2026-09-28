CREATE TABLE `ai_proposals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`change_id` integer NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`problem` text DEFAULT '' NOT NULL,
	`for_whom` text DEFAULT '' NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'core' NOT NULL,
	`nature` text DEFAULT 'new' NOT NULL,
	`entry_id` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`change_id`) REFERENCES `github_changes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ai_proposals_kind_check" CHECK("ai_proposals"."kind" in ('core', 'addon')),
	CONSTRAINT "ai_proposals_nature_check" CHECK("ai_proposals"."nature" in ('new', 'update'))
);
--> statement-breakpoint
CREATE INDEX `ai_proposals_change_id_idx` ON `ai_proposals` (`change_id`);