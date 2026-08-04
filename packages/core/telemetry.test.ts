import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeRates,
  createHostTelemetrySampler,
  parseDiskStats,
  parseLoadAvg,
  parseMemInfo,
  parseNetDev,
} from "./telemetry";

describe("parseLoadAvg", () => {
  it("reads the three load averages", () => {
    expect(parseLoadAvg("0.52 0.58 0.59 1/523 12345\n")).toEqual({
      load1: 0.52,
      load5: 0.58,
      load15: 0.59,
    });
  });

  it("treats a missing average as zero rather than NaN", () => {
    expect(parseLoadAvg("0.52\n")).toEqual({ load1: 0.52, load5: 0, load15: 0 });
  });
});

describe("parseMemInfo", () => {
  const content = [
    "MemTotal:       16384000 kB",
    "MemFree:         2000000 kB",
    "MemAvailable:    8000000 kB",
    "Buffers:          500000 kB",
    "Cached:          6000000 kB",
    "SwapTotal:       2097152 kB",
    "SwapFree:        1500000 kB",
    "",
  ].join("\n");

  it("converts totals to bytes", () => {
    expect(parseMemInfo(content).totalBytes).toBe(16384000 * 1024);
  });

  it("derives used from total minus available, not free", () => {
    // MemFree ignores the kernel's own cache, which it will hand back under
    // pressure — MemAvailable is the number that means "actually usable."
    expect(parseMemInfo(content).usedBytes).toBe((16384000 - 8000000) * 1024);
  });

  it("derives swap used from swap total minus swap free", () => {
    expect(parseMemInfo(content).swapUsedBytes).toBe((2097152 - 1500000) * 1024);
  });

  it("reports swap total in bytes", () => {
    expect(parseMemInfo(content).swapTotalBytes).toBe(2097152 * 1024);
  });

  it("treats a missing key as zero rather than throwing", () => {
    expect(parseMemInfo("MemTotal: 1024 kB\n")).toEqual({
      totalBytes: 1024 * 1024,
      usedBytes: 1024 * 1024,
      swapTotalBytes: 0,
      swapUsedBytes: 0,
    });
  });
});

describe("parseNetDev", () => {
  const content = [
    "Inter-|   Receive                                                |  Transmit",
    " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed",
    "    lo: 1000000    500    0    0    0     0          0         0  1000000     500    0    0    0     0       0          0",
    "  eth0: 50000000  30000    0    0    0     0          0         0  20000000   15000    0    0    0     0       0          0",
    "",
  ].join("\n");

  it("sums bytes across interfaces, excluding loopback", () => {
    expect(parseNetDev(content)).toEqual({ rxBytes: 50000000, txBytes: 20000000 });
  });

  it("sums across more than one real interface", () => {
    const twoInterfaces = `${content}  eth1: 100    0    0    0    0     0          0         0  200    0    0    0    0     0       0          0\n`;
    expect(parseNetDev(twoInterfaces)).toEqual({
      rxBytes: 50000000 + 100,
      txBytes: 20000000 + 200,
    });
  });

  it("treats a line with fewer fields than expected as zero rather than NaN", () => {
    const short = ["Inter-|Receive|Transmit", " face|x|y", "  eth0: 100", ""].join(
      "\n",
    );
    expect(parseNetDev(short)).toEqual({ rxBytes: 100, txBytes: 0 });
  });
});

describe("parseDiskStats", () => {
  it("sums sectors for whole disks, excluding partitions and virtual devices", () => {
    const content = [
      " 253       0 vda 1000 200 500000 1000 800 100 400000 900 0 1200 2100",
      " 253       1 vda1 900 180 480000 950 750 90 390000 850 0 1100 2000",
      "   7       0 loop0 10 0 200 5 0 0 0 0 0 5 5",
      "",
    ].join("\n");

    expect(parseDiskStats(content)).toEqual({
      readBytes: 500000 * 512,
      writeBytes: 400000 * 512,
    });
  });

  it("counts nvme-style whole disks but not their partitions", () => {
    const content = [
      " 259       0 nvme0n1 1000 0 600000 0 800 0 300000 0 0 0 0",
      " 259       1 nvme0n1p1 100 0 60000 0 80 0 30000 0 0 0 0",
      "",
    ].join("\n");

    expect(parseDiskStats(content)).toEqual({
      readBytes: 600000 * 512,
      writeBytes: 300000 * 512,
    });
  });

  it("sums more than one physical disk", () => {
    const content = [
      " 253       0 vda 1000 0 500000 0 800 0 400000 0 0 0 0",
      " 253      16 vdb 1000 0 100000 0 800 0 50000 0 0 0 0",
      "",
    ].join("\n");

    expect(parseDiskStats(content)).toEqual({
      readBytes: (500000 + 100000) * 512,
      writeBytes: (400000 + 50000) * 512,
    });
  });

  it("treats a line with fewer fields than expected as zero rather than NaN", () => {
    expect(parseDiskStats(" 253 0 vda\n")).toEqual({ readBytes: 0, writeBytes: 0 });
  });

  it("ignores a blank line rather than treating it as a device with no name", () => {
    expect(parseDiskStats("\n\n")).toEqual({ readBytes: 0, writeBytes: 0 });
  });
});

