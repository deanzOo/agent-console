import { describe, expect, it } from "vitest";
import { telemetrySchema } from "./telemetry-schema";

const HOST_SAMPLE = {
  load1: 0.5,
  load5: 0.4,
  load15: 0.3,
  cores: 2,
  memory: { totalBytes: 100, usedBytes: 50, swapTotalBytes: 0, swapUsedBytes: 0 },
  sampledAt: "2024-01-01T00:00:00.000Z",
};

const HISTORY_POINT = {
  sampledAtMs: 1_700_000_000_000,
  load1: 0.5,
  cores: 2,
  memoryUsedBytes: 50,
  memoryTotalBytes: 100,
  networkRxBytesPerSec: null,
  networkTxBytesPerSec: null,
  diskReadBytesPerSec: null,
  diskWriteBytesPerSec: null,
};

describe("telemetrySchema", () => {
  it("accepts a reading with no network or disk rate yet", () => {
    const parsed = telemetrySchema.safeParse({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 0,
      history: [HISTORY_POINT],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a reading with a network and disk rate", () => {
    const parsed = telemetrySchema.safeParse({
      available: true,
      host: {
        ...HOST_SAMPLE,
        network: { rxBytesPerSec: 10, txBytesPerSec: 20 },
        disk: { readBytesPerSec: 30, writeBytesPerSec: 40 },
      },
      missionsRunning: 1,
      history: [
        { ...HISTORY_POINT, networkRxBytesPerSec: 10, diskReadBytesPerSec: 30 },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty history", () => {
    const parsed = telemetrySchema.safeParse({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 0,
      history: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an unavailable reading", () => {
    expect(telemetrySchema.safeParse({ available: false }).success).toBe(true);
  });

  it("rejects a reading missing its host", () => {
    expect(
      telemetrySchema.safeParse({ available: true, missionsRunning: 0, history: [] })
        .success,
    ).toBe(false);
  });

  it("rejects a reading missing its history", () => {
    expect(
      telemetrySchema.safeParse({
        available: true,
        host: HOST_SAMPLE,
        missionsRunning: 0,
      }).success,
    ).toBe(false);
  });

  it("rejects a history point missing a rate field", () => {
    const incomplete: Partial<typeof HISTORY_POINT> = { ...HISTORY_POINT };
    delete incomplete.networkRxBytesPerSec;
    const parsed = telemetrySchema.safeParse({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 0,
      history: [incomplete],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a value that is available but false is not a recognised discriminant", () => {
    expect(telemetrySchema.safeParse({ available: "yes" }).success).toBe(false);
  });
});
