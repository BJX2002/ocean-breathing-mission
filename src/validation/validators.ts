import type {
  Equipment,
  GameData,
  Location,
  Mission,
  MissionObjective,
  OxygenData,
  AlertBand,
  OxygenReading,
  OxygenScenario,
  Sensor,
  Species,
  DecorKind,
  DecorPlacement,
  CameraStationPlacement,
  DiveMap,
  SurveySubjectPlacement,
  SurveySubjectVisual,
} from '../types';
import {
  ABUNDANCE,
  ALERT_SEVERITIES,
  CHAPTERS,
  DEPTH_ZONES,
  EQUIPMENT_CATEGORIES,
  FUNCTIONAL_GROUPS,
  LOCATION_TYPES,
  MOBILITY,
  OXYGEN_TOLERANCE,
  SENSOR_CATEGORIES,
  SURVEY_STATUS,
  TIMES_OF_DAY,
  ValidationError,
  isBoolean,
  isFiniteNumber,
  isNumberOrNull,
  isOneOf,
  isRecord,
  isString,
  validateArray,
} from './primitives';

const DECOR_KINDS: readonly DecorKind[] = ['coral', 'rock', 'seagrass', 'buoy'];
const SUBJECT_VISUALS: readonly SurveySubjectVisual[] = [
  'school',
  'goby',
  'cucumber',
  'sponge',
  'anemone',
  'shrimp',
];

/* ------------------------------------------------------------------ */
/* Species                                                             */
/* ------------------------------------------------------------------ */

export function isSpecies(value: unknown): value is Species {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.nameEn) &&
    isString(value.nameZh) &&
    isOneOf(value.functionalGroup, FUNCTIONAL_GROUPS) &&
    isOneOf(value.abundanceCategory, ABUNDANCE) &&
    isOneOf(value.mobility, MOBILITY) &&
    isOneOf(value.preferredDepthZone, DEPTH_ZONES) &&
    isOneOf(value.oxygenTolerance, OXYGEN_TOLERANCE) &&
    isOneOf(value.surveyStatus, SURVEY_STATUS)
  );
}

export const validateSpecies = (raw: unknown): Species[] =>
  validateArray(raw, 'species', isSpecies);

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export function isLocation(value: unknown): value is Location {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.depthZones)) return false;
  const zonesOk = value.depthZones.every((z) => isOneOf(z, DEPTH_ZONES));
  return (
    isString(value.id) &&
    isString(value.nameEn) &&
    isString(value.nameZh) &&
    isOneOf(value.type, LOCATION_TYPES) &&
    isBoolean(value.isFictionalComposite) &&
    zonesOk &&
    isString(value.descriptionEn) &&
    isString(value.descriptionZh)
  );
}

export const validateLocations = (raw: unknown): Location[] =>
  validateArray(raw, 'location', isLocation);

/* ------------------------------------------------------------------ */
/* Mission                                                             */
/* ------------------------------------------------------------------ */

function isMissionObjective(value: unknown): value is MissionObjective {
  if (!isRecord(value)) return false;
  return isString(value.id) && isString(value.textEn) && isString(value.textZh);
}

// Chapter is numeric (1 | 2); handle separately from the string enums.
export function isMission(value: unknown): value is Mission {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.objectives)) return false;
  const objectivesOk = value.objectives.every(isMissionObjective);
  const chapterOk =
    typeof value.chapter === 'number' && (CHAPTERS as readonly number[]).includes(value.chapter);
  return (
    isString(value.id) &&
    isString(value.titleEn) &&
    isString(value.titleZh) &&
    isString(value.locationId) &&
    chapterOk &&
    objectivesOk &&
    isFiniteNumber(value.oxygenBudget) &&
    isFiniteNumber(value.timeLimitSeconds)
  );
}

export const validateMissions = (raw: unknown): Mission[] =>
  validateArray(raw, 'mission', isMission);

/* ------------------------------------------------------------------ */
/* Equipment                                                           */
/* ------------------------------------------------------------------ */

export function isEquipment(value: unknown): value is Equipment {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.nameEn) &&
    isString(value.nameZh) &&
    isOneOf(value.category, EQUIPMENT_CATEGORIES) &&
    isFiniteNumber(value.slotCost) &&
    isFiniteNumber(value.batteryDrainPerSecond) &&
    isString(value.descriptionEn) &&
    isString(value.descriptionZh)
  );
}

export const validateEquipment = (raw: unknown): Equipment[] =>
  validateArray(raw, 'equipment', isEquipment);

/* ------------------------------------------------------------------ */
/* Sensor                                                              */
/* ------------------------------------------------------------------ */

