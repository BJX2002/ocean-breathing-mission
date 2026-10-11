import type { DepthZone, Sensor, TimeOfDay } from '../types';

/**
 * The deployment values are a teaching-game model only. Costs, sampling
 * intervals, and coverage outcomes must not be presented as product claims.
 */
export const DEPLOYMENT_DATA_BASIS = 'demo-game-values' as const;

/** Teaching threshold used by both the chart and the deployment animation. */
export const DEMO_LOW_OXYGEN_THRESHOLD_MG_L = 4;

export const DEPTH_ZONE_ORDER: readonly DepthZone[] = ['surface', 'mid', 'bottom'];

export const DEMO_LOCATION_IDS = ['entrance', 'raft', 'inner'] as const;

export interface DeploymentPoint {
  readonly locationId: string;
  readonly depthZone: DepthZone;
}

export interface DeploymentPlacement extends DeploymentPoint {
  readonly sensor: Sensor;
}

export interface MonitoringEventPoint extends DeploymentPoint {
  readonly timeOfDay: TimeOfDay;
}

export interface DeploymentScenario {
  readonly budget: number;
  readonly requiredLocationIds: readonly string[];
  readonly minimumDepthZones: number;
  readonly eventPoint: MonitoringEventPoint;
}

export interface DeploymentGoals {
  /** Every location-by-depth point in the 3-by-3 mission grid has a tool. */
  readonly allPointsCovered: boolean;
  /** Every point keeps a complete continuous record with no missing interval. */
  readonly completeDataAtAllPoints: boolean;
  readonly withinBudget: boolean;
}

export interface DeploymentEvaluation {
  readonly dataBasis: typeof DEPLOYMENT_DATA_BASIS;
  readonly totalCost: number;
  readonly remainingBudget: number;
  readonly coveredLocationIds: readonly string[];
  readonly coveredDepthZones: readonly DepthZone[];
  readonly operationalPlacementCount: number;
  readonly continuousPlacementCount: number;
  readonly coveredPointCount: number;
  readonly completePointCount: number;
  readonly unsupportedPlacements: readonly DeploymentPlacement[];
  readonly goals: DeploymentGoals;
  /** True only when every visible gameplay goal is satisfied. */
  readonly success: boolean;
}

/** How much time information a deployed tool actually recorded in one grid cell. */
export type DeploymentRecordMode = 'unmonitored' | 'manual' | 'continuous' | 'unsupported';

export interface DeploymentDoReading {
  readonly hour: number;
  readonly value: number;
}

export interface DeploymentSignalGap {
  readonly fromHour: number;
  readonly toHour: number;
  readonly reason: 'biofouling';
}

/**
 * One cell from a completed 24-hour run. Unmonitored cells are kept in the
 * snapshot so the result screen can show data gaps without inventing values.
 */
export interface DeploymentCellRecord extends DeploymentPoint {
  readonly gridIndex: number;
  readonly sensorId: string | null;
  readonly mode: DeploymentRecordMode;
  readonly readings: readonly DeploymentDoReading[];
  readonly signalGaps: readonly DeploymentSignalGap[];
  readonly lowOxygenDetected: boolean;
}

/** Immutable input for the deployment result screen. */
export interface DeploymentRunSnapshot {
  readonly dataBasis: typeof DEPLOYMENT_DATA_BASIS;
  readonly evaluation: DeploymentEvaluation;
  readonly cells: readonly DeploymentCellRecord[];
  /** True when an actually recorded value—not an unseen scenario value—is low. */
  readonly eventDetected: boolean;
  /** Kept separate from detection because coverage and budget are also goals. */
  readonly success: boolean;
}

/**
 * Default values for the Chapter 2 teaching scenario. These are deliberately
 * marked DEMO and do not represent a quotation, product price, or field claim.
 */
export const DEMO_DEPLOYMENT_SCENARIO: DeploymentScenario = {
  budget: 3600,
  requiredLocationIds: DEMO_LOCATION_IDS,
  minimumDepthZones: 2,
  eventPoint: {
    locationId: 'raft',
    depthZone: 'bottom',
    timeOfDay: 'dawn',
  },
};

