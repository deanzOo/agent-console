import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, type Db } from "@agent-console/core/db";

const sample = vi.fn();
const createHostTelemetrySampler = vi.fn(() => ({ sample }));
const countMissions = vi.fn();

vi.mock("@agent-console/core/telemetry", () => ({ createHostTelemetrySampler }));
vi.mock("@agent-console/core/missions", () => ({ countMissions }));
vi.mock("@agent-console/core/env", () => ({
  getConfig: () => ({ hostProcPath: "/proc" }),
}));

const { readTelemetry } = await import("./telemetry");

const HOST_SAMPLE = {
  load1: 0.5,
  load5: 0.4,
  load15: 0.3,
  cores: 2,
  memory: { totalBytes: 100, usedBytes: 50, swapTotalBytes: 0, swapUsedBytes: 0 },
  network: undefined,
  disk: undefined,
  sampledAt: "2024-01-01T00:00:00.000Z",
};

const now = () => 1_700_000_000_000;

// countMissions is mocked, so this is never actually queried — a real
// database keeps the test honest about the `Db` type without a cast, and lets
// readTelemetry's own recording/reading of history run for real.
let dir: string;
let db: Db;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "claudevps-telemetry-"));
  db = openDatabase(path.join(dir, "data.db"));

  // createHostTelemetrySampler is only ever called once, on first use, to
  // build the one sampler this process reuses — resetting it here would wipe
  // the record of that call before the test that checks it runs.
  sample.mockReset();
  countMissions.mockReset();
  sample.mockReturnValue(HOST_SAMPLE);
  countMissions.mockReturnValue(3);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readTelemetry", () => {
  it("reads /proc through the configured path", () => {
    readTelemetry(db, now);
    expect(createHostTelemetrySampler).toHaveBeenCalledWith("/proc");
  });

  it("combines the host sample with how many missions are running", () => {
    expect(readTelemetry(db, now)).toEqual({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 3,
      history: [
        {
          sampledAtMs: now(),
          load1: 0.5,
          cores: 2,
          memoryUsedBytes: 50,
          memoryTotalBytes: 100,
          networkRxBytesPerSec: null,
          networkTxBytesPerSec: null,
          diskReadBytesPerSec: null,
          diskWriteBytesPerSec: null,
        },
      ],
    });
  });

  it("asks only for missions that are running, not starting or waiting", () => {
    readTelemetry(db, now);
    expect(countMissions).toHaveBeenCalledWith(db, { status: "running" });
  });

  it("records the sample so a later read can build a history", () => {
    readTelemetry(db, now);
    const later = () => now() + 10_000;

    const reading = readTelemetry(db, later);
    if (!reading.available) throw new Error("expected an available reading");
    expect(reading.history).toHaveLength(2);
  });

  // /proc does not exist on every host this dev-runs on (macOS, an
  // unusual container), and that is a real environment fact rather than a
  // bug — the dashboard should say so, not throw.
  it("degrades to unavailable when the host cannot be sampled", () => {
    sample.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(readTelemetry(db, now)).toEqual({ available: false });
  });
});
