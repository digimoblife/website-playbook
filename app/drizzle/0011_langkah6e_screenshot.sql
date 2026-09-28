CREATE TABLE `screenshot_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`last_run_at` integer,
	`last_status` text,
	`last_error` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "screenshot_scenarios_status_check" CHECK("screenshot_scenarios"."last_status" is null or "screenshot_scenarios"."last_status" in ('berhasil', 'gagal'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `screenshot_scenarios_entry_id_unique` ON `screenshot_scenarios` (`entry_id`);--> statement-breakpoint
ALTER TABLE `media` ADD `auto_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `media_entry_auto_key_unq` ON `media` (`entry_id`,`auto_key`);