/** Sampling times shown in the teaching game's continuous 24-hour record. */
export const DEMO_CONTINUOUS_RECORD_HOURS = [
  0, 2, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24,
] as const;

/** The vessel returns once in the afternoon in this teaching scenario. */
export const DEMO_MANUAL_SAMPLE_HOUR = 14;

/**
 * Educational comparison event for a conventional fixed probe. It illustrates
 * that biological growth can interrupt a signal; it is not a failure-rate claim.
 */
export const DEMO_FIXED_PROBE_SIGNAL_GAP: DeploymentSignalGap = {
  fromHour: 9,
  toHour: 13,
  reason: 'biofouling',
};

export function demoSignalGapsForSensor(sensor: Sensor): readonly DeploymentSignalGap[] {
  return sensor.id === 'fixed-probe' ? [DEMO_FIXED_PROBE_SIGNAL_GAP] : [];
}

export function demoSensorHasSignalAtHour(sensor: Sensor, hour: number): boolean {
  return !demoSignalGapsForSensor(sensor).some((gap) => hour >= gap.fromHour && hour <= gap.toHour);
}

/** Up-front deployment cost used by the DEMO game. Repairs are charged later. */
export function deploymentCost(sensor: Sensor): number {
  return sensor.unitCost;
}

export function totalDeploymentCost(placements: readonly DeploymentPlacement[]): number {
  const chargedPlacements = new Set<string>();
  let total = 0;
  placements.forEach((placement) => {
    // One vessel visit samples all three depths in the selected location, so
    // its three covered cells are one paid trip rather than three boats.
    const key =
      placement.sensor.id === 'vessel-sampling'
        ? `${placement.sensor.id}:${placement.locationId}`
        : `${placement.sensor.id}:${placement.locationId}:${placement.depthZone}`;
    if (chargedPlacements.has(key)) return;
    chargedPlacements.add(key);
    total += deploymentCost(placement.sensor);
  });
  return total;
}

/** Repair cost paid after a conventional probe loses its signal. */
export function repairCost(sensor: Sensor): number {
  return sensor.id === 'fixed-probe' ? sensor.maintenanceCost : 0;
}

/** A device may be placed at its maximum supported zone or any shallower zone. */
export function sensorSupportsDepth(sensor: Sensor, targetDepth: DepthZone): boolean {
  const maximumDepth = DEPTH_ZONE_ORDER.indexOf(sensor.maxDepthZone);
  const target = DEPTH_ZONE_ORDER.indexOf(targetDepth);
  return maximumDepth >= 0 && target >= 0 && target <= maximumDepth;
}

/**
 * Manual/single-reading tools never count as 24-hour coverage, even when a
 * malformed data record gives them a positive sampling interval.
 */
export function providesContinuousCoverage(sensor: Sensor): boolean {
  return sensor.continuous && sensor.samplingIntervalMinutes > 0;
}

/** A complete day must be continuous and contain no simulated signal gap. */
export function providesCompleteDayRecord(sensor: Sensor): boolean {
  return providesContinuousCoverage(sensor) && demoSignalGapsForSensor(sensor).length === 0;
}

export function placementCoversEvent(
  placement: DeploymentPlacement,
  eventPoint: MonitoringEventPoint,
): boolean {
  return (
    placement.locationId === eventPoint.locationId &&
    placement.depthZone === eventPoint.depthZone &&
    sensorSupportsDepth(placement.sensor, placement.depthZone) &&
    providesContinuousCoverage(placement.sensor)
  );
}

/**
 * Convert the Chapter 2 row-major 3-depth grid into a rules-layer placement.
 * Returns null for an invalid cell instead of inventing a location or depth.
 */
