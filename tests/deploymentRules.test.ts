import { describe, expect, it } from 'vitest';
import sensorsData from '../src/data/sensors.json';
import {
  DEMO_DEPLOYMENT_SCENARIO,
  DEMO_LOW_OXYGEN_THRESHOLD_MG_L,
  DEPLOYMENT_DATA_BASIS,
  demoDoValueAtGridIndex,
  deploymentCost,
  evaluateDeployment,
  gridPlacement,
  placementCoversEvent,
  providesContinuousCoverage,
  sensorSupportsDepth,
  type DeploymentPlacement,
} from '../src/simulation/DeploymentRules';
import type { Sensor } from '../src/types';

const sensors = sensorsData as readonly Sensor[];

function sensor(id: string): Sensor {
  const match = sensors.find((candidate) => candidate.id === id);
  if (match === undefined) throw new Error(`Missing fixture sensor: ${id}`);
  return match;
}

const vessel = sensor('vessel-sampling');
const handheld = sensor('handheld-do');
const fixedProbe = sensor('fixed-probe');
const sensingFilm = sensor('sensing-film-node');

function at(
  locationId: string,
  depthZone: DeploymentPlacement['depthZone'],
  device: Sensor,
): DeploymentPlacement {
  return { locationId, depthZone, sensor: device };
}

describe('deployment device rules', () => {
  it('uses purchase plus maintenance as the DEMO round cost', () => {
    expect(deploymentCost(sensingFilm)).toBe(660);
    expect(deploymentCost(fixedProbe)).toBe(1700);
  });

  it('does not treat vessel or handheld readings as continuous coverage', () => {
    expect(providesContinuousCoverage(vessel)).toBe(false);
    expect(providesContinuousCoverage(handheld)).toBe(false);

    const vesselResult = evaluateDeployment([at('raft', 'bottom', vessel)]);
    const handheldResult = evaluateDeployment([at('raft', 'mid', handheld)], {
      ...DEMO_DEPLOYMENT_SCENARIO,
      eventPoint: { locationId: 'raft', depthZone: 'mid', timeOfDay: 'dawn' },
    });

    expect(vesselResult.goals.continuousRecording).toBe(false);
    expect(vesselResult.goals.eventDetected).toBe(false);
    expect(handheldResult.operationalPlacementCount).toBe(1);
    expect(handheldResult.goals.continuousRecording).toBe(false);
    expect(handheldResult.goals.eventDetected).toBe(false);
  });

  it('lets a supported continuous fixed probe or sensing-film node detect the dawn event', () => {
    for (const device of [fixedProbe, sensingFilm]) {
      const placement = at('raft', 'bottom', device);
      expect(placementCoversEvent(placement, DEMO_DEPLOYMENT_SCENARIO.eventPoint)).toBe(true);
      expect(evaluateDeployment([placement]).goals.eventDetected).toBe(true);
    }
  });

  it('misses the event at the wrong location or depth', () => {
    const wrongLocation = evaluateDeployment([at('inner', 'bottom', sensingFilm)]);
    const wrongDepth = evaluateDeployment([at('raft', 'mid', sensingFilm)]);

    expect(wrongLocation.goals.eventDetected).toBe(false);
    expect(wrongDepth.goals.eventDetected).toBe(false);
  });

  it('enforces each sensor maximum depth', () => {
    expect(sensorSupportsDepth(handheld, 'mid')).toBe(true);
    expect(sensorSupportsDepth(handheld, 'bottom')).toBe(false);

    const unsupported = evaluateDeployment([at('raft', 'bottom', handheld)]);
    expect(unsupported.operationalPlacementCount).toBe(0);
    expect(unsupported.unsupportedPlacements).toHaveLength(1);
  });
});

describe('deployment coverage goals', () => {
  const successfulFilmNetwork: readonly DeploymentPlacement[] = [
    at('entrance', 'surface', sensingFilm),
    at('raft', 'bottom', sensingFilm),
    at('inner', 'mid', sensingFilm),
  ];

  it('requires continuous coverage at all three locations, at least two depths, the event, and budget', () => {
    const result = evaluateDeployment(successfulFilmNetwork);

    expect(result.dataBasis).toBe(DEPLOYMENT_DATA_BASIS);
    expect(result.totalCost).toBe(1980);
    expect(result.remainingBudget).toBe(1620);
    expect(result.goals).toEqual({
      continuousRecording: true,
      allLocationsCovered: true,
      multipleDepthsCovered: true,
      eventDetected: true,
      withinBudget: true,
    });
    expect(result.success).toBe(true);
  });

  it('does not pass when a location or the second depth zone is missing', () => {
    const result = evaluateDeployment([
      at('entrance', 'bottom', sensingFilm),
      at('raft', 'bottom', sensingFilm),
    ]);

    expect(result.goals.continuousRecording).toBe(true);
    expect(result.goals.allLocationsCovered).toBe(false);
    expect(result.goals.multipleDepthsCovered).toBe(false);
    expect(result.success).toBe(false);
  });

  it('fails an otherwise complete fixed-probe network when it exceeds the DEMO budget', () => {
    const result = evaluateDeployment([
      at('entrance', 'surface', fixedProbe),
      at('raft', 'bottom', fixedProbe),
      at('inner', 'mid', fixedProbe),
    ]);

    expect(result.totalCost).toBe(5100);
    expect(result.goals.continuousRecording).toBe(true);
    expect(result.goals.allLocationsCovered).toBe(true);
    expect(result.goals.multipleDepthsCovered).toBe(true);
    expect(result.goals.withinBudget).toBe(false);
    expect(result.goals.eventDetected).toBe(false);
    expect(result.success).toBe(false);
  });

  it('maps the existing 3-by-3 grid to location and depth without guessing invalid cells', () => {
    expect(gridPlacement(0, sensingFilm)).toMatchObject({
      locationId: 'entrance',
      depthZone: 'surface',
    });
    expect(gridPlacement(7, sensingFilm)).toMatchObject({
      locationId: 'raft',
      depthZone: 'bottom',
    });
    expect(gridPlacement(9, sensingFilm)).toBeNull();
    expect(gridPlacement(-1, sensingFilm)).toBeNull();
  });

  it('shows only the hidden event cell below the teaching threshold at dawn', () => {
    const lowCells = Array.from({ length: 9 }, (_, index) => index).filter((index) => {
      const value = demoDoValueAtGridIndex(index, 5);
      return value !== null && value < DEMO_LOW_OXYGEN_THRESHOLD_MG_L;
    });

    expect(lowCells).toEqual([7]);
    expect(gridPlacement(lowCells[0] ?? -1, sensingFilm)).toMatchObject({
      locationId: DEMO_DEPLOYMENT_SCENARIO.eventPoint.locationId,
      depthZone: DEMO_DEPLOYMENT_SCENARIO.eventPoint.depthZone,
    });
    expect(demoDoValueAtGridIndex(9, 5)).toBeNull();
  });
});
