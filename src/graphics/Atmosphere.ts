import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  SKY_HEIGHT,
  SURFACE_BAND_HEIGHT,
  WATER_SURFACE_Y,
} from '../config/constants';
import { BUBBLE_TEXTURE, LIGHTRAY_TEXTURE, VIGNETTE_TEXTURE } from './TextureFactory';

export interface AtmosphereOptions {
  readonly showSurface?: boolean;
}

/**
 * Procedural underwater atmosphere: a vertical water gradient, animated light
 * shafts and a stream of rising bubbles. Purely decorative and entirely
 * runtime-generated (no external art). Self-animates via tweens/particles.
 */
export class Atmosphere {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, options: AtmosphereOptions = {}) {
    const showSurface = options.showSurface === true;
    const waterTop = showSurface ? WATER_SURFACE_Y : 0;

    if (showSurface) this.createSurface(scene);

    // Water gradient: bright teal near the surface, deep navy at the bottom.
    const background = scene.add.graphics().setDepth(-20);
    background.fillGradientStyle(0x1a6b86, 0x1a6b86, 0x04101c, 0x04101c, 1);
    background.fillRect(0, waterTop, GAME_WIDTH, GAME_HEIGHT - waterTop);
    this.objects.push(background);

    // Light shafts drifting down from the surface.
    const rayX = [300, 780, 1230, 1620];
    rayX.forEach((x, i) => {
      const ray = scene.add
        .image(x, waterTop - 70, LIGHTRAY_TEXTURE)
        .setOrigin(0.5, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAngle(10)
        .setAlpha(0.14)
        .setScale(2.1, (GAME_HEIGHT - waterTop + 300) / 512)
        .setDepth(-10);
      scene.tweens.add({
        targets: ray,
        alpha: { from: 0.08, to: 0.22 },
        angle: { from: 8, to: 13 },
        duration: 3200 + i * 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.objects.push(ray);
    });

    // Rising bubbles spawned across the full width from just below the screen.
    const bubbles = scene.add
      .particles(0, 0, BUBBLE_TEXTURE, {
        x: { min: 0, max: GAME_WIDTH },
        y: GAME_HEIGHT + 20,
        quantity: 1,
        frequency: 220,
        lifespan: { min: 4500, max: 8500 },
        speedY: { min: -90, max: -38 },
        speedX: { min: -15, max: 15 },
        scale: { start: 0.55, end: 0.14 },
        alpha: { start: 0.5, end: 0 },
        rotate: { min: 0, max: 360 },
      })
      .setDepth(8);
    this.objects.push(bubbles);

    // Vignette overlay for underwater depth (below the diver so it stays clear).
    const vignette = scene.add
      .image(GAME_WIDTH / 2, waterTop + (GAME_HEIGHT - waterTop) / 2, VIGNETTE_TEXTURE)
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT - waterTop)
      .setDepth(6);
    this.objects.push(vignette);
  }

  private createSurface(scene: Phaser.Scene): void {
    const sky = scene.add.graphics().setDepth(-35);
    sky.fillGradientStyle(0xc8edf5, 0xc8edf5, 0x86c8dd, 0x86c8dd, 1);
    sky.fillRect(0, 0, GAME_WIDTH, SKY_HEIGHT);
    sky.fillStyle(0xffffff, 0.11);
    sky.fillEllipse(300, 40, 280, 22);
    sky.fillEllipse(1130, 26, 360, 18);
    sky.fillEllipse(1700, 68, 250, 18);
    this.objects.push(sky);

    const surfaceBand = scene.add.graphics().setDepth(-30);
    surfaceBand.fillGradientStyle(0x58aabd, 0x58aabd, 0x1c7187, 0x1c7187, 1);
    surfaceBand.fillRect(0, SKY_HEIGHT, GAME_WIDTH, SURFACE_BAND_HEIGHT);
    surfaceBand.fillStyle(0xc1f5ec, 0.16);
    surfaceBand.fillEllipse(370, SKY_HEIGHT + 22, 430, 14);
    surfaceBand.fillEllipse(1330, SKY_HEIGHT + 30, 560, 12);
    this.objects.push(surfaceBand);

    const surfaceLine = scene.add.graphics().setDepth(-5);
    surfaceLine.lineStyle(2, 0xd7fff7, 0.62);
    surfaceLine.beginPath();
    surfaceLine.moveTo(0, WATER_SURFACE_Y - 2);
    for (let x = 0; x <= GAME_WIDTH; x += 80) {
      surfaceLine.lineTo(x + 40, WATER_SURFACE_Y - (x / 80) % 2 * 3 - 1);
      surfaceLine.lineTo(x + 80, WATER_SURFACE_Y - 2);
    }
    surfaceLine.strokePath();
    surfaceLine.lineStyle(1, 0xb4e8e4, 0.3);
    surfaceLine.lineBetween(0, WATER_SURFACE_Y + 8, GAME_WIDTH, WATER_SURFACE_Y + 8);
    this.objects.push(surfaceLine);
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }
}
