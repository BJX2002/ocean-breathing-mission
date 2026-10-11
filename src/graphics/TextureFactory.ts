import Phaser from 'phaser';
import type { DecorKind } from '../types';

/** Texture key for a decor kind. */
export function decorTextureKey(kind: DecorKind): string {
  return `decor-${kind}`;
}

export const SEABED_TEXTURE = 'seabed-strip';
export const BUBBLE_TEXTURE = 'bubble';
export const LIGHTRAY_TEXTURE = 'lightray';
export const VIGNETTE_TEXTURE = 'vignette';

/**
 * Copy a white-background illustration into a canvas texture and remove only
 * white pixels connected to the outer edge. Interior white tube rims remain.
 */
export function ensureEdgeTransparentTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  outputKey: string,
): boolean {
  if (scene.textures.exists(outputKey)) return true;
  if (!scene.textures.exists(sourceKey)) return false;

  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (width <= 0 || height <= 0) return false;

  const canvasTexture = scene.textures.createCanvas(outputKey, width, height);
  if (canvasTexture === null) return false;
  const context = canvasTexture.getContext();
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  const pixels = context.getImageData(0, 0, width, height);
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  const isWhite = (index: number): boolean => {
    const red = pixels.data[index * 4] ?? 0;
    const green = pixels.data[index * 4 + 1] ?? 0;
    const blue = pixels.data[index * 4 + 2] ?? 0;
    const alpha = pixels.data[index * 4 + 3] ?? 0;
    return alpha > 0 && red >= 242 && green >= 242 && blue >= 242;
  };
  const enqueue = (x: number, y: number): void => {
    const index = y * width + x;
    if (visited[index] === 1 || !isWhite(index)) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor] ?? 0;
    const x = index % width;
    const y = Math.floor(index / width);
    pixels.data[index * 4 + 3] = 0;
    if (x > 0) enqueue(x - 1, y);
    if (x < width - 1) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y < height - 1) enqueue(x, y + 1);
  }

  context.putImageData(pixels, 0, 0);
  canvasTexture.refresh();
  return true;
}

interface VisibleTextureBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Crops every frame to its visible pixels and scales the animal to one stable
 * body width. Source animation sheets often leave different amounts of empty
 * canvas around each frame; playing those frames at one canvas scale makes an
 * animal appear to grow and shrink. These normalized canvases keep the body
 * centred and the same apparent size while preserving fin and gill motion.
 */
export function ensureNormalizedTextureSequence(
  scene: Phaser.Scene,
  sourceKeys: readonly string[],
  outputSuffix = 'body-normalized',
): readonly string[] {
  const keys = sourceKeys.filter((key) => scene.textures.exists(key));
  if (keys.length === 0 || typeof document === 'undefined') return keys;

  const outputKeys = keys.map((key) => `${key}-${outputSuffix}`);
  if (outputKeys.every((key) => scene.textures.exists(key))) return outputKeys;

  const readBounds = (source: CanvasImageSource, width: number, height: number): VisibleTextureBounds => {
    const scratch = document.createElement('canvas');
    scratch.width = width;
    scratch.height = height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (context === null) return { x: 0, y: 0, width, height };
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
        if (alpha < 10) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return { x: 0, y: 0, width, height };
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  };

  const frames = keys.map((key) => {
    const source = scene.textures.get(key).getSourceImage() as CanvasImageSource & {
      readonly width: number;
      readonly height: number;
      readonly naturalWidth?: number;
      readonly naturalHeight?: number;
    };
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    return { source, bounds: readBounds(source, width, height) };
  });
  const visibleWidth = 420;
  const padding = 8;
  const scaledHeights = frames.map(
    ({ bounds }) => (bounds.height * visibleWidth) / Math.max(1, bounds.width),
  );
  const canvasWidth = visibleWidth + padding * 2;
  const canvasHeight = Math.ceil(Math.max(...scaledHeights)) + padding * 2;

  frames.forEach(({ source, bounds }, index) => {
    const outputKey = outputKeys[index];
    if (outputKey === undefined || scene.textures.exists(outputKey)) return;
    const canvasTexture = scene.textures.createCanvas(outputKey, canvasWidth, canvasHeight);
    if (canvasTexture === null) return;
    const context = canvasTexture.getContext();
    const scaledHeight = scaledHeights[index] ?? canvasHeight - padding * 2;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(
      source,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      padding,
      (canvasHeight - scaledHeight) / 2,
      visibleWidth,
      scaledHeight,
    );
    canvasTexture.refresh();
  });

  return outputKeys.filter((key) => scene.textures.exists(key));
}

