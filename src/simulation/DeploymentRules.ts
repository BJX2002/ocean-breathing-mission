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
  /** At least one supported placement records automatically across the day. */
  readonly continuousRecording: boolean;
  /** Every required location has continuous, depth-compatible coverage. */
  readonly allLocationsCovered: boolean;
  /** Continuous placements cover the scenario's required number of depth zones. */
  readonly multipleDepthsCovered: boolean;
  /** A budget-compliant continuous placement covers the hidden event point. */
  readonly eventDetected: boolean;
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
  readonly unsupportedPlacements: readonly DeploymentPlacement[];
  readonly goals: DeploymentGoals;
  /** True only when every visible gameplay goal is satisfied. */
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

/** Purchase plus the one-round maintenance cost used by the DEMO game. */
export function deploymentCost(sensor: Sensor): number {
  return sensor.unitCost + sensor.maintenanceCost;
}

export function totalDeploymentCost(placements: readonly DeploymentPlacement[]): number {
  return placements.reduce((total, placement) => total + deploymentCost(placement.sensor), 0);
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
  const minimumDepthZones = Math.max(0, Math.floor(scenario.minimumDepthZones));

  const goals: DeploymentGoals = {
    continuousRecording: continuousPlacements.length > 0,
    allLocationsCovered: requiredLocationIds.every((locationId) =>
      coveredLocationSet.has(locationId),
    ),
    multipleDepthsCovered: coveredDepthSet.size >= minimumDepthZones,
    eventDetected:
      withinBudget &&
      continuousPlacements.some((placement) =>
        placementCoversEvent(placement, scenario.eventPoint),
      ),
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
    unsupportedPlacements,
    goals,
    success: Object.values(goals).every(Boolean),
  };
}
