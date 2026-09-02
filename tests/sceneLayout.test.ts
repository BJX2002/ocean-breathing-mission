import { describe, expect, it } from 'vitest';
import {
  chooseLayoutRect,
  rectFromCenter,
  rectsOverlap,
  type LayoutRect,
} from '../src/ui/SceneLayout';

const bounds: LayoutRect = { x: 0, y: 0, width: 1000, height: 600 };

describe('scene layout placement', () => {
  it('keeps the first clear candidate as the preferred placement', () => {
    const preferred = rectFromCenter(500, 150, 200, 80);
    const fallback = rectFromCenter(250, 250, 200, 80);

    expect(chooseLayoutRect([preferred, fallback], bounds, [])).toEqual(preferred);
  });

  it('skips occupied candidates and keeps the card inside bounds', () => {
    const occupied = rectFromCenter(500, 150, 200, 80);
    const fallback = rectFromCenter(-40, 250, 200, 80);
    const result = chooseLayoutRect([occupied, fallback], bounds, [occupied]);

    expect(result).toEqual({ x: 0, y: 210, width: 200, height: 80 });
    expect(result === null ? false : rectsOverlap(result, occupied)).toBe(false);
  });

  it('returns null when all candidates are occupied', () => {
    const candidates = [rectFromCenter(500, 150, 200, 80), rectFromCenter(250, 250, 200, 80)];

    expect(chooseLayoutRect(candidates, bounds, candidates)).toBeNull();
  });
});
