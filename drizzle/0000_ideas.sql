CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Personnel' NOT NULL,
	`status` text DEFAULT 'Capturée' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
