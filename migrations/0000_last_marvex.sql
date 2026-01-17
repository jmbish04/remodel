CREATE TABLE `agent_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`floor_id` text NOT NULL,
	`step_name` text NOT NULL,
	`step_index` integer,
	`thought_process` text,
	`action_taken` text NOT NULL,
	`input_data` text,
	`output_data` text,
	`status` text DEFAULT 'success' NOT NULL,
	`error_message` text,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `floor_plan_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`floor_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`description` text,
	`plan_data` text,
	`remodel_zone` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `floors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`scale_ratio` real,
	`is_calibrated` integer DEFAULT false,
	`orientation_data` text,
	`is_underground` integer DEFAULT false,
	`stair_location` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`cloudflare_id` text NOT NULL,
	`public_url` text NOT NULL,
	`type` text NOT NULL,
	`prompt_used` text,
	`generation_model` text,
	`width` integer,
	`height` integer,
	`mime_type` text DEFAULT 'image/png' NOT NULL,
	`file_size` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_cloudflare_id_unique` ON `images` (`cloudflare_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`floor_id` text NOT NULL,
	`name` text NOT NULL,
	`width_ft` real,
	`length_ft` real,
	`approx_area` real,
	`polygon_json` text,
	`label_position` text,
	`remodel_goals` text,
	`remodel_goals_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`floor_id`) REFERENCES `floors`(`id`) ON UPDATE no action ON DELETE cascade
);
