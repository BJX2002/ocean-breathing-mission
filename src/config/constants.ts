/** Logical (design) resolution. The canvas scales to fit while keeping 16:9. */
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** Chapter 1 composition guides for the surface-to-seabed cross-section. */
export const SKY_HEIGHT = 110;
export const SURFACE_BAND_HEIGHT = 48;
export const WATER_SURFACE_Y = SKY_HEIGHT + SURFACE_BAND_HEIGHT;
/** Gameplay boundary retained so movement behavior stays unchanged. */
export const SEABED_HEIGHT = 60;
export const SEABED_TOP = GAME_HEIGHT - SEABED_HEIGHT;
/** Presentation-only habitat shelf; it does not change diver movement bounds. */
export const HABITAT_FLOOR_Y = GAME_HEIGHT - 170;

/** localStorage key for the save file (versioned to allow migrations). */
export const STORAGE_KEY = 'ocean-breathing-mission/save/v1';

/** Save schema version. Bump when the SaveData shape changes. */
export const SAVE_VERSION = 2;

/** Stable scene keys, referenced by scene transitions. */
export const SceneKeys = {
  Boot: 'BootScene',
  Preload: 'PreloadScene',
  Menu: 'MenuScene',
  Opening: 'OpeningScene',
  Dive: 'DiveScene',
  Chapter2Lab: 'Chapter2LabScene',
} as const;

export type SceneKey = (typeof SceneKeys)[keyof typeof SceneKeys];

/** Shared palette (kept out of scenes to avoid magic numbers). */
export const Palette = {
  deepSea: 0x04121f,
  ocean: 0x0a2a43,
  modal: 0x071d2b,
  modalRaised: 0x0d3141,
  card: 0x123b4c,
  cardSoft: 0x153746,
  paper: 0xf4f0df,
  paperWarm: 0xece4cc,
  accent: 0x3fd0c9,
  accentDark: 0x1c7a74,
  accentSoft: 0x8ce8df,
  gold: 0xf0c95a,
  success: 0x91e6a7,
  danger: 0xd97967,
  accentText: '#3fd0c9',
  textLight: '#e6f7ff',
  textMuted: '#7fa8bd',
  textInk: '#123447',
  textInkMuted: '#55727d',
} as const;
