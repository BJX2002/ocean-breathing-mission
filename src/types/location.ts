import type { DepthZone } from './common';

/** Narrative/gameplay role a location plays in the campaign. */
export type LocationType = 'reference' | 'monitoring' | 'extension';

export interface Location {
  readonly id: string;
  readonly nameEn: string;
  readonly nameZh: string;
  readonly type: LocationType;
  /**
   * All in-game locations are fictional composites for government-presentation
   * safety. See docs/SCIENCE_RULES.md.
   */
  readonly isFictionalComposite: boolean;
  readonly depthZones: readonly DepthZone[];
  readonly descriptionEn: string;
  readonly descriptionZh: string;
}
