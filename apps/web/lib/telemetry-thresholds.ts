// Ratio of load to core count above which the run queue exceeds what the box
// can execute in parallel. Same idea for memory used against total.
export const LOAD_WARN_RATIO = 0.7;
export const LOAD_HOT_RATIO = 1;
export const MEMORY_WARN_RATIO = 0.75;
export const MEMORY_HOT_RATIO = 0.9;

export type ThresholdStatus = "normal" | "warn" | "hot";

/**
 * Turns a raw ratio (load1 / cores, memory used / total) into the three-way
 * call an operator actually wants — "is this fine, worth a glance, or the
 * reason something feels slow" — rather than leaving them to divide two
 * numbers themselves.
 */
export function thresholdStatus(
  ratio: number,
  warnRatio: number,
  hotRatio: number,
): ThresholdStatus {
  if (ratio >= hotRatio) return "hot";
  if (ratio >= warnRatio) return "warn";
  return "normal";
}
