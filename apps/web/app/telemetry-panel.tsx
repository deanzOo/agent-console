"use client";

import { useEffect, useState } from "react";
import { formatBytes } from "@/lib/format-bytes";
import {
  telemetrySchema,
  type TelemetryHistoryPoint,
  type TelemetryReading,
} from "@/lib/telemetry-schema";
import {
  LOAD_HOT_RATIO,
  LOAD_WARN_RATIO,
  MEMORY_HOT_RATIO,
  MEMORY_WARN_RATIO,
  thresholdStatus,
  type ThresholdStatus,
} from "@/lib/telemetry-thresholds";
import { Sparkline } from "./sparkline";

// Telemetry changes on every sample, unlike the mission list, so this polls
// on a fixed interval rather than waiting for a change signal over SSE — a
// signal has nothing to compare against here.
const TELEMETRY_POLL_MS = 5_000;

const STATUS_CLASSES: Record<ThresholdStatus, string> = {
  normal: "",
  warn: "text-amber-600 dark:text-amber-400",
  hot: "text-red-600 dark:text-red-400",
};

// A rate sparkline has no natural single series — rx and tx, or read and
// write, are two directions of the same throughput — so both are summed into
// one line here and the exact split stays in the numbers beside it.
function summedRates(
  history: readonly TelemetryHistoryPoint[],
  rxKey: "networkRxBytesPerSec" | "diskReadBytesPerSec",
  txKey: "networkTxBytesPerSec" | "diskWriteBytesPerSec",
): number[] {
  return history.flatMap((point) => {
    const rx = point[rxKey];
    const tx = point[txKey];
    return rx === null || tx === null ? [] : [rx + tx];
  });
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

  const { host, missionsRunning, history } = telemetry;
  const cores = host.cores === 1 ? "core" : "cores";
  const loadRatio = host.load1 / host.cores;
  const loadStatus = thresholdStatus(loadRatio, LOAD_WARN_RATIO, LOAD_HOT_RATIO);
  const hasSwap = host.memory.swapTotalBytes > 0;
  const memoryRatio = host.memory.usedBytes / host.memory.totalBytes;
  const memoryStatus = thresholdStatus(
    memoryRatio,
    MEMORY_WARN_RATIO,
    MEMORY_HOT_RATIO,
  );

  const loadValues = history.map((point) => point.load1);
  const memoryValues = history.map((point) => point.memoryUsedBytes);
  const networkValues = summedRates(
    history,
    "networkRxBytesPerSec",
    "networkTxBytesPerSec",
  );
  const diskValues = summedRates(
    history,
    "diskReadBytesPerSec",
    "diskWriteBytesPerSec",
  );

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-500">
      <span
        className={STATUS_CLASSES[loadStatus]}
        title={`Load average — runnable processes per CPU core, averaged over 1/5/15 minutes. This host has ${host.cores} ${cores}; above that, work is queuing for a free core.`}
      >
        Load {host.load1.toFixed(2)} / {host.load5.toFixed(2)} /{" "}
        {host.load15.toFixed(2)} ({host.cores} {cores}){" "}
        <Sparkline
          values={loadValues}
          label="Load average trend"
          className={STATUS_CLASSES[loadStatus] || undefined}
        />
      </span>
      <span
        className={STATUS_CLASSES[memoryStatus]}
        title="Memory in use out of total RAM. High use means little headroom left before the box starts swapping."
      >
        Mem {formatBytes(host.memory.usedBytes)} / {formatBytes(host.memory.totalBytes)}{" "}
        <Sparkline
          values={memoryValues}
          label="Memory used trend"
          className={STATUS_CLASSES[memoryStatus] || undefined}
        />
      </span>
      {hasSwap && (
        <span
          className={host.memory.swapUsedBytes > 0 ? STATUS_CLASSES.hot : ""}
          title="Swap in use. Any use here means physical RAM ran out at some point; sustained use makes everything slower."
        >
          Swap {formatBytes(host.memory.swapUsedBytes)} /{" "}
          {formatBytes(host.memory.swapTotalBytes)}
        </span>
      )}
      {host.network && (
        <span title="Network throughput in and out, summed across all interfaces except loopback. A rate — bytes per second — not a total since boot.">
          Net &darr;{formatBytes(host.network.rxBytesPerSec, "/s")} &uarr;
          {formatBytes(host.network.txBytesPerSec, "/s")}{" "}
          <Sparkline values={networkValues} label="Network throughput trend" />
        </span>
      )}
      {host.disk && (
        <span title="Disk read and write throughput, summed across physical disks (not partitions). A rate — bytes per second — not a total since boot.">
          Disk &darr;{formatBytes(host.disk.readBytesPerSec, "/s")} &uarr;
          {formatBytes(host.disk.writeBytesPerSec, "/s")}{" "}
          <Sparkline values={diskValues} label="Disk throughput trend" />
        </span>
      )}
      <span title="Missions currently in the running state — the ones that could be driving the numbers above.">
        {missionsRunning} {missionsRunning === 1 ? "mission" : "missions"} running
      </span>
    </div>
  );
}
