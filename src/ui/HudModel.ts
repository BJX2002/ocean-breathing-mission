export interface HudStationProgress {
  readonly ordinal: number;
  readonly displayName: string;
  readonly photographed: boolean;
  readonly nearby: boolean;
}

/**
 * Select the station that should be represented by the compact mission HUD.
 * Nearby incomplete work takes priority; otherwise the first incomplete
 * station remains the player's next clear objective.
 */
export function selectCurrentStation(
  stations: readonly HudStationProgress[],
): HudStationProgress | null {
  const incomplete = stations.filter((station) => !station.photographed);
  if (incomplete.length === 0) return null;
  return incomplete.find((station) => station.nearby) ?? incomplete[0] ?? null;
}

export type HudInteractionKind = 'station' | 'subject' | 'vessel';

export interface HudInteraction {
  readonly kind: HudInteractionKind;
  readonly key: string;
  readonly label: string;
}

/**
 * Keep one contextual prompt visible at a time. The order mirrors the
 * existing gameplay action priority in DiveScene.
 */
export function chooseHudInteraction(
  station: HudInteraction | null,
  subject: HudInteraction | null,
  vessel: HudInteraction | null,
): HudInteraction | null {
  return station ?? subject ?? vessel;
}
