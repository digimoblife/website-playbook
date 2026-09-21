CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`explanation` text DEFAULT '' NOT NULL,
	`problem` text DEFAULT '' NOT NULL,
	`for_whom` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'core' NOT NULL,
	`nature` text DEFAULT 'new' NOT NULL,
	`status` text DEFAULT 'internal' NOT NULL,
	`audience` text DEFAULT 'internal' NOT NULL,
	`can_promise` text DEFAULT '' NOT NULL,
	`cannot_promise` text DEFAULT '' NOT NULL,
	`promo_text` text DEFAULT '' NOT NULL,
	`needs_tags` text DEFAULT '[]' NOT NULL,
	`is_published` integer DEFAULT false NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT "entries_kind_check" CHECK("entries"."kind" in ('core', 'addon')),
	CONSTRAINT "entries_nature_check" CHECK("entries"."nature" in ('new', 'update')),
	CONSTRAINT "entries_status_check" CHECK("entries"."status" in ('internal', 'beta', 'siap')),
	CONSTRAINT "entries_audience_check" CHECK("entries"."audience" in ('internal', 'marketing', 'partner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_slug_unique` ON `entries` (`slug`);--> statement-breakpoint
CREATE INDEX `entries_visibility_idx` ON `entries` (`is_published`,`status`,`audience`);--> statement-breakpoint
CREATE TABLE `entry_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`summary` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `entry_history_entry_id_idx` ON `entry_history` (`entry_id`);--> statement-breakpoint
CREATE TABLE `entry_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_steps_entry_position_unq` ON `entry_steps` (`entry_id`,`position`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_start` integer NOT NULL,
	`locked_until` integer
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`file_path` text NOT NULL,
	`failed` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_kind_check" CHECK("media"."kind" in ('screenshot', 'gif', 'promo')),
	CONSTRAINT "media_source_check" CHECK("media"."source" in ('auto', 'manual'))
);
--> statement-breakpoint
CREATE INDEX `media_entry_id_idx` ON `media` (`entry_id`);--> statement-breakpoint
CREATE TABLE `page_feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`helpful` integer NOT NULL,
	`at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_feedback_entry_id_idx` ON `page_feedback` (`entry_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`partner_name` text,
	`active` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`last_login_at` integer,
	CONSTRAINT "users_role_check" CHECK("users"."role" in ('admin', 'marketing', 'partner'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);