"use client";

import { useEffect, useState } from "react";
import { formatBytes } from "@/lib/format-bytes";
import { telemetrySchema, type TelemetryReading } from "@/lib/telemetry-schema";

// Telemetry changes on every sample, unlike the mission list, so this polls
// on a fixed interval rather than waiting for a change signal over SSE — a
// signal has nothing to compare against here.
const TELEMETRY_POLL_MS = 5_000;

// Ratio of 1-minute load to core count. Above this, the run queue exceeds
// what the box can actually execute in parallel.
const LOAD_HOT_RATIO = 1;
const LOAD_WARN_RATIO = 0.7;

function loadClass(ratio: number): string {
  if (ratio >= LOAD_HOT_RATIO) return "text-red-600 dark:text-red-400";
  if (ratio >= LOAD_WARN_RATIO) return "text-amber-600 dark:text-amber-400";
  return "";
}

export function TelemetryPanel({ initial }: { readonly initial: TelemetryReading }) {
  const [telemetry, setTelemetry] = useState<TelemetryReading>(initial);

  useEffect(() => {
    const poll = setInterval(() => {
      fetch("/api/telemetry")
        .then((response) => response.json())
        .then((body: unknown) => {
          const parsed = telemetrySchema.safeParse(body);
          if (parsed.success) setTelemetry(parsed.data);
        })
        .catch(() => undefined);
    }, TELEMETRY_POLL_MS);
    return () => clearInterval(poll);
  }, []);

  if (!telemetry.available) {
    return (
      <p className="text-xs text-neutral-500">
        Host telemetry unavailable on this deployment.
      </p>
    );
  }

  const { host, missionsRunning } = telemetry;
  const loadRatio = host.load1 / host.cores;
  const hasSwap = host.memory.swapTotalBytes > 0;

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
      <span className={loadClass(loadRatio)}>
        Load {host.load1.toFixed(2)} / {host.load5.toFixed(2)} /{" "}
        {host.load15.toFixed(2)} ({host.cores} {host.cores === 1 ? "core" : "cores"})
      </span>
      <span>
        Mem {formatBytes(host.memory.usedBytes)} / {formatBytes(host.memory.totalBytes)}
      </span>
      {hasSwap && (
        <span
          className={host.memory.swapUsedBytes > 0 ? loadClass(LOAD_HOT_RATIO) : ""}
        >
          Swap {formatBytes(host.memory.swapUsedBytes)} /{" "}
          {formatBytes(host.memory.swapTotalBytes)}
        </span>
      )}
      {host.network && (
        <span>
          Net &darr;{formatBytes(host.network.rxBytesPerSec, "/s")} &uarr;
          {formatBytes(host.network.txBytesPerSec, "/s")}
        </span>
      )}
      {host.disk && (
        <span>
          Disk &darr;{formatBytes(host.disk.readBytesPerSec, "/s")} &uarr;
          {formatBytes(host.disk.writeBytesPerSec, "/s")}
        </span>
      )}
      <span>
        {missionsRunning} {missionsRunning === 1 ? "mission" : "missions"} running
      </span>
    </div>
  );
}
