import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DAWN_DIP_SERIES,
  findLowestDoReading,
  normalizeDoReadings,
  splitDoReadingsAtGaps,
} from '../src/ui/DoTimelineModel';

describe('DO timeline teaching data', () => {
  it('contains a detectable pre-dawn dip', () => {
    const lowest = findLowestDoReading(DEFAULT_DAWN_DIP_SERIES);

    expect(lowest).toEqual({ hour: 5, value: 2.7 });
    expect(DEFAULT_DAWN_DIP_SERIES[0]?.value).toBeGreaterThan(4);
    expect(DEFAULT_DAWN_DIP_SERIES.at(-1)?.value).toBeGreaterThan(4);
  });

  it('orders and clamps readings to the 24-hour teaching chart', () => {
    expect(
      normalizeDoReadings([
        { hour: 26, value: 10 },
        { hour: -2, value: -1 },
        { hour: 5, value: 2.7 },
      ]),
    ).toEqual([
      { hour: 0, value: 0 },
      { hour: 5, value: 2.7 },
      { hour: 24, value: 8 },
    ]);
  });

  it('ignores non-finite data and handles an empty series', () => {
    expect(normalizeDoReadings([{ hour: Number.NaN, value: 3 }])).toEqual([]);
    expect(findLowestDoReading([])).toBeNull();
  });

  it('splits a line around a missing signal interval instead of drawing through it', () => {
    const readings = [
      { hour: 6, value: 4.8 },
      { hour: 8, value: 5.1 },
      { hour: 14, value: 5.9 },
      { hour: 16, value: 5.7 },
    ];

    expect(splitDoReadingsAtGaps(readings, [{ fromHour: 9, toHour: 13 }])).toEqual([
      readings.slice(0, 2),
      readings.slice(2),
    ]);
  });
});