export function gridPlacement(
  gridIndex: number,
  sensor: Sensor,
  locationIds: readonly string[] = DEMO_LOCATION_IDS,
): DeploymentPlacement | null {
  if (!Number.isInteger(gridIndex) || gridIndex < 0 || locationIds.length === 0) return null;
  const depthZone = DEPTH_ZONE_ORDER[Math.floor(gridIndex / locationIds.length)];
  const locationId = locationIds[gridIndex % locationIds.length];
  if (depthZone === undefined || locationId === undefined) return null;
  return { locationId, depthZone, sensor };
}

/**
 * Fictional DO values for the 3-by-3 deployment preview. This function and
 * `DEMO_DEPLOYMENT_SCENARIO.eventPoint` deliberately describe the same single
 * low-oxygen event, so the picture never contradicts the win condition.
 */
export function demoDoValueAtGridIndex(gridIndex: number, hour: number): number | null {
  const columnCount = DEMO_LOCATION_IDS.length;
  const rowCount = DEPTH_ZONE_ORDER.length;
  if (
    !Number.isInteger(gridIndex) ||
    gridIndex < 0 ||
    gridIndex >= columnCount * rowCount ||
    !Number.isFinite(hour)
  ) {
    return null;
  }

  const row = Math.floor(gridIndex / columnCount);
  const column = gridIndex % columnCount;
  const baseByDepth = [7.3, 6.5, 5.9] as const;
  const eventImpactByDepth = [0.22, 1.12, 2.65] as const;
  // Only the raft near-bed cell crosses the teaching threshold at dawn.
  const eventImpactByLocation = [0.62, 1, 0.68] as const;
  const base = baseByDepth[row];
  const depthImpact = eventImpactByDepth[row];
  const locationImpact = eventImpactByLocation[column];
  if (base === undefined || depthImpact === undefined || locationImpact === undefined) return null;

  const boundedHour = Math.min(24, Math.max(0, hour));
  const dawnEvent = Math.exp(-Math.pow(boundedHour - 5, 2) / 10);
  const value = base - dawnEvent * depthImpact * locationImpact;
  return Math.min(8.5, Math.max(1.8, value));
}

export function evaluateDeployment(
  placements: readonly DeploymentPlacement[],
  scenario: DeploymentScenario = DEMO_DEPLOYMENT_SCENARIO,
): DeploymentEvaluation {
  const totalCost = totalDeploymentCost(placements);
  const withinBudget = Number.isFinite(scenario.budget) && totalCost <= scenario.budget;
  const operationalPlacements = placements.filter((placement) =>
    sensorSupportsDepth(placement.sensor, placement.depthZone),
  );
  const continuousPlacements = operationalPlacements.filter((placement) =>
    providesContinuousCoverage(placement.sensor),
  );
  const unsupportedPlacements = placements.filter(
    (placement) => !sensorSupportsDepth(placement.sensor, placement.depthZone),
  );
  const coveredLocationSet = new Set(continuousPlacements.map((placement) => placement.locationId));
  const coveredDepthSet = new Set(continuousPlacements.map((placement) => placement.depthZone));
  const requiredLocationIds = [...new Set(scenario.requiredLocationIds)];
  const requiredPointKeys = new Set(
    requiredLocationIds.flatMap((locationId) =>
      DEPTH_ZONE_ORDER.map((depthZone) => `${locationId}:${depthZone}`),
    ),
  );
  const operationalPointKeys = new Set(
    operationalPlacements.map(({ locationId, depthZone }) => `${locationId}:${depthZone}`),
  );
  const completePointKeys = new Set(
    operationalPlacements
      .filter(({ sensor }) => providesCompleteDayRecord(sensor))
      .map(({ locationId, depthZone }) => `${locationId}:${depthZone}`),
  );
  const coveredPointCount = [...requiredPointKeys].filter((key) =>
    operationalPointKeys.has(key),
  ).length;
  const completePointCount = [...requiredPointKeys].filter((key) =>
    completePointKeys.has(key),
  ).length;

  const goals: DeploymentGoals = {
    allPointsCovered: coveredPointCount === requiredPointKeys.size,
    completeDataAtAllPoints: completePointCount === requiredPointKeys.size,
    withinBudget,
  };

  return {
    dataBasis: DEPLOYMENT_DATA_BASIS,
    totalCost,
    remainingBudget: scenario.budget - totalCost,
    coveredLocationIds: [...coveredLocationSet],
    coveredDepthZones: DEPTH_ZONE_ORDER.filter((depth) => coveredDepthSet.has(depth)),
    operationalPlacementCount: operationalPlacements.length,
    continuousPlacementCount: continuousPlacements.length,
    coveredPointCount,
    completePointCount,
    unsupportedPlacements,
    goals,
    success: Object.values(goals).every(Boolean),
  };
}

