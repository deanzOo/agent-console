import { z } from "zod";

// Shared by the server, which builds a reading from trusted data, and the
// browser, for which this is the actual external-data boundary — the one
// place a poll response is `fetch().json()` before anything trusts its shape.
// Kept free of everything server-only so a client component can import it
// without pulling `getConfig()` and friends into the browser bundle.
const hostSampleSchema = z.object({
  load1: z.number(),
  load5: z.number(),
  load15: z.number(),
  cores: z.number(),
  memory: z.object({
    totalBytes: z.number(),
    usedBytes: z.number(),
    swapTotalBytes: z.number(),
    swapUsedBytes: z.number(),
  }),
  network: z
    .object({ rxBytesPerSec: z.number(), txBytesPerSec: z.number() })
    .optional(),
  disk: z
    .object({ readBytesPerSec: z.number(), writeBytesPerSec: z.number() })
    .optional(),
  sampledAt: z.string(),
});

export const telemetrySchema = z.discriminatedUnion("available", [
  z.object({
    available: z.literal(true),
    host: hostSampleSchema,
    missionsRunning: z.number(),
  }),
  z.object({ available: z.literal(false) }),
]);

export type TelemetryReading = z.infer<typeof telemetrySchema>;