export function isSensor(value: unknown): value is Sensor {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.nameEn) &&
    isString(value.nameZh) &&
    isOneOf(value.category, SENSOR_CATEGORIES) &&
    isFiniteNumber(value.unitCost) &&
    isFiniteNumber(value.maintenanceCost) &&
    isFiniteNumber(value.samplingIntervalMinutes) &&
    isOneOf(value.maxDepthZone, DEPTH_ZONES) &&
    isBoolean(value.continuous) &&
    isBoolean(value.wireless)
  );
}

export const validateSensors = (raw: unknown): Sensor[] =>
  validateArray(raw, 'sensor', isSensor);

/* ------------------------------------------------------------------ */
/* Oxygen data                                                         */
/* ------------------------------------------------------------------ */

function isAlertBand(value: unknown): value is AlertBand {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.labelEn) &&
    isString(value.labelZh) &&
    isNumberOrNull(value.minMgPerL) &&
    isNumberOrNull(value.maxMgPerL) &&
    isOneOf(value.severity, ALERT_SEVERITIES)
  );
}

function isOxygenReading(value: unknown): value is OxygenReading {
  if (!isRecord(value)) return false;
  return (
    isOneOf(value.depthZone, DEPTH_ZONES) &&
    isOneOf(value.timeOfDay, TIMES_OF_DAY) &&
    isFiniteNumber(value.doMgPerL)
  );
}

function isOxygenScenario(value: unknown): value is OxygenScenario {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.readings)) return false;
  const readingsOk = value.readings.every(isOxygenReading);
  return (
    isString(value.id) &&
    isString(value.nameEn) &&
    isString(value.nameZh) &&
    isString(value.descriptionEn) &&
    isString(value.descriptionZh) &&
    readingsOk
  );
}

export function validateOxygenData(raw: unknown): OxygenData {
  if (!isRecord(raw)) {
    throw new ValidationError('Expected "oxygen" data to be an object.');
  }
  const alertBands = validateArray(raw.alertBands, 'alertBand', isAlertBand);
  const scenarios = validateArray(raw.scenarios, 'oxygenScenario', isOxygenScenario);
  return { alertBands, scenarios };
}

/* ------------------------------------------------------------------ */
/* Dive maps                                                           */
/* ------------------------------------------------------------------ */

function isDecorPlacement(value: unknown): value is DecorPlacement {
  if (!isRecord(value)) return false;
  return (
    isOneOf(value.kind, DECOR_KINDS) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
  );
}

function isCameraStationPlacement(value: unknown): value is CameraStationPlacement {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isString(value.labelEn) &&
    isString(value.labelZh)
  );
}

function isSurveySubjectPlacement(value: unknown): value is SurveySubjectPlacement {
  if (!isRecord(value)) return false;
  return (
    isString(value.id) &&
    isString(value.speciesId) &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isOneOf(value.visual, SUBJECT_VISUALS) &&
    isOneOf(value.depthZone, DEPTH_ZONES)
  );
}

export function isDiveMap(value: unknown): value is DiveMap {
  if (!isRecord(value)) return false;
  if (
    !Array.isArray(value.decor) ||
    !Array.isArray(value.cameraStations) ||
    !Array.isArray(value.subjects)
  ) {
    return false;
  }
  return (
    isString(value.locationId) &&
    value.decor.every(isDecorPlacement) &&
    value.cameraStations.every(isCameraStationPlacement) &&
    value.subjects.every(isSurveySubjectPlacement)
  );
}

export const validateDiveMaps = (raw: unknown): DiveMap[] =>
  validateArray(raw, 'diveMap', isDiveMap);

/* ------------------------------------------------------------------ */
/* Cross-reference integrity checks                                    */
/* ------------------------------------------------------------------ */

/**
 * Verify referential integrity between data sets (e.g. missions point to
 * existing locations). Throws {@link ValidationError} on the first problem.
 */
export function assertReferentialIntegrity(data: GameData): void {
  const locationIds = new Set(data.locations.map((l) => l.id));
  for (const mission of data.missions) {
    if (!locationIds.has(mission.locationId)) {
      throw new ValidationError(
        `Mission "${mission.id}" references unknown location "${mission.locationId}".`,
      );
    }
  }
  for (const map of data.diveMaps) {
    if (!locationIds.has(map.locationId)) {
      throw new ValidationError(
        `Dive map references unknown location "${map.locationId}".`,
      );
    }
    for (const subject of map.subjects) {
      if (!data.species.some((species) => species.id === subject.speciesId)) {
        throw new ValidationError(
          `Dive map subject "${subject.id}" references unknown species "${subject.speciesId}".`,
        );
      }
    }
  }
}