describe("computeRates", () => {
  const base = {
    networkRxBytes: 1000,
    networkTxBytes: 500,
    diskReadBytes: 2000,
    diskWriteBytes: 1000,
    atMs: 1000,
  };

  it("divides the delta by elapsed seconds", () => {
    const rates = computeRates(base, {
      ...base,
      networkRxBytes: 3000,
      networkTxBytes: 1500,
      diskReadBytes: 6000,
      diskWriteBytes: 3000,
      atMs: 3000,
    });

    expect(rates).toEqual({
      networkRxBytesPerSec: 1000,
      networkTxBytesPerSec: 500,
      diskReadBytesPerSec: 2000,
      diskWriteBytesPerSec: 1000,
    });
  });

  it("returns undefined when the clock has not advanced", () => {
    expect(computeRates(base, { ...base, atMs: 1000 })).toBeUndefined();
  });

  it("returns undefined when time runs backwards", () => {
    expect(computeRates(base, { ...base, atMs: 500 })).toBeUndefined();
  });

  // A counter can wrap or a device can reappear renumbered; a negative rate
  // would be more misleading on a gauge than a floor of zero.
  it("clamps a negative delta to zero instead of reporting it", () => {
    const rates = computeRates(base, { ...base, networkRxBytes: 0, atMs: 2000 });
    expect(rates?.networkRxBytesPerSec).toBe(0);
  });
});

describe("createHostTelemetrySampler", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function writeFixture(): string {
    const root = mkdtempSync(path.join(tmpdir(), "telemetry-test-"));
    roots.push(root);
    mkdirSync(path.join(root, "net"), { recursive: true });
    writeFileSync(path.join(root, "loadavg"), "0.10 0.20 0.30 1/10 1\n");
    writeFileSync(
      path.join(root, "meminfo"),
      "MemTotal: 2048 kB\nMemAvailable: 1024 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n",
    );
    writeFileSync(
      path.join(root, "net", "dev"),
      "Inter-|Receive|Transmit\n face|x|y\n  eth0: 100 0 0 0 0 0 0 0 200 0 0 0 0 0 0 0\n",
    );
    writeFileSync(path.join(root, "diskstats"), " 253 0 vda 1 0 10 0 1 0 20 0 0 0 0\n");
    return root;
  }

  // Two real samples taken back to back can land in the same millisecond, so
  // the clock is a fake one that always advances.
  function tickingClock(startMs = 0): () => number {
    let now = startMs;
    return () => (now += 1000);
  }

  it("reports load, cores and memory on the first sample", () => {
    const sampler = createHostTelemetrySampler(writeFixture(), tickingClock());
    const reading = sampler.sample();

    expect(reading.load1).toBe(0.1);
    expect(reading.cores).toBe(cpus().length);
    expect(reading.memory.totalBytes).toBe(2048 * 1024);
  });

  it("has no rate on the first sample, since there is nothing to compare against", () => {
    const sampler = createHostTelemetrySampler(writeFixture(), tickingClock());
    const reading = sampler.sample();

    expect(reading.network).toBeUndefined();
    expect(reading.disk).toBeUndefined();
  });

  it("reports a rate from the second sample onward", () => {
    const sampler = createHostTelemetrySampler(writeFixture(), tickingClock());
    sampler.sample();
    const reading = sampler.sample();

    expect(reading.network).toBeDefined();
    expect(reading.disk).toBeDefined();
  });

  it("keeps its own history separate from another sampler's", () => {
    const first = createHostTelemetrySampler(writeFixture(), tickingClock());
    first.sample();
    const second = createHostTelemetrySampler(writeFixture(), tickingClock());

    expect(second.sample().network).toBeUndefined();
  });
});
