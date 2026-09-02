import type { DepthZone } from './common';

/**
 * Monitoring device categories (Chapter 2). Costs and performance are
 * placeholders and MUST be replaced with verified product data before any
 * public/government demo. See docs/SCIENCE_RULES.md.
 */
export type SensorCategory =
  | 'vessel-sampling'
  | 'handheld'
  | 'fixed-probe'
  | 'sensing-film'
  | 'gateway';

export interface Sensor {
  readonly id: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly category: SensorCategory;
  /** Placeholder purchase cost (game currency). */
  readonly unitCost: number;
  /** Placeholder recurring maintenance cost (game currency). */
  readonly maintenanceCost: number;
  /** Minutes between samples; 0 means single/manual reading. */
  readonly samplingIntervalMinutes: number;
  readonly maxDepthZone: DepthZone;
  readonly continuous: boolean;
  readonly wireless: boolean;
}