/**
 * Capture exactly what the player's current tools could have measured during
 * the run. The result UI must read this snapshot instead of a default curve.
 */
export function createDeploymentRunSnapshot(
  placements: readonly DeploymentPlacement[],
  scenario: DeploymentScenario = DEMO_DEPLOYMENT_SCENARIO,
): DeploymentRunSnapshot {
  const evaluation = evaluateDeployment(placements, scenario);
  const placementByGridIndex = new Map<number, DeploymentPlacement>();

  for (const placement of placements) {
    const column = DEMO_LOCATION_IDS.indexOf(
      placement.locationId as (typeof DEMO_LOCATION_IDS)[number],
    );
    const row = DEPTH_ZONE_ORDER.indexOf(placement.depthZone);
    if (column < 0 || row < 0) continue;
    placementByGridIndex.set(row * DEMO_LOCATION_IDS.length + column, placement);
  }

  const cells: DeploymentCellRecord[] = [];
  const cellCount = DEMO_LOCATION_IDS.length * DEPTH_ZONE_ORDER.length;
  for (let gridIndex = 0; gridIndex < cellCount; gridIndex += 1) {
    const column = gridIndex % DEMO_LOCATION_IDS.length;
    const row = Math.floor(gridIndex / DEMO_LOCATION_IDS.length);
    const locationId = DEMO_LOCATION_IDS[column];
    const depthZone = DEPTH_ZONE_ORDER[row];
    if (locationId === undefined || depthZone === undefined) continue;

    const placement = placementByGridIndex.get(gridIndex);
    if (placement === undefined) {
      cells.push({
        gridIndex,
        locationId,
        depthZone,
        sensorId: null,
        mode: 'unmonitored',
        readings: [],
        signalGaps: [],
        lowOxygenDetected: false,
      });
      continue;
    }

    if (!sensorSupportsDepth(placement.sensor, placement.depthZone)) {
      cells.push({
        gridIndex,
        locationId,
        depthZone,
        sensorId: placement.sensor.id,
        mode: 'unsupported',
        readings: [],
        signalGaps: [],
        lowOxygenDetected: false,
      });
      continue;
    }

    const mode: DeploymentRecordMode = providesContinuousCoverage(placement.sensor)
      ? 'continuous'
      : 'manual';
    const signalGaps = mode === 'continuous' ? demoSignalGapsForSensor(placement.sensor) : [];
    const hours = mode === 'continuous' ? DEMO_CONTINUOUS_RECORD_HOURS : [DEMO_MANUAL_SAMPLE_HOUR];
    const readings = hours
      .filter((hour) => demoSensorHasSignalAtHour(placement.sensor, hour))
      .flatMap((hour) => {
        const value = demoDoValueAtGridIndex(gridIndex, hour);
        return value === null ? [] : [{ hour, value }];
      });
    cells.push({
      gridIndex,
      locationId,
      depthZone,
      sensorId: placement.sensor.id,
      mode,
      readings,
      signalGaps,
      lowOxygenDetected: readings.some((reading) => reading.value < DEMO_LOW_OXYGEN_THRESHOLD_MG_L),
    });
  }

  const eventDetected = cells.some((cell) => cell.lowOxygenDetected);
  return {
    dataBasis: DEPLOYMENT_DATA_BASIS,
    evaluation,
    cells,
    eventDetected,
    success: evaluation.success,
  };
}
