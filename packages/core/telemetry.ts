import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

const KB_BYTES = 1024;
const SECTOR_BYTES = 512;
const MS_PER_SECOND = 1000;
const LOOPBACK_INTERFACE = "lo";
const VIRTUAL_DEVICE_PREFIXES = ["loop", "ram"];
const NET_DEV_HEADER_LINES = 2;
const NET_DEV_RX_BYTES_INDEX = 0;
const NET_DEV_TX_BYTES_INDEX = 8;
const DISKSTATS_NAME_INDEX = 2;
const DISKSTATS_SECTORS_READ_INDEX = 5;
const DISKSTATS_SECTORS_WRITTEN_INDEX = 9;

export interface LoadAverage {
  readonly load1: number;
  readonly load5: number;
  readonly load15: number;
}

export function parseLoadAvg(content: string): LoadAverage {
  // split() always returns at least one element, so load1 is never actually
  // undefined — noUncheckedIndexedAccess cannot know that statically, and the
  // fallback costs nothing to keep.
  const [load1, load5, load15] = content.trim().split(/\s+/).map(Number);
  return { load1: load1 ?? 0, load5: load5 ?? 0, load15: load15 ?? 0 };
}

export interface MemoryUsage {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly swapTotalBytes: number;
  readonly swapUsedBytes: number;
}

function meminfoBytes(content: string, key: string): number {
  const match = new RegExp(`^${key}:\\s+(\\d+)\\s*kB$`, "m").exec(content);
  return match?.[1] ? Number(match[1]) * KB_BYTES : 0;
}

export function parseMemInfo(content: string): MemoryUsage {
  const total = meminfoBytes(content, "MemTotal");
  const available = meminfoBytes(content, "MemAvailable");
  const swapTotal = meminfoBytes(content, "SwapTotal");
  const swapFree = meminfoBytes(content, "SwapFree");
  return {
    totalBytes: total,
    usedBytes: Math.max(total - available, 0),
    swapTotalBytes: swapTotal,
    swapUsedBytes: Math.max(swapTotal - swapFree, 0),
  };
}

export interface NetworkCounters {
  readonly rxBytes: number;
  readonly txBytes: number;
}

// The interface with no counterpart on the wire says nothing about the
// network the operator is asking about, and would otherwise double-count
// every packet an agent's own loopback traffic generates.
export function parseNetDev(content: string): NetworkCounters {
  const lines = content.split("\n").slice(NET_DEV_HEADER_LINES);
  let rxBytes = 0;
  let txBytes = 0;

  for (const line of lines) {
    const [name, rest] = line.split(":");
    if (!name || !rest) continue;
    if (name.trim() === LOOPBACK_INTERFACE) continue;

    // Same reasoning as parseLoadAvg: split() guarantees index 0 exists.
    const fields = rest.trim().split(/\s+/).map(Number);
    rxBytes += fields[NET_DEV_RX_BYTES_INDEX] ?? 0;
    txBytes += fields[NET_DEV_TX_BYTES_INDEX] ?? 0;
  }

  return { rxBytes, txBytes };
}

export interface DiskCounters {
  readonly readBytes: number;
  readonly writeBytes: number;
}

interface DiskStatsLine {
  readonly name: string;
  readonly sectorsRead: number;
  readonly sectorsWritten: number;
}

function parseDiskStatsLine(line: string): DiskStatsLine | undefined {
  const fields = line.trim().split(/\s+/);
  const name = fields[DISKSTATS_NAME_INDEX];
  if (!name) return undefined;
  return {
    name,
    sectorsRead: Number(fields[DISKSTATS_SECTORS_READ_INDEX] ?? 0),
    sectorsWritten: Number(fields[DISKSTATS_SECTORS_WRITTEN_INDEX] ?? 0),
  };
}

// diskstats has no field marking a line as a partition. Its name extends the
// whole disk's by digits (sda -> sda1) or by "p" then digits when the whole
// disk name itself ends in a digit (nvme0n1 -> nvme0n1p1) — this is the same
// rule the block layer uses to derive one from the other.
function isPartition(name: string, allNames: readonly string[]): boolean {
  return allNames.some((other) => {
    if (other === name || !name.startsWith(other)) return false;
    return /^p?\d+$/.test(name.slice(other.length));
  });
}

// Counting a partition alongside the whole disk it lives on would double the
// real number, so only whole disks are summed.
export function parseDiskStats(content: string): DiskCounters {
  const lines = content
    .split("\n")
    .map(parseDiskStatsLine)
    .filter((line): line is DiskStatsLine => line !== undefined)
    .filter(
      (line) => !VIRTUAL_DEVICE_PREFIXES.some((prefix) => line.name.startsWith(prefix)),
    );

  const names = lines.map((line) => line.name);
  const wholeDisks = lines.filter((line) => !isPartition(line.name, names));

  return wholeDisks.reduce(
    (totals, line) => ({
      readBytes: totals.readBytes + line.sectorsRead * SECTOR_BYTES,
      writeBytes: totals.writeBytes + line.sectorsWritten * SECTOR_BYTES,
    }),
    { readBytes: 0, writeBytes: 0 },
  );
}

