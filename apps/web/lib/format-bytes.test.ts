import { describe, expect, it } from "vitest";
import { formatBytes } from "./format-bytes";

describe("formatBytes", () => {
  it("shows a whole number of bytes below one kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("switches to kilobytes at 1024 bytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("climbs through megabytes, gigabytes and terabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 1024 * 2.5)).toBe("2.5 GB");
    expect(formatBytes(1024 ** 4 * 3)).toBe("3.0 TB");
  });

  it("does not climb past terabytes", () => {
    expect(formatBytes(1024 ** 5)).toBe("1024.0 TB");
  });

  it("appends a rate suffix when given one, for a throughput reading", () => {
    expect(formatBytes(1024, "/s")).toBe("1.0 KB/s");
    expect(formatBytes(512, "/s")).toBe("512 B/s");
  });
});
