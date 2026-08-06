import { describe, expect, it } from "vitest";
import {
  LOAD_HOT_RATIO,
  LOAD_WARN_RATIO,
  MEMORY_HOT_RATIO,
  MEMORY_WARN_RATIO,
  thresholdStatus,
} from "./telemetry-thresholds";

describe("thresholdStatus", () => {
  it("is normal well below the warn line", () => {
    expect(thresholdStatus(0.1, LOAD_WARN_RATIO, LOAD_HOT_RATIO)).toBe("normal");
  });

  it("is warn once the ratio reaches the warn line", () => {
    expect(thresholdStatus(LOAD_WARN_RATIO, LOAD_WARN_RATIO, LOAD_HOT_RATIO)).toBe(
      "warn",
    );
  });

  it("stays warn between the warn and hot lines", () => {
    expect(thresholdStatus(0.85, LOAD_WARN_RATIO, LOAD_HOT_RATIO)).toBe("warn");
  });

  it("is hot once the ratio reaches the hot line", () => {
    expect(thresholdStatus(LOAD_HOT_RATIO, LOAD_WARN_RATIO, LOAD_HOT_RATIO)).toBe(
      "hot",
    );
  });

  it("stays hot past the hot line", () => {
    expect(thresholdStatus(3, LOAD_WARN_RATIO, LOAD_HOT_RATIO)).toBe("hot");
  });

  it("applies the memory ratios the same way", () => {
    expect(thresholdStatus(0.5, MEMORY_WARN_RATIO, MEMORY_HOT_RATIO)).toBe("normal");
    expect(
      thresholdStatus(MEMORY_WARN_RATIO, MEMORY_WARN_RATIO, MEMORY_HOT_RATIO),
    ).toBe("warn");
    expect(thresholdStatus(MEMORY_HOT_RATIO, MEMORY_WARN_RATIO, MEMORY_HOT_RATIO)).toBe(
      "hot",
    );
  });
});
