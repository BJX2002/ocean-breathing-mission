/**
 * Optional external art assets (sprite/atlas pipeline).
 *
 * The game ships with procedurally generated placeholder textures (see
 * {@link file://./TextureFactory.ts}). To replace any placeholder with real
 * hand-drawn art, drop a PNG (and optional atlas JSON) into `public/assets/`
 * and add an entry here using the SAME texture key as the placeholder, e.g.
 * `decor-coral`, `camera-station`, or a new key for future sprites.
 *
 * How it works: the PreloadScene loads these assets FIRST; then
 * `ensureTextures()` bakes procedural placeholders only for keys that were not
 * loaded. So any provided art automatically overrides the placeholder, and
 * missing files are ignored gracefully (no crash).
 *
 * Chapter 1 currently uses the supplied fish, diver, habitat and background
 * art. The fixed survey-station marker is drawn as a compact runtime graphic,
 * because the supplied station sheet is a tall full-device illustration rather
 * than a map-sized marker.
 */
export type ArtAsset =
  | { readonly type: 'image'; readonly key: string; readonly url: string }
  | {
      readonly type: 'atlas';
      readonly key: string;
      readonly textureUrl: string;
      readonly atlasUrl: string;
    };

export const CHAPTER1_DIVER_FRAME_COUNT = 30;
export const CHAPTER1_DIVER_FRAME_KEYS = Array.from(
  { length: CHAPTER1_DIVER_FRAME_COUNT },
  (_, index) => `chapter1-diver-frame-${String(index).padStart(2, '0')}`,
);

/** Best-preserved transparent frames from the supplied Chapter 2 walk cycle. */
export const CHAPTER2_SCIENTIST_FRAME_KEYS = [0, 8, 20, 26].map(
  (index) => `chapter2-scientist-frame-${String(index).padStart(2, '0')}`,
);

const CREATURE_FRAME_ASSETS: readonly ArtAsset[] = [
  ...Array.from({ length: 31 }, (_, index): ArtAsset => ({
    type: 'image',
    key: `chapter1-subject-blue-damselfish-frame-${String(index).padStart(2, '0')}`,
    url: `assets/chapter1/creatures/individual/subject-blue-damselfish_frames/cc785829a8bcbd87a12dc72e388b91cf_${String(index).padStart(2, '0')}.png`,
  })),
  ...[0, 4, 8, 12, 16, 20, 24, 28].flatMap((index): ArtAsset[] => [
    {
      type: 'image',
      key: `chapter1-subject-hardy-goby-frame-${String(index).padStart(2, '0')}`,
      url: `assets/chapter1/creatures/individual/subject-hardy-goby_frames/_2026-08-15_213512___${String(index).padStart(2, '0')}.png`,
    },
    {
      type: 'image',
      key: `chapter1-subject-reef-grouper-frame-${String(index).padStart(2, '0')}`,
      url: `assets/chapter1/creatures/individual/subject-reef-grouper_frames/shi___${String(index).padStart(2, '0')}.png`,
    },
    {
      type: 'image',
      key: `chapter1-subject-silver-reef-fish-frame-${String(index).padStart(2, '0')}`,
      url: `assets/chapter1/creatures/individual/subject-silver-reef-fish_frames/6c624a4542f912f496960f13a2ea9f43_${String(index).padStart(2, '0')}.png`,
    },
  ]),
  ...[0, 6, 12, 18, 24, 30].map((index): ArtAsset => ({
    type: 'image',
    key: `chapter1-subject-sea-cucumber-frame-${String(index).padStart(2, '0')}`,
    url: `assets/chapter1/creatures/individual/subject-sea-cucumber_frames/_2026-08-15_213443___${String(index).padStart(2, '0')}.png`,
  })),
  {
    type: 'image',
    key: 'chapter1-subject-tube-sponge-frame-00',
    url: 'assets/chapter1/creatures/individual/subject-tube-sponge___frames/subject-tube-sponge___00.png',
  },
];

