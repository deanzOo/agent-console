import { describe, expect, it } from "vitest";
import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  it("shows whole seconds below a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
  });

  it("switches to minutes at sixty seconds", () => {
    expect(formatDuration(60)).toBe("1.0m");
    expect(formatDuration(150)).toBe("2.5m");
  });

  it("switches to hours at sixty minutes", () => {
    expect(formatDuration(3600)).toBe("1.0h");
    expect(formatDuration(9000)).toBe("2.5h");
  });
});
