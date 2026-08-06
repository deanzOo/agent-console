import { describe, expect, it } from "vitest";
import { SPARKLINE_HEIGHT, SPARKLINE_WIDTH, sparklineGeometry } from "./sparkline";

describe("sparklineGeometry", () => {
  it("is undefined for fewer than two points — nothing to draw a trend through", () => {
    expect(sparklineGeometry([])).toBeUndefined();
    expect(sparklineGeometry([5])).toBeUndefined();
  });

  it("maps the minimum to the bottom edge and the maximum to the top edge", () => {
    const geometry = sparklineGeometry([0, 10]);
    expect(geometry?.linePoints).toBe(
      `0.0,${SPARKLINE_HEIGHT.toFixed(1)} ${SPARKLINE_WIDTH.toFixed(1)},0.0`,
    );
  });

  it("spaces points evenly across the width", () => {
    const geometry = sparklineGeometry([0, 0, 0, 10]);
    const xs = geometry?.linePoints.split(" ").map((pair) => pair.split(",")[0]);
    expect(xs).toEqual([
      "0.0",
      (SPARKLINE_WIDTH / 3).toFixed(1),
      ((SPARKLINE_WIDTH * 2) / 3).toFixed(1),
      SPARKLINE_WIDTH.toFixed(1),
    ]);
  });

  it("draws a flat mid-height line when every value is equal", () => {
    const geometry = sparklineGeometry([4, 4, 4]);
    const ys = geometry?.linePoints.split(" ").map((pair) => pair.split(",")[1]);
    expect(ys).toEqual([
      (SPARKLINE_HEIGHT / 2).toFixed(1),
      (SPARKLINE_HEIGHT / 2).toFixed(1),
      (SPARKLINE_HEIGHT / 2).toFixed(1),
    ]);
  });

  it("closes the area fill along the baseline under the line", () => {
    const geometry = sparklineGeometry([0, 10]);
    expect(geometry?.areaPoints).toBe(
      `0,${SPARKLINE_HEIGHT} ${geometry?.linePoints} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`,
    );
  });
});
