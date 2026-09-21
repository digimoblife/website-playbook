ALTER TABLE `entries` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `entry_steps` ADD `media_id` integer REFERENCES media(id) ON DELETE set null;
