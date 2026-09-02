import { describe, it, expect } from 'vitest';
import {
  isSpecies,
  validateSpecies,
  validateMissions,
  isDiveMap,
  assertReferentialIntegrity,
} from '../src/validation/validators';
import { ValidationError } from '../src/validation/primitives';
import type { GameData } from '../src/types';

const validSpecies = {
  id: 'blue-damselfish',
  nameEn: 'Blue Damselfish',
  nameZh: '藍雀鯛',
  functionalGroup: 'strongly-mobile-fish',
  abundanceCategory: 'common',
  mobility: 'high',
  preferredDepthZone: 'mid',
  oxygenTolerance: 'moderate',
  surveyStatus: 'still-observed',
};

describe('isSpecies', () => {
  it('accepts a well-formed species record', () => {
    expect(isSpecies(validSpecies)).toBe(true);
  });

  it('rejects an unknown functional group', () => {
    expect(isSpecies({ ...validSpecies, functionalGroup: 'sea-dragon' })).toBe(false);
  });

  it('rejects a missing field', () => {
    const { nameZh, ...withoutName } = validSpecies;
    void nameZh;
    expect(isSpecies(withoutName)).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(isSpecies(null)).toBe(false);
    expect(isSpecies('nope')).toBe(false);
  });
});

describe('validateSpecies', () => {
  it('throws a ValidationError on a malformed array', () => {
    expect(() => validateSpecies([{ id: 'x' }])).toThrow(ValidationError);
  });

  it('returns the array when all items are valid', () => {
    expect(validateSpecies([validSpecies])).toHaveLength(1);
  });
});

describe('validateMissions', () => {
  it('accepts numeric chapter values', () => {
    const mission = {
      id: 'm1',
      titleEn: 'First Dive',
      titleZh: '首次潛水',
      locationId: 'aquaculture-bay',
      chapter: 1,
      objectives: [{ id: 'o1', textEn: 'Do it', textZh: '做' }],
      oxygenBudget: 100,
      timeLimitSeconds: 180,
    };
    expect(validateMissions([mission])).toHaveLength(1);
  });
});

describe('isDiveMap', () => {
  const validMap = {
    locationId: 'aquaculture-bay',
    decor: [{ kind: 'coral', x: 10, y: 20 }],
    cameraStations: [{ id: 'cs-1', x: 1, y: 2, labelEn: 'A', labelZh: '甲' }],
    subjects: [],
  };

  it('accepts a well-formed dive map', () => {
    expect(isDiveMap(validMap)).toBe(true);
  });

  it('rejects an unknown decor kind', () => {
    expect(isDiveMap({ ...validMap, decor: [{ kind: 'volcano', x: 0, y: 0 }] })).toBe(false);
  });

  it('rejects a camera station missing a label', () => {
    expect(
      isDiveMap({ ...validMap, cameraStations: [{ id: 'cs', x: 0, y: 0, labelEn: 'A' }] }),
    ).toBe(false);
  });
});

describe('assertReferentialIntegrity', () => {
  it('throws when a mission references an unknown location', () => {
    const data = {
      species: [],
      locations: [],
      missions: [
        {
          id: 'm1',
          titleEn: 'x',
          titleZh: 'x',
          locationId: 'ghost-bay',
          chapter: 1,
          objectives: [],
          oxygenBudget: 0,
          timeLimitSeconds: 0,
        },
      ],
      equipment: [],
      sensors: [],
      oxygen: { alertBands: [], scenarios: [] },
      diveMaps: [],
    } as unknown as GameData;
    expect(() => assertReferentialIntegrity(data)).toThrow(ValidationError);
  });
});
