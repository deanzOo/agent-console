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

// countMissions is mocked, so this is never actually queried — a real
// database keeps the test honest about the `Db` type without a cast.
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
    readTelemetry(db);
    expect(createHostTelemetrySampler).toHaveBeenCalledWith("/proc");
  });

  it("combines the host sample with how many missions are running", () => {
    expect(readTelemetry(db)).toEqual({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 3,
    });
  });

  it("asks only for missions that are running, not starting or waiting", () => {
    readTelemetry(db);
    expect(countMissions).toHaveBeenCalledWith(db, { status: "running" });
  });

  // /proc does not exist on every host this dev-runs on (macOS, an
  // unusual container), and that is a real environment fact rather than a
  // bug — the dashboard should say so, not throw.
  it("degrades to unavailable when the host cannot be sampled", () => {
    sample.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    expect(readTelemetry(db)).toEqual({ available: false });
  });
});
