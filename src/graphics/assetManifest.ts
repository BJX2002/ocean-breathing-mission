/**
 * Optional external art assets (sprite/atlas pipeline).
 *
 * The game ships with procedurally generated placeholder textures (see
 * {@link file://./TextureFactory.ts}). To replace any placeholder with real
 * hand-drawn art, create a browser-sized WebP inside
 * `public/runtime-public/assets/` and add an entry here using the SAME texture
 * key as the placeholder, e.g. `decor-coral`, `camera-station`, or a new key.
 *
 * How it works: PreloadScene loads only the cover needed by the menu. Chapter
 * scenes load their own manifest on demand, then `ensureTextures()` supplies
 * procedural placeholders for keys that are unavailable. This keeps the first
 * visit light enough for iPad Safari while preserving the supplied artwork.
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

/**
 * Runtime art is served from the small, display-sized WebP set generated from
 * the archival source artwork. Keeping this mapping in one place makes it
 * difficult to accidentally put a multi-megabyte source PNG back on the
 * critical loading path.
 */
const runtimeImage = (pathWithoutExtension: string): string =>
  `assets/${pathWithoutExtension}.webp`;

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
    url: runtimeImage(
      `chapter1/creatures/individual/subject-blue-damselfish_frames/cc785829a8bcbd87a12dc72e388b91cf_${String(index).padStart(2, '0')}`,
    ),
  })),
  ...[0, 4, 8, 12, 16, 20, 24, 28].flatMap((index): ArtAsset[] => [
    {
      type: 'image',
      key: `chapter1-subject-hardy-goby-frame-${String(index).padStart(2, '0')}`,
      url: runtimeImage(
        `chapter1/creatures/individual/subject-hardy-goby_frames/_2026-08-15_213512___${String(index).padStart(2, '0')}`,
      ),
    },
    {
      type: 'image',
      key: `chapter1-subject-reef-grouper-frame-${String(index).padStart(2, '0')}`,
      url: runtimeImage(
        `chapter1/creatures/individual/subject-reef-grouper_frames/shi___${String(index).padStart(2, '0')}`,
      ),
    },
    {
      type: 'image',
      key: `chapter1-subject-silver-reef-fish-frame-${String(index).padStart(2, '0')}`,
      url: runtimeImage(
        `chapter1/creatures/individual/subject-silver-reef-fish_frames/6c624a4542f912f496960f13a2ea9f43_${String(index).padStart(2, '0')}`,
      ),
    },
  ]),
  ...[0, 6, 12, 18, 24, 30].map((index): ArtAsset => ({
    type: 'image',
    key: `chapter1-subject-sea-cucumber-frame-${String(index).padStart(2, '0')}`,
    url: runtimeImage(
      `chapter1/creatures/individual/subject-sea-cucumber_frames/_2026-08-15_213443___${String(index).padStart(2, '0')}`,
    ),
  })),
  {
    type: 'image',
    key: 'chapter1-subject-tube-sponge-frame-00',
    url: runtimeImage(
      'chapter1/creatures/individual/subject-tube-sponge___frames/subject-tube-sponge___00',
    ),
  },
];

const MOORING_ASSETS: readonly ArtAsset[] = [
  {
    type: 'image',
    key: 'chapter1-mooring-buoy-top',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (1)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-instrument',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (2)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-float',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (3)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-connector',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_36 (4)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-anchor',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (5)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-chain',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (6)'),
  },
  {
    type: 'image',
    key: 'chapter1-mooring-cable',
    url: runtimeImage('chapter1/mooring/ChatGPT Image 2026年8月13日 16_02_37 (7)'),
  },
];

export const CORE_ART_MANIFEST: readonly ArtAsset[] = [
  { type: 'image', key: 'chapter1-cover', url: runtimeImage('chapter1/cover') },
];

