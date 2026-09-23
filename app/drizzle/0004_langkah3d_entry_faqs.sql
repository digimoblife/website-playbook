CREATE TABLE `entry_faqs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`position` integer NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_faqs_entry_position_unq` ON `entry_faqs` (`entry_id`,`position`);