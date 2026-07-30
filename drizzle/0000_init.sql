CREATE TABLE `asana_cache` (
	`gid` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`project` text,
	`due_on` text,
	`permalink` text,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`mission_id` text NOT NULL,
	`seq` integer NOT NULL,
	`ts` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	PRIMARY KEY(`mission_id`, `seq`),
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `issues_cache` (
	`repo` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`labels_json` text DEFAULT '[]' NOT NULL,
	`url` text NOT NULL,
	`updated_at` text,
	PRIMARY KEY(`repo`, `number`)
);
--> statement-breakpoint
CREATE TABLE `missions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`repo` text,
	`branch` text,
	`worktree_path` text,
	`session_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "missions_status_valid" CHECK("missions"."status" IN ('starting', 'running', 'awaiting_input', 'done', 'failed', 'stopped')),
	CONSTRAINT "missions_source_valid" CHECK("missions"."source" IN ('free', 'github', 'asana'))
);
--> statement-breakpoint
CREATE INDEX `missions_status_idx` ON `missions` (`status`);--> statement-breakpoint
CREATE TABLE `pending_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`mission_id` text NOT NULL,
	`kind` text NOT NULL,
	`tool_name` text,
	`input_json` text,
	`options_json` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`answered_at` text,
	FOREIGN KEY (`mission_id`) REFERENCES `missions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "pending_prompts_kind_valid" CHECK("pending_prompts"."kind" IN ('tool_approval', 'question'))
);
--> statement-breakpoint
CREATE INDEX `pending_prompts_open_idx` ON `pending_prompts` (`mission_id`) WHERE "pending_prompts"."answered_at" IS NULL;--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`keys_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repos` (
	`full_name` text PRIMARY KEY NOT NULL,
	`default_branch` text,
	`bare_path` text,
	`last_synced_at` text
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT "settings_value_not_blank" CHECK(trim("settings"."value") <> '')
);
