import { describe, expect, it } from "vitest";
import { shouldShowScrollNav } from "./scroll-nav";

describe("shouldShowScrollNav", () => {
  it("stays hidden before the page has scrolled past one viewport height", () => {
    expect(shouldShowScrollNav(0, 800)).toBe(false);
    expect(shouldShowScrollNav(400, 800)).toBe(false);
  });

  it("stays hidden exactly at one viewport height", () => {
    expect(shouldShowScrollNav(800, 800)).toBe(false);
  });

  it("appears once the scroll passes one viewport height", () => {
    expect(shouldShowScrollNav(801, 800)).toBe(true);
  });

  it("stays hidden when the viewport is tall enough to show the whole transcript", () => {
    expect(shouldShowScrollNav(100, 2000)).toBe(false);
  });

  // Measured before the browser has laid anything out, and during the first
  // render on the server, where there is no window to measure at all.
  it("stays hidden when the viewport has no height yet", () => {
    expect(shouldShowScrollNav(100, 0)).toBe(false);
    expect(shouldShowScrollNav(100, -1)).toBe(false);
  });
});
