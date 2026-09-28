CREATE TABLE `guide_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guide_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `guide_history_guide_id_idx` ON `guide_history` (`guide_id`);--> statement-breakpoint
CREATE TABLE `guide_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guide_id` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`entry_id` integer,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guide_steps_guide_position_unq` ON `guide_steps` (`guide_id`,`position`);--> statement-breakpoint
CREATE TABLE `guides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`intro` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'internal' NOT NULL,
	`audience` text DEFAULT 'internal' NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "guides_status_check" CHECK("guides"."status" in ('internal', 'beta', 'siap')),
	CONSTRAINT "guides_audience_check" CHECK("guides"."audience" in ('internal', 'marketing', 'partner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guides_slug_unique` ON `guides` (`slug`);--> statement-breakpoint
CREATE INDEX `guides_visibility_idx` ON `guides` (`is_published`,`status`,`audience`);--> statement-breakpoint
ALTER TABLE `entries` ADD `scheduled_publish_at` integer;--> statement-breakpoint
ALTER TABLE `entries` ADD `scheduled_by` integer REFERENCES users(id);--> statement-breakpoint
-- Pemicu penjaga (sama seperti migrasi 0002 untuk entri): panduan yang diarsipkan tidak boleh terbit.
CREATE TRIGGER `guides_arsip_tidak_terbit_insert`
BEFORE INSERT ON `guides`
WHEN NEW.`archived_at` IS NOT NULL AND NEW.`is_published` <> 0
BEGIN
  SELECT RAISE(ABORT, 'Panduan yang diarsipkan tidak boleh terbit');
END;
--> statement-breakpoint
CREATE TRIGGER `guides_arsip_tidak_terbit_update`
BEFORE UPDATE ON `guides`
WHEN NEW.`archived_at` IS NOT NULL AND NEW.`is_published` <> 0
BEGIN
  SELECT RAISE(ABORT, 'Panduan yang diarsipkan tidak boleh terbit');
END;
