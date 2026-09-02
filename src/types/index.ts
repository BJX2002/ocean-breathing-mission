export * from './common';
export * from './species';
export * from './location';
export * from './mission';
export * from './equipment';
export * from './sensor';
export * from './oxygenScenario';
export * from './diveMap';

import type { Species } from './species';
import type { Location } from './location';
import type { Mission } from './mission';
import type { Equipment } from './equipment';
import type { Sensor } from './sensor';
import type { OxygenData } from './oxygenScenario';
import type { DiveMap } from './diveMap';

/** Fully validated game data set, produced by the DataLoader service. */
export interface GameData {
  readonly species: readonly Species[];
  readonly locations: readonly Location[];
  readonly missions: readonly Mission[];
  readonly equipment: readonly Equipment[];
  readonly sensors: readonly Sensor[];
  readonly oxygen: OxygenData;
  readonly diveMaps: readonly DiveMap[];
}
