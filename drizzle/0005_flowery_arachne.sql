PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_missions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`source_ref` text,
	`repo` text,
	`branch` text,
	`worktree_path` text,
	`session_id` text,
	`mode` text DEFAULT 'default' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	CONSTRAINT "missions_status_valid" CHECK("__new_missions"."status" IN ('queued', 'starting', 'running', 'awaiting_input', 'done', 'failed', 'stopped')),
	CONSTRAINT "missions_source_valid" CHECK("__new_missions"."source" IN ('free', 'github', 'asana')),
	CONSTRAINT "missions_mode_valid" CHECK("__new_missions"."mode" IN ('default', 'acceptEdits', 'plan'))
);
--> statement-breakpoint
INSERT INTO `__new_missions`("id", "title", "status", "source", "source_ref", "repo", "branch", "worktree_path", "session_id", "mode", "created_at", "updated_at", "last_seq", "archived_at") SELECT "id", "title", "status", "source", "source_ref", "repo", "branch", "worktree_path", "session_id", "mode", "created_at", "updated_at", "last_seq", "archived_at" FROM `missions`;--> statement-breakpoint
DROP TABLE `missions`;--> statement-breakpoint
ALTER TABLE `__new_missions` RENAME TO `missions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `missions_status_idx` ON `missions` (`status`);