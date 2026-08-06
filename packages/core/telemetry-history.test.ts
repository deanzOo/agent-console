import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, type Db } from "./db";
import {
  listTelemetryHistory,
  recordTelemetrySample,
  TELEMETRY_RETENTION_MS,
  TELEMETRY_SAMPLE_INTERVAL_MS,
} from "./telemetry-history";
import type { HostTelemetry } from "./telemetry";

function hostSample(overrides: Partial<HostTelemetry> = {}): HostTelemetry {
  return {
    load1: 0.5,
    load5: 0.4,
    load15: 0.3,
    cores: 2,
    memory: { totalBytes: 1000, usedBytes: 400, swapTotalBytes: 0, swapUsedBytes: 0 },
    network: { rxBytesPerSec: 10, txBytesPerSec: 20 },
    disk: { readBytesPerSec: 30, writeBytesPerSec: 40 },
    sampledAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-telemetry-history-"));
  db = openDatabase(path.join(dir, "data.db"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("recordTelemetrySample", () => {
  it("records the first sample", () => {
    recordTelemetrySample(db, hostSample(), () => 1_000);

    expect(listTelemetryHistory(db, () => 1_000)).toEqual([
      {
        sampledAtMs: 1_000,
        load1: 0.5,
        cores: 2,
        memoryUsedBytes: 400,
        memoryTotalBytes: 1000,
        networkRxBytesPerSec: 10,
        networkTxBytesPerSec: 20,
        diskReadBytesPerSec: 30,
        diskWriteBytesPerSec: 40,
      },
    ]);
  });

  it("stores null rates when the sampler had no previous /proc read to diff against", () => {
    recordTelemetrySample(
      db,
      hostSample({ network: undefined, disk: undefined }),
      () => 1_000,
    );

    const [point] = listTelemetryHistory(db, () => 1_000);
    expect(point).toMatchObject({
      networkRxBytesPerSec: null,
      networkTxBytesPerSec: null,
      diskReadBytesPerSec: null,
      diskWriteBytesPerSec: null,
    });
  });

  it("does not store a second sample fewer than the sample interval after the first", () => {
    recordTelemetrySample(db, hostSample(), () => 1_000);
    recordTelemetrySample(
      db,
      hostSample({ load1: 9.9 }),
      () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS - 1,
    );

    expect(
      listTelemetryHistory(db, () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS),
    ).toHaveLength(1);
  });

  it("stores a new sample once the sample interval has elapsed", () => {
    recordTelemetrySample(db, hostSample(), () => 1_000);
    recordTelemetrySample(
      db,
      hostSample({ load1: 9.9 }),
      () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS,
    );

    const history = listTelemetryHistory(
      db,
      () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS,
    );
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ load1: 9.9 });
  });

  it("prunes samples older than the retention window on write", () => {
    recordTelemetrySample(db, hostSample(), () => 1_000);
    recordTelemetrySample(
      db,
      hostSample({ load1: 9.9 }),
      () => 1_000 + TELEMETRY_RETENTION_MS + TELEMETRY_SAMPLE_INTERVAL_MS,
    );

    const history = listTelemetryHistory(
      db,
      () => 1_000 + TELEMETRY_RETENTION_MS + TELEMETRY_SAMPLE_INTERVAL_MS,
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ load1: 9.9 });
  });
});

describe("listTelemetryHistory", () => {
  it("returns samples oldest first", () => {
    recordTelemetrySample(db, hostSample({ load1: 1 }), () => 1_000);
    recordTelemetrySample(
      db,
      hostSample({ load1: 2 }),
      () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS,
    );

    const history = listTelemetryHistory(
      db,
      () => 1_000 + TELEMETRY_SAMPLE_INTERVAL_MS,
    );
    expect(history.map((point) => point.load1)).toEqual([1, 2]);
  });

  it("excludes samples that have aged out of the retention window", () => {
    recordTelemetrySample(db, hostSample(), () => 1_000);

    const farFuture = 1_000 + TELEMETRY_RETENTION_MS + 1;
    expect(listTelemetryHistory(db, () => farFuture)).toEqual([]);
  });

  it("is empty when nothing has been recorded", () => {
    expect(listTelemetryHistory(db, () => 1_000)).toEqual([]);
  });
});
