/** Kinds of decorative habitat elements placed on a dive map. */
export type DecorKind = 'coral' | 'rock' | 'seagrass' | 'buoy';

/** A single decorative element placement (level design, not science data). */
export interface DecorPlacement {
  readonly kind: DecorKind;
  readonly x: number;
  readonly y: number;
}

/** A historical camera station the diver must locate (landmark navigation). */
export interface CameraStationPlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly labelEn: string;
  readonly labelZh: string;
}

/** A recordable organism placement used by the Chapter 1 field survey. */
export type SurveySubjectVisual =
  | 'school'
  | 'goby'
  | 'cucumber'
  | 'sponge'
  | 'anemone'
  | 'shrimp';

export interface SurveySubjectPlacement {
  readonly id: string;
  readonly speciesId: string;
  readonly x: number;
  readonly y: number;
  readonly visual: SurveySubjectVisual;
  readonly depthZone: 'surface' | 'mid' | 'bottom';
}

/** The renderable layout for a single location's dive. */
export interface DiveMap {
  readonly locationId: string;
  readonly decor: readonly DecorPlacement[];
  readonly cameraStations: readonly CameraStationPlacement[];
  readonly subjects: readonly SurveySubjectPlacement[];
}
