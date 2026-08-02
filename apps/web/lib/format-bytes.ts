const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const UNIT_SCALE = 1024;

// One decimal place past bytes: "1.5 GB" says enough to compare two mission
// trees or a throughput rate, and a second decimal would only be noise. A
// `suffix` of "/s" turns a size into a rate.
export function formatBytes(bytes: number, suffix = ""): string {
  if (bytes < UNIT_SCALE) return `${bytes} B${suffix}`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= UNIT_SCALE && unitIndex < UNITS.length - 1) {
    value /= UNIT_SCALE;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${UNITS[unitIndex]}${suffix}`;
}
