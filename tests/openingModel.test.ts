import { describe, expect, it } from 'vitest';
import {
  CREATURE_FRAME_PLANS,
  getCreatureFramePlan,
  getOpeningVideoFile,
  historicalPhotoKeyForStation,
  nextOpeningStage,
  resolveOpeningVoice,
  hasUsableSpongeTransparency,
} from '../src/scenes/OpeningModel';

describe('Chapter 1 opening model', () => {
  it('uses Cantonese by default for the Traditional Chinese UI', () => {
    expect(resolveOpeningVoice('can')).toBe('can');
    expect(getOpeningVideoFile('op01', 'can')).toContain('/op2/can01.web.mp4');
  });

  it('keeps narration independent from the selected text language', () => {
    expect(resolveOpeningVoice('pth')).toBe('pth');
    expect(getOpeningVideoFile('op02', 'pth')).toContain('/op2/pth2.web.mp4');
    expect(resolveOpeningVoice('eng')).toBe('eng');
  });

  it('keeps the opening stage order explicit', () => {
    expect(nextOpeningStage('op01')).toBe('photoReview');
    expect(nextOpeningStage('photoReview')).toBe('op02');
    expect(nextOpeningStage('op02')).toBe('dive');
  });

  it('maps each station to its full historical photo', () => {
    expect(historicalPhotoKeyForStation('cs-1')).toBe('chapter1-old-s1');
    expect(historicalPhotoKeyForStation('cs-2')).toBe('chapter1-old-s2');
    expect(historicalPhotoKeyForStation('cs-3')).toBe('chapter1-old-s3');
    expect(historicalPhotoKeyForStation('unknown')).toBeNull();
  });

  it('samples creature frames instead of loading every source frame', () => {
    expect(getCreatureFramePlan('blue-damselfish')?.indices).toHaveLength(7);
    expect(getCreatureFramePlan('reef-grouper')?.indices).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
    expect(getCreatureFramePlan('sea-cucumber')?.indices).toEqual([0, 6, 12, 18, 24, 30]);
    expect(Object.keys(CREATURE_FRAME_PLANS)).toHaveLength(6);
  });

  it('accepts transparent sponge corners and rejects opaque white corners', () => {
    expect(hasUsableSpongeTransparency([
      { red: 255, green: 255, blue: 255, alpha: 0 },
      { red: 0, green: 0, blue: 0, alpha: 0 },
    ])).toBe(true);
    expect(hasUsableSpongeTransparency([
      { red: 255, green: 255, blue: 255, alpha: 255 },
    ])).toBe(false);
  });
});
