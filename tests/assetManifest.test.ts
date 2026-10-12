import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ART_MANIFEST,
  CHAPTER1_ART_MANIFEST,
  CHAPTER2_ART_MANIFEST,
  CORE_ART_MANIFEST,
} from '../src/graphics/assetManifest';

const runtimePublic = resolve(process.cwd(), 'public/runtime-public');

describe('runtime art manifest', () => {
  it('keeps startup and chapter assets in separate groups', () => {
    expect(CORE_ART_MANIFEST.map((asset) => asset.key)).toEqual(['chapter1-cover']);
    expect(CHAPTER1_ART_MANIFEST.some((asset) => asset.key === 'chapter1-cover')).toBe(false);
    expect(CHAPTER2_ART_MANIFEST.some((asset) => asset.key === 'chapter1-cover')).toBe(false);

    const keys = ART_MANIFEST.map((asset) => asset.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every runtime image at a deployed file', () => {
    for (const asset of ART_MANIFEST) {
      const urls =
        asset.type === 'image' ? [asset.url] : [asset.textureUrl, asset.atlasUrl];
      for (const url of urls) {
        expect(url.startsWith('assets/')).toBe(true);
        expect(existsSync(resolve(runtimePublic, url))).toBe(true);
      }
    }
  });
});
