import { describe, expect, it } from "vitest";
import { formatUsd } from "./format-usd";

describe("formatUsd", () => {
  it("shows whole and fractional dollars to the cent", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(12)).toBe("$12.00");
  });

  it("rounds to the nearest cent", () => {
    expect(formatUsd(1.017)).toBe("$1.02");
    expect(formatUsd(1.004)).toBe("$1.00");
  });

  it("keeps more precision for a real amount that would otherwise read as free", () => {
    expect(formatUsd(0.003)).toBe("$0.0030");
    expect(formatUsd(0.0001)).toBe("$0.0001");
  });
});
