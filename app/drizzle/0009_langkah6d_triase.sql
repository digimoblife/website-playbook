PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_github_changes` (
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
	`bucket` text DEFAULT 'kandidat' NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` integer,
	`entry_id` integer,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "github_changes_kind_check" CHECK("__new_github_changes"."kind" in ('pr', 'commit')),
	CONSTRAINT "github_changes_state_check" CHECK("__new_github_changes"."state" in ('baru', 'ditinjau')),
	CONSTRAINT "github_changes_bucket_check" CHECK("__new_github_changes"."bucket" in ('kandidat', 'perbaikan', 'arsip'))
);
--> statement-breakpoint
-- Disunting manual: tabel lama belum punya kolom bucket, jadi baris lama memakai nilai bawaan
-- 'kandidat' (tidak ada perubahan yang tersembunyi dari Inbox karena migrasi ini).
INSERT INTO `__new_github_changes`("id", "repo", "kind", "pr_number", "commit_sha", "title", "body", "url", "files", "happened_at", "received_at", "state", "reviewed_at", "reviewed_by", "entry_id") SELECT "id", "repo", "kind", "pr_number", "commit_sha", "title", "body", "url", "files", "happened_at", "received_at", "state", "reviewed_at", "reviewed_by", "entry_id" FROM `github_changes`;--> statement-breakpoint
DROP TABLE `github_changes`;--> statement-breakpoint
ALTER TABLE `__new_github_changes` RENAME TO `github_changes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `github_changes_repo_pr_unq` ON `github_changes` (`repo`,`pr_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `github_changes_repo_sha_unq` ON `github_changes` (`repo`,`commit_sha`);--> statement-breakpoint
CREATE INDEX `github_changes_state_idx` ON `github_changes` (`state`);