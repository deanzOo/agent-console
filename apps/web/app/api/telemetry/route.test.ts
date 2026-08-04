import { describe, expect, it, vi } from "vitest";

const readTelemetry = vi.fn();

vi.mock("@agent-console/core/db", () => ({ getDatabase: () => ({}) }));
vi.mock("@/lib/telemetry", () => ({ readTelemetry }));

const { GET } = await import("./route");

describe("GET /api/telemetry", () => {
  it("answers with the current reading", async () => {
    readTelemetry.mockReturnValue({
      available: true,
      host: { load1: 0.1 },
      missionsRunning: 1,
    });

    await expect(GET().json()).resolves.toEqual({
      available: true,
      host: { load1: 0.1 },
      missionsRunning: 1,
    });
  });

  it("passes an unavailable reading through unchanged", async () => {
    readTelemetry.mockReturnValue({ available: false });

    await expect(GET().json()).resolves.toEqual({ available: false });
  });
});
