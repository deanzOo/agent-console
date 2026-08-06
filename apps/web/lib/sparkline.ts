export const SPARKLINE_WIDTH = 100;
export const SPARKLINE_HEIGHT = 20;

export interface SparklineGeometry {
  readonly linePoints: string;
  readonly areaPoints: string;
}

/**
 * Undefined for fewer than two points — a sparkline shows a shape over time,
 * and there is no shape to draw through a single sample. Flat data (every
 * value equal) has no range to scale against, so it draws as a flat
 * mid-height line rather than dividing by zero.
 */
export function sparklineGeometry(
  values: readonly number[],
): SparklineGeometry | undefined {
  if (values.length < 2) return undefined;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;

  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * SPARKLINE_WIDTH;
    const y =
      range === 0
        ? SPARKLINE_HEIGHT / 2
        : SPARKLINE_HEIGHT - ((value - min) / range) * SPARKLINE_HEIGHT;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePoints = coords.join(" ");

  return {
    linePoints,
    areaPoints: `0,${SPARKLINE_HEIGHT} ${linePoints} ${SPARKLINE_WIDTH},${SPARKLINE_HEIGHT}`,
  };
}
