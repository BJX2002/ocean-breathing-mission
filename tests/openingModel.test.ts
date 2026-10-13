import { describe, expect, it } from 'vitest';
import {
  CREATURE_FRAME_PLANS,
  getCreatureFramePlan,
  getOpeningVideoFile,
  currentPhotoKeyForStation,
  historicalPhotoKeyForStation,
  nextOpeningStage,
  resolveOpeningVoice,
  hasUsableSpongeTransparency,
} from '../src/scenes/OpeningModel';

describe('Chapter 1 opening model', () => {
  it('uses Cantonese by default for the Traditional Chinese UI', () => {
    expect(resolveOpeningVoice('can')).toBe('can');
    expect(getOpeningVideoFile('op01', 'can')).toContain('/OP_NEW/OP1_Cantonese.web.mp4');
  });

  it('keeps narration independent from the selected text language', () => {
    expect(getOpeningVideoFile('op01', 'pth')).toContain('/OP_NEW/OP1_Mandarian.web.mp4');
    expect(getOpeningVideoFile('op01', 'eng')).toContain('/OP_NEW/OP1_English.web.mp4');
    expect(resolveOpeningVoice('pth')).toBe('pth');
    expect(getOpeningVideoFile('op02', 'pth')).toContain('/OP_NEW/OP2_Mandarian.web.mp4');
    expect(resolveOpeningVoice('eng')).toBe('eng');
  });

  it('uses a smaller fast-start opening on touch devices without changing desktop media', () => {
    expect(getOpeningVideoFile('op01', 'can', 'desktop')).toContain(
      '/OP_NEW/OP1_Cantonese.web.mp4',
    );
    expect(getOpeningVideoFile('op01', 'can', 'tablet')).toContain(
      '/OP_NEW/OP1_Cantonese.tablet.mp4',
    );
    expect(getOpeningVideoFile('op02', 'eng', 'tablet')).toContain(
      '/OP_NEW/OP2_English.tablet.mp4',
    );
  });

  it('keeps the opening stage order explicit', () => {
    expect(nextOpeningStage('op01')).toBe('photoReview');
    expect(nextOpeningStage('photoReview')).toBe('photoConclusion');
    expect(nextOpeningStage('photoConclusion')).toBe('op02');
    expect(nextOpeningStage('op02')).toBe('dive');
  });

  it('maps each station to its full historical photo', () => {
    expect(historicalPhotoKeyForStation('cs-1')).toBe('chapter1-old-s1');
    expect(historicalPhotoKeyForStation('cs-2')).toBe('chapter1-old-s2');
    expect(historicalPhotoKeyForStation('cs-3')).toBe('chapter1-old-s3');
    expect(historicalPhotoKeyForStation('unknown')).toBeNull();
  });

  it('maps each station to its supplied present-day comparison photo', () => {
    expect(currentPhotoKeyForStation('cs-1')).toBe('chapter1-new-s1');
    expect(currentPhotoKeyForStation('cs-2')).toBe('chapter1-new-s2');
    expect(currentPhotoKeyForStation('cs-3')).toBe('chapter1-new-s3');
    expect(currentPhotoKeyForStation('unknown')).toBeNull();
  });

  it('uses the complete blue-fish motion while sampling the other creatures', () => {
    expect(getCreatureFramePlan('blue-damselfish')?.indices).toHaveLength(31);
    expect(getCreatureFramePlan('blue-damselfish')?.indices).toEqual(
      Array.from({ length: 31 }, (_, index) => index),
    );
    expect(getCreatureFramePlan('reef-grouper')?.indices).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(getCreatureFramePlan('sea-cucumber')?.indices).toEqual([0, 6, 12, 18, 24, 30]);
    expect(Object.keys(CREATURE_FRAME_PLANS)).toHaveLength(6);
  });

  it('accepts transparent sponge corners and rejects opaque white corners', () => {
    expect(
      hasUsableSpongeTransparency([
        { red: 255, green: 255, blue: 255, alpha: 0 },
        { red: 0, green: 0, blue: 0, alpha: 0 },
      ]),
    ).toBe(true);
    expect(hasUsableSpongeTransparency([{ red: 255, green: 255, blue: 255, alpha: 255 }])).toBe(
      false,
    );
  });
});