export interface RateCounters {
  readonly networkRxBytes: number;
  readonly networkTxBytes: number;
  readonly diskReadBytes: number;
  readonly diskWriteBytes: number;
  readonly atMs: number;
}

export interface Rates {
  readonly networkRxBytesPerSec: number;
  readonly networkTxBytesPerSec: number;
  readonly diskReadBytesPerSec: number;
  readonly diskWriteBytesPerSec: number;
}

function perSecond(deltaBytes: number, elapsedSec: number): number {
  return Math.max(deltaBytes, 0) / elapsedSec;
}

/**
 * Undefined when the clock has not moved forward between the two samples —
 * there is nothing to divide by, and reporting a rate from equal timestamps
 * would either divide by zero or read as "nothing happened," which is not
 * the same claim as "unknown."
 */
export function computeRates(
  previous: RateCounters,
  current: RateCounters,
): Rates | undefined {
  const elapsedMs = current.atMs - previous.atMs;
  if (elapsedMs <= 0) return undefined;
  const elapsedSec = elapsedMs / MS_PER_SECOND;

  return {
    networkRxBytesPerSec: perSecond(
      current.networkRxBytes - previous.networkRxBytes,
      elapsedSec,
    ),
    networkTxBytesPerSec: perSecond(
      current.networkTxBytes - previous.networkTxBytes,
      elapsedSec,
    ),
    diskReadBytesPerSec: perSecond(
      current.diskReadBytes - previous.diskReadBytes,
      elapsedSec,
    ),
    diskWriteBytesPerSec: perSecond(
      current.diskWriteBytes - previous.diskWriteBytes,
      elapsedSec,
    ),
  };
}

export interface HostTelemetry {
  readonly load1: number;
  readonly load5: number;
  readonly load15: number;
  readonly cores: number;
  readonly memory: MemoryUsage;
  readonly network?:
    { readonly rxBytesPerSec: number; readonly txBytesPerSec: number } | undefined;
  readonly disk?:
    { readonly readBytesPerSec: number; readonly writeBytesPerSec: number } | undefined;
  readonly sampledAt: string;
}

interface Snapshot extends RateCounters {
  readonly load1: number;
  readonly load5: number;
  readonly load15: number;
  readonly memory: MemoryUsage;
}

function readProcFile(procPath: string, relativePath: string): string {
  return readFileSync(path.join(procPath, relativePath), "utf8");
}

function readSnapshot(procPath: string, now: () => number): Snapshot {
  const load = parseLoadAvg(readProcFile(procPath, "loadavg"));
  const memory = parseMemInfo(readProcFile(procPath, "meminfo"));
  const net = parseNetDev(readProcFile(procPath, "net/dev"));
  const disk = parseDiskStats(readProcFile(procPath, "diskstats"));

  return {
    ...load,
    memory,
    networkRxBytes: net.rxBytes,
    networkTxBytes: net.txBytes,
    diskReadBytes: disk.readBytes,
    diskWriteBytes: disk.writeBytes,
    atMs: now(),
  };
}

export interface HostTelemetrySampler {
  sample(): HostTelemetry;
}

/**
 * Network and disk are rates, which need two points in time to compute — each
 * sampler keeps the previous read in its own closure so the process can hold
 * more than one (tests, or a future second consumer) without one resetting
 * the other's history.
 *
 * `now` defaults to the real clock; tests pass a fake one, since two real
 * samples taken back to back can land in the same millisecond and would
 * otherwise make the "second sample has a rate" case flaky.
 */
export function createHostTelemetrySampler(
  procPath: string,
  now: () => number = Date.now,
): HostTelemetrySampler {
  let previous: Snapshot | undefined;

  return {
    sample(): HostTelemetry {
      const snapshot = readSnapshot(procPath, now);
      const rates = previous ? computeRates(previous, snapshot) : undefined;
      previous = snapshot;

      return {
        load1: snapshot.load1,
        load5: snapshot.load5,
        load15: snapshot.load15,
        cores: cpus().length,
        memory: snapshot.memory,
        network: rates && {
          rxBytesPerSec: rates.networkRxBytesPerSec,
          txBytesPerSec: rates.networkTxBytesPerSec,
        },
        disk: rates && {
          readBytesPerSec: rates.diskReadBytesPerSec,
          writeBytesPerSec: rates.diskWriteBytesPerSec,
        },
        sampledAt: new Date(snapshot.atMs).toISOString(),
      };
    },
  };
}
