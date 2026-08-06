import { asc, desc, gte, lt } from "drizzle-orm";
import type { Db } from "./db";
import { hostTelemetrySamples } from "./schema";
import type { HostTelemetry } from "./telemetry";

// A sparkline needs samples spaced apart, not one per poll: the panel can
// poll every few seconds while the dashboard stays open, and storing every
// poll would waste rows without making the window any more informative.
export const TELEMETRY_SAMPLE_INTERVAL_MS = 10_000;

// The middle ground #55 suggested between "no history" and a full time
// series: enough to see a spike's shape, short enough to stay a few hundred
// rows.
export const TELEMETRY_RETENTION_MS = 60 * 60 * 1000;

export interface TelemetryHistoryPoint {
  readonly sampledAtMs: number;
  readonly load1: number;
  readonly cores: number;
  readonly memoryUsedBytes: number;
  readonly memoryTotalBytes: number;
  readonly networkRxBytesPerSec: number | null;
  readonly networkTxBytesPerSec: number | null;
  readonly diskReadBytesPerSec: number | null;
  readonly diskWriteBytesPerSec: number | null;
}

function lastSampledAtMs(db: Db): number | undefined {
  const row = db
    .select({ sampledAtMs: hostTelemetrySamples.sampledAtMs })
    .from(hostTelemetrySamples)
    .orderBy(desc(hostTelemetrySamples.sampledAtMs))
    .limit(1)
    .get();
  return row?.sampledAtMs;
}

/**
 * Records a sample if the sample interval has elapsed since the last one,
 * then prunes anything that has aged out of the retention window — every
 * write is also the opportunity to keep the table a rolling window rather
 * than an ever-growing log.
 */
export function recordTelemetrySample(
  db: Db,
  host: HostTelemetry,
  now: () => number = Date.now,
): void {
  const atMs = now();
  const last = lastSampledAtMs(db);

  if (last === undefined || atMs - last >= TELEMETRY_SAMPLE_INTERVAL_MS) {
    db.insert(hostTelemetrySamples)
      .values({
        sampledAtMs: atMs,
        load1: host.load1,
        cores: host.cores,
        memoryUsedBytes: host.memory.usedBytes,
        memoryTotalBytes: host.memory.totalBytes,
        networkRxBytesPerSec: host.network?.rxBytesPerSec ?? null,
        networkTxBytesPerSec: host.network?.txBytesPerSec ?? null,
        diskReadBytesPerSec: host.disk?.readBytesPerSec ?? null,
        diskWriteBytesPerSec: host.disk?.writeBytesPerSec ?? null,
      })
      .run();
  }

  db.delete(hostTelemetrySamples)
    .where(lt(hostTelemetrySamples.sampledAtMs, atMs - TELEMETRY_RETENTION_MS))
    .run();
}

export function listTelemetryHistory(
  db: Db,
  now: () => number = Date.now,
): TelemetryHistoryPoint[] {
  const cutoff = now() - TELEMETRY_RETENTION_MS;
  return db
    .select()
    .from(hostTelemetrySamples)
    .where(gte(hostTelemetrySamples.sampledAtMs, cutoff))
    .orderBy(asc(hostTelemetrySamples.sampledAtMs))
    .all()
    .map((row) => ({
      sampledAtMs: row.sampledAtMs,
      load1: row.load1,
      cores: row.cores,
      memoryUsedBytes: row.memoryUsedBytes,
      memoryTotalBytes: row.memoryTotalBytes,
      networkRxBytesPerSec: row.networkRxBytesPerSec,
      networkTxBytesPerSec: row.networkTxBytesPerSec,
      diskReadBytesPerSec: row.diskReadBytesPerSec,
      diskWriteBytesPerSec: row.diskWriteBytesPerSec,
    }));
}
