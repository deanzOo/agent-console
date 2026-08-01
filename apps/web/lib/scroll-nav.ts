// A long transcript is exactly the case where a viewport-relative threshold
// beats a fixed pixel count: it scales with the device instead of showing the
// control after a fraction of a screen on a phone and most of one on a monitor.
export const SCROLL_NAV_VIEWPORT_MULTIPLIER = 1;

export function shouldShowScrollNav(scrollY: number, viewportHeight: number): boolean {
  if (viewportHeight <= 0) return false;
  return scrollY > viewportHeight * SCROLL_NAV_VIEWPORT_MULTIPLIER;
}