/**
 * Vector textures are authored in compact design units then baked at TEX_SCALE×
 * so they display crisply in the 1920×1080 design space without upscaling.
 */
const TEX_SCALE = 1.5;

type DrawFn = (g: Phaser.GameObjects.Graphics, s: number) => void;

/** Draw into a throwaway Graphics (scaled by TEX_SCALE), bake it, then discard. */
function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: DrawFn,
): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g, TEX_SCALE);
  g.generateTexture(key, Math.round(width * TEX_SCALE), Math.round(height * TEX_SCALE));
  g.destroy();
}

/* --------------------------- individual art --------------------------- */

const drawCoral: DrawFn = (g, s) => {
  g.fillStyle(0xd85c6c, 1);
  g.fillRoundedRect(26 * s, 20 * s, 12 * s, 40 * s, 6 * s);
  g.fillStyle(0xff7a8a, 1);
  g.fillRoundedRect(12 * s, 30 * s, 10 * s, 34 * s, 5 * s);
  g.fillRoundedRect(42 * s, 28 * s, 10 * s, 36 * s, 5 * s);
  g.fillStyle(0xffb3bd, 1);
  g.fillCircle(31 * s, 18 * s, 9 * s);
  g.fillCircle(16 * s, 28 * s, 7 * s);
  g.fillCircle(47 * s, 26 * s, 7 * s);
  g.fillStyle(0xffd7dd, 0.9);
  g.fillCircle(29 * s, 15 * s, 3 * s);
  g.fillCircle(14 * s, 25 * s, 2.5 * s);
  g.fillCircle(45 * s, 23 * s, 2.5 * s);
};

const drawRock: DrawFn = (g, s) => {
  g.fillStyle(0x3b4954, 1);
  g.fillEllipse(32 * s, 40 * s, 60 * s, 34 * s);
  g.fillStyle(0x4a5a66, 1);
  g.fillEllipse(30 * s, 36 * s, 46 * s, 26 * s);
  g.fillStyle(0x5c6d7a, 1);
  g.fillEllipse(26 * s, 32 * s, 28 * s, 18 * s);
  g.fillStyle(0x76899a, 0.8);
  g.fillEllipse(23 * s, 29 * s, 12 * s, 7 * s);
};

const drawSeagrass: DrawFn = (g, s) => {
  g.fillStyle(0x1f7d52, 1);
  for (const bx of [12, 24, 34, 46]) {
    g.fillRoundedRect(bx * s, 12 * s, 6 * s, 52 * s, 3 * s);
  }
  g.fillStyle(0x3fc487, 1);
  g.fillRoundedRect(18 * s, 6 * s, 6 * s, 58 * s, 3 * s);
  g.fillRoundedRect(40 * s, 8 * s, 6 * s, 56 * s, 3 * s);
  g.fillStyle(0x7ff0bf, 0.8);
  g.fillCircle(21 * s, 8 * s, 3 * s);
  g.fillCircle(43 * s, 10 * s, 3 * s);
};

const drawBuoy: DrawFn = (g, s) => {
  g.fillStyle(0xf2c14e, 1);
  g.fillCircle(24 * s, 24 * s, 16 * s);
  g.fillStyle(0xd94f4f, 1);
  g.fillRect(8 * s, 20 * s, 32 * s, 8 * s);
  g.fillStyle(0x222b33, 1);
  g.fillRect(22 * s, 4 * s, 4 * s, 14 * s);
  g.fillStyle(0xfff0c0, 0.9);
  g.fillCircle(19 * s, 19 * s, 4 * s);
};

