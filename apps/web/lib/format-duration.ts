const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

// One decimal place past whole seconds, same reasoning as formatBytes: enough
// to compare two waits, not enough to be noise.
export function formatDuration(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${Math.round(seconds)}s`;

  const minutes = seconds / SECONDS_PER_MINUTE;
  if (minutes < MINUTES_PER_HOUR) return `${minutes.toFixed(1)}m`;

  return `${(minutes / MINUTES_PER_HOUR).toFixed(1)}h`;
}
