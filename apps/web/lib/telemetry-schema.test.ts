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

describe("telemetrySchema", () => {
  it("accepts a reading with no network or disk rate yet", () => {
    const parsed = telemetrySchema.safeParse({
      available: true,
      host: HOST_SAMPLE,
      missionsRunning: 0,
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
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an unavailable reading", () => {
    expect(telemetrySchema.safeParse({ available: false }).success).toBe(true);
  });

  it("rejects a reading missing its host", () => {
    expect(
      telemetrySchema.safeParse({ available: true, missionsRunning: 0 }).success,
    ).toBe(false);
  });

  it("rejects a value that is available but false is not a recognised discriminant", () => {
    expect(telemetrySchema.safeParse({ available: "yes" }).success).toBe(false);
  });
});
