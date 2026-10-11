import type { NarrationVoice } from '../state/ExperiencePreferences';

export type OpeningVoice = NarrationVoice;
export type OpeningStage = 'op01' | 'photoReview' | 'photoConclusion' | 'op02';

/** UI language and narration are deliberately independent choices. */
export function resolveOpeningVoice(requested: OpeningVoice): OpeningVoice {
  return requested;
}

export function getOpeningVideoFile(stage: 'op01' | 'op02', voice: OpeningVoice): string {
  const language = voice === 'can' ? 'Cantonese' : voice === 'pth' ? 'Mandarian' : 'English';
  const opening = stage === 'op01' ? 'OP1' : 'OP2';
  // OP_NEW contains the final, subtitled masters. Browser delivery copies use
  // H.264/AAC and fast-start metadata while the supplied HEVC files stay intact.
  return `assets/chapter1/OP_NEW/${opening}_${language}.web.mp4`;
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

/** Full present-day comparison image captured for the station report. */
export function currentPhotoKeyForStation(stationId: string): string | null {
  if (stationId.endsWith('1')) return 'chapter1-new-s1';
  if (stationId.endsWith('2')) return 'chapter1-new-s2';
  if (stationId.endsWith('3')) return 'chapter1-new-s3';
  return null;
}

export interface CreatureFramePlan {
  readonly speciesId: string;
  readonly indices: readonly number[];
  readonly frameDurationMs: number;
  readonly staticFallback?: boolean;
}

const EIGHT_FRAME_SAMPLE = [0, 4, 8, 12, 16, 20, 24, 28] as const;
const FULL_BLUE_FISH_SEQUENCE = Array.from({ length: 31 }, (_, index) => index);

export const CREATURE_FRAME_PLANS: Readonly<Record<string, CreatureFramePlan>> = {
  'blue-damselfish': {
    speciesId: 'blue-damselfish',
    indices: FULL_BLUE_FISH_SEQUENCE,
    frameDurationMs: 72,
  },
  'hardy-goby': { speciesId: 'hardy-goby', indices: EIGHT_FRAME_SAMPLE, frameDurationMs: 120 },
  'reef-grouper': { speciesId: 'reef-grouper', indices: EIGHT_FRAME_SAMPLE, frameDurationMs: 155 },
  'silver-reef-fish': {
    speciesId: 'silver-reef-fish',
    indices: EIGHT_FRAME_SAMPLE,
    frameDurationMs: 105,
  },
  'sea-cucumber': {
    speciesId: 'sea-cucumber',
    indices: [0, 6, 12, 18, 24, 30],
    frameDurationMs: 420,
  },
  'tube-sponge': {
    speciesId: 'tube-sponge',
    indices: [0],
    frameDurationMs: 900,
    staticFallback: true,
  },
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
