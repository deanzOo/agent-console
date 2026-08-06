CREATE TABLE `host_telemetry_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sampled_at_ms` integer NOT NULL,
	`load1` real NOT NULL,
	`cores` integer NOT NULL,
	`memory_used_bytes` integer NOT NULL,
	`memory_total_bytes` integer NOT NULL,
	`network_rx_bytes_per_sec` real,
	`network_tx_bytes_per_sec` real,
	`disk_read_bytes_per_sec` real,
	`disk_write_bytes_per_sec` real
);
--> statement-breakpoint
CREATE INDEX `host_telemetry_samples_sampled_at_idx` ON `host_telemetry_samples` (`sampled_at_ms`);