const drawSeabed: DrawFn = (g, s) => {
  const width = 128 * s;
  const height = 170 * s;
  g.fillGradientStyle(0x4b6254, 0x3c5145, 0x182a26, 0x0d1918, 1);
  g.fillRect(0, 0, width, height);

  // A quiet sandy shelf, with darker depth toward the bottom. This stays
  // deliberately low-contrast so the organisms and diver remain primary.
  g.fillStyle(0xb0956f, 0.18);
  g.fillEllipse(20 * s, 18 * s, 44 * s, 13 * s);
  g.fillEllipse(84 * s, 30 * s, 62 * s, 17 * s);
  g.fillStyle(0xc0a77d, 0.16);
  for (let x = 0; x < 128 * s; x += 18 * s) {
    g.fillEllipse(x + 7 * s, 10 * s + ((x / s) % 3) * 4 * s, 5 * s, 3 * s);
    g.fillEllipse(x + 14 * s, 58 * s + ((x / s) % 4) * 5 * s, 3 * s, 2 * s);
  }
  g.fillStyle(0x223b31, 0.45);
  for (let x = 0; x < width; x += 16 * s) {
    g.fillEllipse(x + 8 * s, 148 * s, 18 * s, 13 * s);
  }
};

/* --------------------- canvas-based (soft) textures ------------------- */

/** A soft translucent bubble ring, drawn with a 2D canvas for smooth edges. */
function ensureBubble(scene: Phaser.Scene): void {
  if (scene.textures.exists(BUBBLE_TEXTURE)) return;
  const size = 48;
  const canvas = scene.textures.createCanvas(BUBBLE_TEXTURE, size, size);
  if (canvas === null) return;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(210, 240, 255, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(size * 0.38, size * 0.36, 4, 0, Math.PI * 2);
  ctx.fill();
  canvas.refresh();
}

/** A soft vertical light shaft that fades out downward and at the edges. */
function ensureLightray(scene: Phaser.Scene): void {
  if (scene.textures.exists(LIGHTRAY_TEXTURE)) return;
  const w = 64;
  const h = 512;
  const canvas = scene.textures.createCanvas(LIGHTRAY_TEXTURE, w, h);
  if (canvas === null) return;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, w, h);

  const vertical = ctx.createLinearGradient(0, 0, 0, h);
  vertical.addColorStop(0, 'rgba(190, 235, 255, 0.55)');
  vertical.addColorStop(1, 'rgba(190, 235, 255, 0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, w, h);

  // Soften the vertical edges so the shaft looks volumetric.
  ctx.globalCompositeOperation = 'destination-in';
  const horizontal = ctx.createLinearGradient(0, 0, w, 0);
  horizontal.addColorStop(0, 'rgba(0, 0, 0, 0)');
  horizontal.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
  horizontal.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';

  canvas.refresh();
}

/** A radial vignette (transparent centre, dark edges) for underwater depth. */
function ensureVignette(scene: Phaser.Scene): void {
  if (scene.textures.exists(VIGNETTE_TEXTURE)) return;
  const size = 256;
  const canvas = scene.textures.createCanvas(VIGNETTE_TEXTURE, size, size);
  if (canvas === null) return;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.28,
    size / 2,
    size / 2,
    size * 0.62,
  );
  gradient.addColorStop(0, 'rgba(2, 12, 22, 0)');
  gradient.addColorStop(1, 'rgba(2, 12, 22, 0.75)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  canvas.refresh();
}

/**
 * Generate every placeholder texture used by the dive environment. Idempotent
 * and cheap; call once (e.g. in PreloadScene). No external image assets.
 */
export function ensureTextures(scene: Phaser.Scene): void {
  bake(scene, decorTextureKey('coral'), 64, 68, drawCoral);
  bake(scene, decorTextureKey('rock'), 64, 60, drawRock);
  bake(scene, decorTextureKey('seagrass'), 64, 66, drawSeagrass);
  bake(scene, decorTextureKey('buoy'), 48, 40, drawBuoy);
  bake(scene, SEABED_TEXTURE, 128, 170, drawSeabed);
  ensureBubble(scene);
  ensureLightray(scene);
  ensureVignette(scene);
}
