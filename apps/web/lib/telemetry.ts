import type { Db } from "@agent-console/core/db";
import { getConfig } from "@agent-console/core/env";
import { countMissions } from "@agent-console/core/missions";
import { MISSION_STATUS } from "@agent-console/core/schema";
import {
  createHostTelemetrySampler,
  type HostTelemetrySampler,
} from "@agent-console/core/telemetry";
import type { TelemetryReading } from "./telemetry-schema";

export type { TelemetryReading } from "./telemetry-schema";

// One sampler for the whole process, shared by the dashboard's first render
// and every poll after it — two would each think they were first and never
// report a rate. Built on first use rather than at module load, since Next.js
// imports route modules while collecting page data at build time, before
// there is a real environment for getConfig() to read.
let hostTelemetrySampler: HostTelemetrySampler | undefined;

function getHostTelemetrySampler(): HostTelemetrySampler {
  hostTelemetrySampler ??= createHostTelemetrySampler(getConfig().hostProcPath);
  return hostTelemetrySampler;
}

/**
 * /proc is not guaranteed to exist — a developer on macOS, or a container
 * without it — and that is a supported state rather than a bug, so it
 * degrades to "unavailable" instead of taking the dashboard down with it.
 */
export function readTelemetry(db: Db): TelemetryReading {
  try {
    const host = getHostTelemetrySampler().sample();
    return {
      available: true,
      host,
      missionsRunning: countMissions(db, { status: MISSION_STATUS.RUNNING }),
    };
  } catch {
    return { available: false };
  }
}
