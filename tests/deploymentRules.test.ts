import { describe, expect, it } from 'vitest';
import sensorsData from '../src/data/sensors.json';
import {
  DEMO_DEPLOYMENT_SCENARIO,
  DEMO_FIXED_PROBE_SIGNAL_GAP,
  DEMO_LOW_OXYGEN_THRESHOLD_MG_L,
  DEPLOYMENT_DATA_BASIS,
  createDeploymentRunSnapshot,
  demoSensorHasSignalAtHour,
  demoDoValueAtGridIndex,
  deploymentCost,
  evaluateDeployment,
  gridPlacement,
  placementCoversEvent,
  providesCompleteDayRecord,
  providesContinuousCoverage,
  repairCost,
  sensorSupportsDepth,
  totalDeploymentCost,
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
  it('uses clear teaching prices and charges repairs separately', () => {
    expect(deploymentCost(vessel)).toBe(2100);
    expect(deploymentCost(sensingFilm)).toBe(350);
    expect(deploymentCost(fixedProbe)).toBe(420);
    expect(repairCost(fixedProbe)).toBe(120);
    expect(repairCost(sensingFilm)).toBe(0);
  });

  it('does not treat vessel or handheld readings as continuous coverage', () => {
    expect(providesContinuousCoverage(vessel)).toBe(false);
    expect(providesContinuousCoverage(handheld)).toBe(false);

    const vesselResult = evaluateDeployment([at('raft', 'bottom', vessel)]);
    const handheldResult = evaluateDeployment([at('raft', 'mid', handheld)], {
      ...DEMO_DEPLOYMENT_SCENARIO,
      eventPoint: { locationId: 'raft', depthZone: 'mid', timeOfDay: 'dawn' },
    });

    expect(vesselResult.goals.completeDataAtAllPoints).toBe(false);
    expect(handheldResult.operationalPlacementCount).toBe(1);
    expect(handheldResult.goals.completeDataAtAllPoints).toBe(false);
  });

  it('distinguishes continuous output from a complete uninterrupted record', () => {
    expect(providesContinuousCoverage(fixedProbe)).toBe(true);
    expect(providesCompleteDayRecord(fixedProbe)).toBe(false);
    expect(providesCompleteDayRecord(sensingFilm)).toBe(true);
  });

  it('lets a supported continuous fixed probe or sensing-film node cover the event point', () => {
    for (const device of [fixedProbe, sensingFilm]) {
      const placement = at('raft', 'bottom', device);
      expect(placementCoversEvent(placement, DEMO_DEPLOYMENT_SCENARIO.eventPoint)).toBe(true);
    }
  });

  it('misses the event at the wrong location or depth', () => {
    expect(
      placementCoversEvent(at('inner', 'bottom', sensingFilm), DEMO_DEPLOYMENT_SCENARIO.eventPoint),
    ).toBe(false);
    expect(
      placementCoversEvent(at('raft', 'mid', sensingFilm), DEMO_DEPLOYMENT_SCENARIO.eventPoint),
    ).toBe(false);
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
  const allNine = (device: Sensor): readonly DeploymentPlacement[] =>
    ['entrance', 'raft', 'inner'].flatMap((locationId) =>
      (['surface', 'mid', 'bottom'] as const).map((depthZone) => at(locationId, depthZone, device)),
    );
  const successfulFilmNetwork = allNine(sensingFilm);

  it('passes only when all nine points have complete data within budget', () => {
    const result = evaluateDeployment(successfulFilmNetwork);

    expect(result.dataBasis).toBe(DEPLOYMENT_DATA_BASIS);
    expect(result.totalCost).toBe(3150);
    expect(result.remainingBudget).toBe(450);
    expect(result.coveredPointCount).toBe(9);
    expect(result.completePointCount).toBe(9);
    expect(result.goals).toEqual({
      allPointsCovered: true,
      completeDataAtAllPoints: true,
      withinBudget: true,
    });
    expect(result.success).toBe(true);
  });

  it('does not pass when even one of the nine points is missing', () => {
    const result = evaluateDeployment([...successfulFilmNetwork.slice(0, 8)]);

    expect(result.coveredPointCount).toBe(8);
    expect(result.completePointCount).toBe(8);
    expect(result.goals.allPointsCovered).toBe(false);
    expect(result.goals.completeDataAtAllPoints).toBe(false);
    expect(result.success).toBe(false);
  });

  it('fails a nine-point fixed-probe network for gaps and budget', () => {
    const result = evaluateDeployment(allNine(fixedProbe));

    expect(result.totalCost).toBe(3780);
    expect(result.goals.allPointsCovered).toBe(true);
    expect(result.goals.completeDataAtAllPoints).toBe(false);
    expect(result.goals.withinBudget).toBe(false);
    expect(result.success).toBe(false);
  });

  it('charges one vessel visit once while covering all three depths in its column', () => {
    const vesselColumn = ['surface', 'mid', 'bottom'].map((depthZone) =>
      at('raft', depthZone as DeploymentPlacement['depthZone'], vessel),
    );

    expect(totalDeploymentCost(vesselColumn)).toBe(2100);
    const result = evaluateDeployment(vesselColumn);
    expect(result.coveredPointCount).toBe(3);
    expect(result.completePointCount).toBe(0);
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

describe('24-hour deployment run snapshots', () => {
  it('records one 14:00 point for a vessel and never fills the missing hours', () => {
    const snapshot = createDeploymentRunSnapshot([at('raft', 'bottom', vessel)]);
    const cell = snapshot.cells[7];

    expect(cell?.mode).toBe('manual');
    expect(cell?.readings).toHaveLength(1);
    expect(cell?.readings[0]).toEqual({
      hour: 14,
      value: demoDoValueAtGridIndex(7, 14),
    });
    expect(snapshot.eventDetected).toBe(false);
    expect(snapshot.success).toBe(false);
  });

  it('records a real 24-hour series only in continuously monitored cells', () => {
    const snapshot = createDeploymentRunSnapshot([
      at('entrance', 'surface', sensingFilm),
      at('raft', 'bottom', sensingFilm),
    ]);
    const surface = snapshot.cells[0];
    const eventCell = snapshot.cells[7];

    expect(surface?.mode).toBe('continuous');
    expect(surface?.readings).toHaveLength(14);
    expect(eventCell?.mode).toBe('continuous');
    expect(eventCell?.readings.find(({ hour }) => hour === 5)?.value).toBe(
      demoDoValueAtGridIndex(7, 5),
    );
    expect(eventCell?.lowOxygenDetected).toBe(true);
    expect(snapshot.eventDetected).toBe(true);
  });

  it('keeps unmonitored near-bed cells empty instead of revealing hidden curves', () => {
    const snapshot = createDeploymentRunSnapshot([at('raft', 'surface', fixedProbe)]);
    const nearBedCells = snapshot.cells.filter(({ depthZone }) => depthZone === 'bottom');

    expect(nearBedCells).toHaveLength(3);
    expect(nearBedCells.every(({ mode }) => mode === 'unmonitored')).toBe(true);
    expect(nearBedCells.every(({ readings }) => readings.length === 0)).toBe(true);
    expect(snapshot.eventDetected).toBe(false);
  });

  it('reports a detected event even when the overall plan fails another goal', () => {
    const snapshot = createDeploymentRunSnapshot([at('raft', 'bottom', fixedProbe)]);

    expect(snapshot.eventDetected).toBe(true);
    expect(snapshot.evaluation.goals.allPointsCovered).toBe(false);
    expect(snapshot.evaluation.goals.completeDataAtAllPoints).toBe(false);
    expect(snapshot.success).toBe(false);
  });

  it('models a fixed-probe signal gap without turning missing values into zeroes', () => {
    const fixedSnapshot = createDeploymentRunSnapshot([at('raft', 'bottom', fixedProbe)]);
    const filmSnapshot = createDeploymentRunSnapshot([at('raft', 'bottom', sensingFilm)]);
    const fixedCell = fixedSnapshot.cells[7];
    const filmCell = filmSnapshot.cells[7];

    expect(fixedCell?.signalGaps).toEqual([DEMO_FIXED_PROBE_SIGNAL_GAP]);
    expect(fixedCell?.readings.some(({ hour }) => hour === 10 || hour === 12)).toBe(false);
    expect(fixedCell?.readings.every(({ value }) => value > 0)).toBe(true);
    expect(demoSensorHasSignalAtHour(fixedProbe, 11)).toBe(false);
    expect(filmCell?.signalGaps).toEqual([]);
    expect(filmCell?.readings).toHaveLength(14);
  });
});
