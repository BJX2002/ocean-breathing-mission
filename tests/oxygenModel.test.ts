import { describe, it, expect } from 'vitest';
import { OxygenModel } from '../src/simulation/OxygenModel';
import type { OxygenData } from '../src/types';

const data: OxygenData = {
  alertBands: [
    { id: 'oxygenated', labelEn: 'ok', labelZh: '充氧', minMgPerL: 4, maxMgPerL: null, severity: 'normal' },
    { id: 'warning', labelEn: 'warn', labelZh: '警戒', minMgPerL: 2, maxMgPerL: 4, severity: 'warning' },
    { id: 'severe', labelEn: 'severe', labelZh: '嚴重', minMgPerL: null, maxMgPerL: 2, severity: 'severe' },
  ],
  scenarios: [
    {
      id: 'baseline-day',
      nameEn: 'Baseline',
      nameZh: '基準',
      descriptionEn: '',
      descriptionZh: '',
      readings: [{ depthZone: 'bottom', timeOfDay: 'day', doMgPerL: 5.2 }],
    },
  ],
};

describe('OxygenModel.classify', () => {
  const model = new OxygenModel(data);

  it('classifies an oxygenated value', () => {
    expect(model.classify(6.5)?.id).toBe('oxygenated');
  });

  it('classifies a warning value', () => {
    expect(model.classify(3)?.id).toBe('warning');
  });

  it('classifies a severe value', () => {
    expect(model.classify(1.2)?.id).toBe('severe');
  });

  it('uses a half-open interval at the boundary', () => {
    // 4 belongs to the oxygenated band (>= 4), not the warning band (< 4).
    expect(model.classify(4)?.id).toBe('oxygenated');
    // 2 belongs to the warning band (>= 2), not severe (< 2).
    expect(model.classify(2)?.id).toBe('warning');
  });
});

describe('OxygenModel lookups', () => {
  const model = new OxygenModel(data);

  it('lists scenario ids', () => {
    expect(model.getScenarioIds()).toEqual(['baseline-day']);
  });

  it('finds a reading by depth and time', () => {
    expect(model.getReading('baseline-day', 'bottom', 'day')?.doMgPerL).toBe(5.2);
  });

  it('returns null for a missing reading', () => {
    expect(model.getReading('baseline-day', 'surface', 'night')).toBeNull();
  });
});
