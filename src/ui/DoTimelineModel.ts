export interface DoReading {
  /** Hour on a 24-hour clock. Decimal values are supported (for example 14.5). */
  readonly hour: number;
  /** Dissolved oxygen in milligrams per litre. */
  readonly value: number;
}

export interface DoSignalGap {
  readonly fromHour: number;
  readonly toHour: number;
}

/**
 * A deliberately simple teaching curve. It is not product-performance data.
 * The pre-dawn dip makes the value of continuous monitoring visible to pupils.
 */
export const DEFAULT_DAWN_DIP_SERIES: readonly DoReading[] = [
  { hour: 0, value: 5.4 },
  { hour: 2, value: 4.9 },
  { hour: 4, value: 3.8 },
  { hour: 5, value: 2.7 },
  { hour: 6, value: 3.3 },
  { hour: 8, value: 4.5 },
  { hour: 10, value: 5.2 },
  { hour: 12, value: 5.8 },
  { hour: 14, value: 6.1 },
  { hour: 16, value: 5.9 },
  { hour: 18, value: 5.5 },
  { hour: 20, value: 5.2 },
  { hour: 22, value: 5.4 },
  { hour: 24, value: 5.6 },
];

/** Remove invalid readings, clamp them to the teaching chart, and order by time. */
export function normalizeDoReadings(
  readings: readonly DoReading[],
  minValue = 0,
  maxValue = 8,
): DoReading[] {
  const low = Math.min(minValue, maxValue);
  const high = Math.max(minValue, maxValue);

  return readings
    .filter((reading) => Number.isFinite(reading.hour) && Number.isFinite(reading.value))
    .map((reading) => ({
      hour: Math.min(24, Math.max(0, reading.hour)),
      value: Math.min(high, Math.max(low, reading.value)),
    }))
    .sort((a, b) => a.hour - b.hour);
}

export function findLowestDoReading(readings: readonly DoReading[]): DoReading | null {
  let lowest: DoReading | null = null;
  for (const reading of readings) {
    if (lowest === null || reading.value < lowest.value) lowest = reading;
  }
  return lowest;
}

/** Split a series so renderers never draw a false line across a missing interval. */
export function splitDoReadingsAtGaps(
  readings: readonly DoReading[],
  gaps: readonly DoSignalGap[],
): DoReading[][] {
  const segments: DoReading[][] = [];
  for (const reading of readings) {
    const activeSegment = segments.at(-1);
    const previous = activeSegment?.at(-1);
    const crossesGap =
      previous !== undefined &&
      gaps.some(({ fromHour, toHour }) => previous.hour < toHour && reading.hour > fromHour);
    if (activeSegment === undefined || crossesGap) segments.push([reading]);
    else activeSegment.push(reading);
  }
  return segments;
}
