import Phaser from 'phaser';
import { HABITAT_FLOOR_Y, WATER_SURFACE_Y } from '../config/constants';

const ANCHOR_MARGIN = 20;
const SURFACE_BUOY_OFFSET = 12;

/**
 * Presentation-only mooring assembly.
 *
 * CameraStation remains anchored to the interaction point. The child stays at
 * the station origin and uses offsets relative to that origin: the detector
 * remains at the historical station depth, the buoy reaches the surface, and
 * the anchor reaches the seabed.
 */
export class MooringVisual {
  readonly root: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, ordinal: number, stationY: number) {
    // Do not subtract stationY here. The parent CameraStation is already
    // positioned at stationY; applying it twice was pulling the whole mooring
    // above the water and leaving only fragments visible in the scene.
    this.root = scene.add.container(0, 0);

    // The buoy straddles the surface instead of sitting high in the sky.
    const surfaceY = WATER_SURFACE_Y + SURFACE_BUOY_OFFSET - stationY;
    const instrumentY = 0;
    const anchorY = HABITAT_FLOOR_Y - ANCHOR_MARGIN - stationY;
    const instrumentHeight = 104 + Math.min(Math.max(ordinal, 1), 3) * 3;
    const instrumentTop = instrumentY - instrumentHeight / 2;
    const instrumentBottom = instrumentY + instrumentHeight / 2;

    this.addCableRun(scene, surfaceY + 40, instrumentTop - 12, 0.92);

    // Keep the terminal hardware and chain close to the anchor. The small
    // yellow float is a lower-line marker, not a second mid-water buoy.
    const lowerChainY = anchorY - 42;
    this.addCableRun(scene, instrumentBottom + 12, anchorY - 30, 0.9);

    const buoy = this.addImage(scene, 'chapter1-mooring-buoy-top', 0, surfaceY, 156, 96);
    if (buoy !== null) {
      // Surface buoys respond to the wave motion; the detector and anchor stay
      // fixed so the mooring still reads as a real anchored instrument.
      scene.tweens.add({
        targets: buoy,
        x: { from: -9, to: 9 },
        angle: { from: -2.6, to: 2.6 },
        duration: 2800 + ordinal * 180,
        delay: ordinal * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    this.addImage(scene, 'chapter1-mooring-connector', 0, instrumentTop - 18, 34, 42);
    this.addImage(scene, 'chapter1-mooring-instrument', 0, instrumentY, 86, instrumentHeight + 24);
    this.addImage(scene, 'chapter1-mooring-chain', 0, lowerChainY, 24, 58);
    this.addImage(scene, 'chapter1-mooring-anchor', 0, anchorY, 112, 64);

    const coreKeys = [
      'chapter1-mooring-buoy-top',
      'chapter1-mooring-instrument',
      'chapter1-mooring-anchor',
    ];
    if (!coreKeys.every((key) => scene.textures.exists(key))) {
      this.drawFallback(scene, surfaceY, instrumentY, anchorY);
    }
  }

  private addCableRun(
    scene: Phaser.Scene,
    fromY: number,
    toY: number,
    alpha: number,
  ): void {
    if (toY <= fromY) return;
    const cable = scene.add.graphics();
    cable.lineStyle(7, 0x172a35, alpha);
    cable.lineBetween(0, fromY, 0, toY);
    cable.lineStyle(2, 0x8ca8ac, alpha * 0.7);
    cable.lineBetween(3, fromY, 3, toY);

    // Small repeated bands give the long cable scale without stretching a
    // complete raster image from the surface to the seabed.
    cable.fillStyle(0xf0c95a, alpha * 0.68);
    for (let y = fromY + 92; y < toY - 14; y += 126) {
      cable.fillRect(-3, y, 6, 16);
    }
    this.root.add(cable);
  }

  private addImage(
    scene: Phaser.Scene,
    key: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
  ): Phaser.GameObjects.Image | null {
    if (!scene.textures.exists(key)) return null;
    const source = scene.textures.get(key).getSourceImage();
    const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
    const image = scene.add.image(x, y, key).setScale(scale);
    this.root.add(image);
    return image;
  }

  private drawFallback(
    scene: Phaser.Scene,
    surfaceY: number,
    instrumentY: number,
    anchorY: number,
  ): void {
    const fallback = scene.add.graphics();
    fallback.fillStyle(0xf0b94d, 0.96);
    fallback.fillEllipse(0, surfaceY, 112, 62);
    fallback.lineStyle(6, 0x203443, 1);
    fallback.strokeEllipse(0, surfaceY, 112, 62);

    fallback.fillStyle(0x5bcbd0, 0.96);
    fallback.fillRoundedRect(-30, instrumentY - 44, 60, 88, 10);
    fallback.lineStyle(4, 0x1c2f3d, 1);
    fallback.strokeRoundedRect(-30, instrumentY - 44, 60, 88, 10);

    fallback.fillStyle(0xf0c95a, 0.95);
    fallback.fillCircle(0, anchorY - 106, 13);

    fallback.fillStyle(0x55636d, 0.95);
    fallback.fillTriangle(-42, anchorY - 20, 42, anchorY - 20, 28, anchorY + 24);
    this.root.add(fallback);
  }
}
