import type { GameData } from '../types';
import speciesRaw from '../data/species.json';
import locationsRaw from '../data/locations.json';
import missionsRaw from '../data/missions.json';
import equipmentRaw from '../data/equipment.json';
import sensorsRaw from '../data/sensors.json';
import oxygenRaw from '../data/oxygenScenarios.json';
import diveMapsRaw from '../data/diveMaps.json';
import {
  assertReferentialIntegrity,
  validateDiveMaps,
  validateEquipment,
  validateLocations,
  validateMissions,
  validateOxygenData,
  validateSensors,
  validateSpecies,
} from '../validation/validators';

/** Progress callback: `progress` is 0..1, `label` is the current file name. */
export type LoadProgress = (progress: number, label: string) => void;

interface LoadStep {
  readonly label: string;
  readonly run: () => void;
}

/**
 * Loads and validates every JSON data file. Data is imported (bundled by Vite,
 * so there are no CDN/network dependencies) and then validated at runtime, so
 * malformed data fails loudly instead of corrupting gameplay.
 */
export async function loadGameData(onProgress?: LoadProgress): Promise<GameData> {
  const partial: {
    species?: GameData['species'];
    locations?: GameData['locations'];
    missions?: GameData['missions'];
    equipment?: GameData['equipment'];
    sensors?: GameData['sensors'];
    oxygen?: GameData['oxygen'];
    diveMaps?: GameData['diveMaps'];
  } = {};

  const steps: LoadStep[] = [
    { label: 'species.json', run: () => (partial.species = validateSpecies(speciesRaw)) },
    { label: 'locations.json', run: () => (partial.locations = validateLocations(locationsRaw)) },
    { label: 'missions.json', run: () => (partial.missions = validateMissions(missionsRaw)) },
    { label: 'equipment.json', run: () => (partial.equipment = validateEquipment(equipmentRaw)) },
    { label: 'sensors.json', run: () => (partial.sensors = validateSensors(sensorsRaw)) },
    { label: 'oxygenScenarios.json', run: () => (partial.oxygen = validateOxygenData(oxygenRaw)) },
    { label: 'diveMaps.json', run: () => (partial.diveMaps = validateDiveMaps(diveMapsRaw)) },
  ];

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) continue;
    step.run();
    onProgress?.((i + 1) / steps.length, step.label);
    // Yield so the loading bar can repaint between files.
    await Promise.resolve();
  }

  const data: GameData = {
    species: partial.species ?? [],
    locations: partial.locations ?? [],
    missions: partial.missions ?? [],
    equipment: partial.equipment ?? [],
    sensors: partial.sensors ?? [],
    oxygen: partial.oxygen ?? { alertBands: [], scenarios: [] },
    diveMaps: partial.diveMaps ?? [],
  };

  assertReferentialIntegrity(data);
  return data;
}
