/**
 * Depth zones used across the game world. Kept intentionally coarse for a
 * teaching model (see docs/SCIENCE_RULES.md).
 */
export type DepthZone = 'surface' | 'mid' | 'bottom';

/** Time-of-day buckets used by oxygen scenarios. */
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
