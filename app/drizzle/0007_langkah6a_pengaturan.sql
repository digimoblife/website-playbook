CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`product_name` text DEFAULT 'Lapaq' NOT NULL,
	`github_repo` text,
	`github_token_encrypted` text,
	`github_token_last4` text,
	`demo_store_url` text,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `settings_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `github_imports` ADD `repo` text;--> statement-breakpoint
-- Semua tarikan sebelum Langkah 6a berasal dari repo bawaan saat itu.
UPDATE `github_imports` SET `repo` = 'bajaklautmalaka/lapaq' WHERE `repo` IS NULL;