const MOORING_ASSETS: readonly ArtAsset[] = [
  {
    type: 'image',
    key: 'chapter1-mooring-buoy-top',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (1).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-instrument',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (2).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-float',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (3).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-connector',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (4).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-anchor',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (5).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-chain',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (6).png',
  },
  {
    type: 'image',
    key: 'chapter1-mooring-cable',
    url: 'assets/chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (7).png',
  },
];

export const ART_MANIFEST: readonly ArtAsset[] = [
  { type: 'image', key: 'chapter1-cover', url: 'assets/chapter1/cover.png' },
  { type: 'image', key: 'chapter2-lab', url: 'assets/chapter2/lab.png' },
  {
    type: 'image',
    key: 'chapter2-do-sensor-product',
    url: 'assets/chapter2/do-sensor-product-v1.png',
  },
  ...CHAPTER2_SCIENTIST_FRAME_KEYS.map((key, frameIndex): ArtAsset => {
    const sourceFrame = [0, 8, 20, 26][frameIndex] ?? 0;
    return {
      type: 'image',
      key,
      url: `assets/chapter2/scientist___frames/scientist___${String(sourceFrame).padStart(2, '0')}.png`,
    };
  }),
  // Chapter 1 fish art. Individual subject images are used as static
  // fallbacks and by the viewfinder; selected animation frames are loaded
  // below for the normal in-world presentation.
  {
    type: 'image',
    key: 'chapter1-fish-school-small',
    url: 'assets/chapter1/fish-school-small.png',
  },
  {
    type: 'image',
    key: 'chapter1-distant-reef-background',
    url: 'assets/chapter1/distant-reef-background.png',
  },
  { type: 'image', key: 'chapter1-seabed-tile', url: 'assets/chapter1/seabed-tile.png' },
  { type: 'image', key: 'chapter1-research-vessel', url: 'assets/chapter1/Vessel.png' },
  { type: 'image', key: 'chapter1-old-s1', url: 'assets/chapter1/old/S1_OLD.png' },
  { type: 'image', key: 'chapter1-old-s2', url: 'assets/chapter1/old/S2_OLD.png' },
  { type: 'image', key: 'chapter1-old-s3', url: 'assets/chapter1/old/S3_OLD.png' },
  { type: 'image', key: 'chapter1-new-s1', url: 'assets/chapter1/new/S1_NEW.png' },
  { type: 'image', key: 'chapter1-new-s2', url: 'assets/chapter1/new/S2_NEW.png' },
  { type: 'image', key: 'chapter1-new-s3', url: 'assets/chapter1/new/S3_NEW.png' },
  ...CHAPTER1_DIVER_FRAME_KEYS.map((key, index): ArtAsset => ({
    type: 'image',
    key,
    url: `assets/chapter1/diver/AI____frames/AI____${String(index).padStart(2, '0')}.png`,
  })),
  { type: 'image', key: 'chapter1-seagrass-short', url: 'assets/chapter1/seagrass-short.png' },
  { type: 'image', key: 'chapter1-seagrass-tall', url: 'assets/chapter1/seagrass-tall.png' },
  {
    type: 'image',
    key: 'chapter1-subject-blue-damselfish',
    url: 'assets/chapter1/creatures/individual/subject-blue-damselfish.png',
  },
  {
    type: 'image',
    key: 'chapter1-subject-hardy-goby',
    url: 'assets/chapter1/creatures/individual/subject-hardy-goby.png',
  },
  {
    type: 'image',
    key: 'chapter1-subject-reef-grouper',
    url: 'assets/chapter1/creatures/individual/subject-reef-grouper.png',
  },
  {
    type: 'image',
    key: 'chapter1-subject-silver-reef-fish',
    url: 'assets/chapter1/creatures/individual/subject-silver-reef-fish.png',
  },
  ...CREATURE_FRAME_ASSETS,
  ...MOORING_ASSETS,
];

export { CREATURE_FRAME_ASSETS, MOORING_ASSETS };
