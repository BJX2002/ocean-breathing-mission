import type { DepthZone, TimeOfDay } from './common';

/** Severity tier for a teaching alert band. */
export type AlertSeverity = 'normal' | 'warning' | 'severe';

/**
 * A teaching alert band. `minMgPerL`/`maxMgPerL` may be null to represent an
 * open-ended bound (e.g. ">= 4" or "< 2"). These are teaching bands, NOT
 * universal safety thresholds. See docs/SCIENCE_RULES.md.
 */
export interface AlertBand {
  readonly id: string;
  readonly labelEn: string;
  readonly labelZh: string;
  readonly minMgPerL: number | null;
  readonly maxMgPerL: number | null;
  readonly severity: AlertSeverity;
}

/** A single simulated dissolved-oxygen reading at a depth and time. */
export interface OxygenReading {
  readonly depthZone: DepthZone;
  readonly timeOfDay: TimeOfDay;
  readonly doMgPerL: number;
}

/**
 * An educational-simulation oxygen scenario. This is NOT real-time data for any
 * named site. See docs/SCIENCE_RULES.md.
 */
export interface OxygenScenario {
  readonly id: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly descriptionEn: string;
  readonly descriptionZh: string;
  readonly readings: readonly OxygenReading[];
}

/** Top-level shape of oxygenScenarios.json. */
export interface OxygenData {
  readonly alertBands: readonly AlertBand[];
  readonly scenarios: readonly OxygenScenario[];
}
