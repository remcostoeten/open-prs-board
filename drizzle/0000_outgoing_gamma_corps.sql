CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`text` text,
	`priority` integer,
	`effort` text
);