export const CHAPTER2_ART_MANIFEST: readonly ArtAsset[] = [
  { type: 'image', key: 'chapter2-lab', url: runtimeImage('chapter2/lab') },
  {
    type: 'image',
    key: 'chapter2-do-sensor-product',
    url: runtimeImage('chapter2/do-sensor-product-v2'),
  },
  ...CHAPTER2_SCIENTIST_FRAME_KEYS.map((key, frameIndex): ArtAsset => {
    const sourceFrame = [0, 8, 20, 26][frameIndex] ?? 0;
    return {
      type: 'image',
      key,
      url: runtimeImage(
        `chapter2/scientist___frames/scientist___${String(sourceFrame).padStart(2, '0')}`,
      ),
    };
  }),
];

export const CHAPTER1_ART_MANIFEST: readonly ArtAsset[] = [
  // Chapter 1 fish art. Individual subject images are used as static
  // fallbacks and by the viewfinder; selected animation frames are loaded
  // below for the normal in-world presentation.
  {
    type: 'image',
    key: 'chapter1-fish-school-small',
    url: runtimeImage('chapter1/fish-school-small'),
  },
  {
    type: 'image',
    key: 'chapter1-distant-reef-background',
    url: runtimeImage('chapter1/distant-reef-background'),
  },
  { type: 'image', key: 'chapter1-seabed-tile', url: runtimeImage('chapter1/seabed-tile') },
  { type: 'image', key: 'chapter1-research-vessel', url: runtimeImage('chapter1/Vessel') },
  { type: 'image', key: 'chapter1-old-s1', url: runtimeImage('chapter1/old/S1_OLD') },
  { type: 'image', key: 'chapter1-old-s2', url: runtimeImage('chapter1/old/S2_OLD') },
  { type: 'image', key: 'chapter1-old-s3', url: runtimeImage('chapter1/old/S3_OLD') },
  { type: 'image', key: 'chapter1-new-s1', url: runtimeImage('chapter1/new/S1_NEW') },
  { type: 'image', key: 'chapter1-new-s2', url: runtimeImage('chapter1/new/S2_NEW') },
  { type: 'image', key: 'chapter1-new-s3', url: runtimeImage('chapter1/new/S3_NEW') },
  ...CHAPTER1_DIVER_FRAME_KEYS.map((key, index): ArtAsset => ({
    type: 'image',
    key,
    url: runtimeImage(
      `chapter1/diver/AI____frames/AI____${String(index).padStart(2, '0')}`,
    ),
  })),
  {
    type: 'image',
    key: 'chapter1-seagrass-short',
    url: runtimeImage('chapter1/seagrass-short'),
  },
  {
    type: 'image',
    key: 'chapter1-seagrass-tall',
    url: runtimeImage('chapter1/seagrass-tall'),
  },
  {
    type: 'image',
    key: 'chapter1-subject-blue-damselfish',
    url: runtimeImage('chapter1/creatures/individual/subject-blue-damselfish'),
  },
  {
    type: 'image',
    key: 'chapter1-subject-hardy-goby',
    url: runtimeImage('chapter1/creatures/individual/subject-hardy-goby'),
  },
  {
    type: 'image',
    key: 'chapter1-subject-reef-grouper',
    url: runtimeImage('chapter1/creatures/individual/subject-reef-grouper'),
  },
  {
    type: 'image',
    key: 'chapter1-subject-silver-reef-fish',
    url: runtimeImage('chapter1/creatures/individual/subject-silver-reef-fish'),
  },
  ...CREATURE_FRAME_ASSETS,
  ...MOORING_ASSETS,
];

/** Full list retained for build/validation tooling; scenes load only their own group. */
export const ART_MANIFEST: readonly ArtAsset[] = [
  ...CORE_ART_MANIFEST,
  ...CHAPTER1_ART_MANIFEST,
  ...CHAPTER2_ART_MANIFEST,
];

export { CREATURE_FRAME_ASSETS, MOORING_ASSETS };
