import type {
  AbundanceCategory,
  AlertSeverity,
  Chapter,
  DepthZone,
  EquipmentCategory,
  FunctionalGroup,
  LocationType,
  Mobility,
  OxygenTolerance,
  SensorCategory,
  SurveyStatus,
  TimeOfDay,
} from '../types';

/** Thrown when loaded JSON data fails runtime validation. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/* ------------------------------------------------------------------ */
/* Low-level primitive guards                                          */
/* ------------------------------------------------------------------ */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

export function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Allowed enum values (single source of truth for validation)         */
/* ------------------------------------------------------------------ */

const DEPTH_ZONES: readonly DepthZone[] = ['surface', 'mid', 'bottom'];
const TIMES_OF_DAY: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
const FUNCTIONAL_GROUPS: readonly FunctionalGroup[] = [
  'strongly-mobile-fish',
  'habitat-associated-fish',
  'benthic-invertebrate',
  'tolerant-organism',
];
const ABUNDANCE: readonly AbundanceCategory[] = ['abundant', 'common', 'occasional', 'rare'];
const MOBILITY: readonly Mobility[] = ['high', 'medium', 'low'];
const OXYGEN_TOLERANCE: readonly OxygenTolerance[] = ['low', 'moderate', 'high'];
const SURVEY_STATUS: readonly SurveyStatus[] = [
  'still-observed',
  'less-frequently-observed',
  'shifted-distribution',
  'not-observed',
];
const LOCATION_TYPES: readonly LocationType[] = ['reference', 'monitoring', 'extension'];
const EQUIPMENT_CATEGORIES: readonly EquipmentCategory[] = [
  'photography',
  'navigation',
  'scanning',
  'sampling',
];
const SENSOR_CATEGORIES: readonly SensorCategory[] = [
  'vessel-sampling',
  'handheld',
  'fixed-probe',
  'sensing-film',
  'gateway',
];
const ALERT_SEVERITIES: readonly AlertSeverity[] = ['normal', 'warning', 'severe'];
const CHAPTERS: readonly Chapter[] = [1, 2];

export {
  DEPTH_ZONES,
  TIMES_OF_DAY,
  FUNCTIONAL_GROUPS,
  ABUNDANCE,
  MOBILITY,
  OXYGEN_TOLERANCE,
  SURVEY_STATUS,
  LOCATION_TYPES,
  EQUIPMENT_CATEGORIES,
  SENSOR_CATEGORIES,
  ALERT_SEVERITIES,
  CHAPTERS,
};

/* ------------------------------------------------------------------ */
/* Generic helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Validate an unknown value as an array of `T` using a per-item guard.
 * Throws {@link ValidationError} with a descriptive path on the first failure.
 */
export function validateArray<T>(
  raw: unknown,
  itemName: string,
  guard: (item: unknown, index: number) => item is T,
): T[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError(`Expected "${itemName}" data to be an array.`);
  }
  const result: T[] = [];
  raw.forEach((item, index) => {
    if (!guard(item, index)) {
      throw new ValidationError(
        `Invalid ${itemName} at index ${index}: ${JSON.stringify(item)}`,
      );
    }
    result.push(item);
  });
  return result;
}
