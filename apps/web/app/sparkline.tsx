import { SPARKLINE_HEIGHT, SPARKLINE_WIDTH, sparklineGeometry } from "@/lib/sparkline";

/**
 * A trend beside a number, not a chart in its own right — no axes, no
 * legend, no interaction. `currentColor` ties its stroke to whatever status
 * color the caller already applied to the figure it sits beside, so a hot
 * reading and its trend read as the same color rather than two systems.
 */
export function Sparkline({
  values,
  label,
  className,
}: {
  readonly values: readonly number[];
  readonly label: string;
  readonly className?: string | undefined;
}) {
  const geometry = sparklineGeometry(values);
  if (!geometry) return null;

  return (
    <svg
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      className={`inline-block align-middle ${className ?? "text-neutral-400 dark:text-neutral-600"}`}
      role="img"
      aria-label={label}
    >
      <polygon points={geometry.areaPoints} fill="currentColor" fillOpacity={0.1} />
      <polyline
        points={geometry.linePoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
