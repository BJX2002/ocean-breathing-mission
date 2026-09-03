import type { NarrationVoice } from '../state/ExperiencePreferences';

export type OpeningVoice = NarrationVoice;
export type OpeningStage = 'op01' | 'photoReview' | 'photoConclusion' | 'op02';

/** UI language and narration are deliberately independent choices. */
export function resolveOpeningVoice(requested: OpeningVoice): OpeningVoice {
  return requested;
}

export function getOpeningVideoFile(stage: 'op01' | 'op02', voice: OpeningVoice): string {
  const file = stage === 'op01' ? '01' : '02';
  const mandarinFile = stage === 'op01' ? '1' : '2';
  // Browser delivery files must be H.264/AAC. The source clips are HEVC and
  // intentionally keep their original names; the conversion helper writes
  // these separate *.web.mp4 files without overwriting the masters.
  return voice === 'can'
    ? `assets/chapter1/op2/can${file}.web.mp4`
    : voice === 'pth'
      ? `assets/chapter1/op2/pth${mandarinFile}.web.mp4`
      : `assets/chapter1/op/eng${file}.web.mp4`;
}

export function nextOpeningStage(stage: OpeningStage): OpeningStage | 'dive' {
  if (stage === 'op01') return 'photoReview';
  if (stage === 'photoReview') return 'photoConclusion';
  if (stage === 'photoConclusion') return 'op02';
  return 'dive';
}

/** Full historical reference image used by both the opening and viewfinder. */
export function historicalPhotoKeyForStation(stationId: string): string | null {
  if (stationId.endsWith('1')) return 'chapter1-old-s1';
  if (stationId.endsWith('2')) return 'chapter1-old-s2';
  if (stationId.endsWith('3')) return 'chapter1-old-s3';
  return null;
}

export interface CreatureFramePlan {
  readonly speciesId: string;
  readonly indices: readonly number[];
  readonly frameDurationMs: number;
  readonly staticFallback?: boolean;
}

const EIGHT_FRAME_SAMPLE = [0, 4, 8, 12, 16, 20, 24, 28] as const;

export const CREATURE_FRAME_PLANS: Readonly<Record<string, CreatureFramePlan>> = {
  'blue-damselfish': { speciesId: 'blue-damselfish', indices: [0, 1, 2, 3, 4, 5, 6], frameDurationMs: 105 },
  'hardy-goby': { speciesId: 'hardy-goby', indices: EIGHT_FRAME_SAMPLE, frameDurationMs: 120 },
  'reef-grouper': { speciesId: 'reef-grouper', indices: EIGHT_FRAME_SAMPLE, frameDurationMs: 155 },
  'silver-reef-fish': { speciesId: 'silver-reef-fish', indices: EIGHT_FRAME_SAMPLE, frameDurationMs: 105 },
  'sea-cucumber': { speciesId: 'sea-cucumber', indices: [0, 6, 12, 18, 24, 30], frameDurationMs: 420 },
  'tube-sponge': { speciesId: 'tube-sponge', indices: [0], frameDurationMs: 900, staticFallback: true },
};

export function getCreatureFramePlan(speciesId: string): CreatureFramePlan | null {
  return CREATURE_FRAME_PLANS[speciesId] ?? null;
}

/** Edge-connected white removal must preserve the white rims inside tube mouths. */
export interface SpongeCornerSample {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
}

export function hasUsableSpongeTransparency(corners: readonly SpongeCornerSample[]): boolean {
  return corners.length > 0 && corners.every((corner) => corner.alpha === 0);
}
