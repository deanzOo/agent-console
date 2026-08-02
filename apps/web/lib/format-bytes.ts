const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;
const UNIT_SCALE = 1024;

// One decimal place past bytes: "1.5 GB" says enough to compare two mission
// trees, and a second decimal would only be noise on a disk usage screen.
export function formatBytes(bytes: number): string {
  if (bytes < UNIT_SCALE) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= UNIT_SCALE && unitIndex < UNITS.length - 1) {
    value /= UNIT_SCALE;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${UNITS[unitIndex]}`;
}
