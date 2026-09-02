import Phaser from 'phaser';
import { HABITAT_FLOOR_Y, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';
import type { CameraStationPlacement } from '../types';
import { MooringVisual } from './MooringVisual';

/** Distance (px) within which a station is considered discovered. */
const DISCOVERY_RADIUS = 105;
const PHOTO_RADIUS = 190;
const LABEL_RADIUS = 360;

/**
 * A historical survey landmark. CameraStation remains the interaction and
 * progress controller; MooringVisual only replaces its presentation.
 */
export class CameraStation {
  private readonly markerRoot: Phaser.GameObjects.Container;
  private readonly markerGlow: Phaser.GameObjects.Arc;
  private readonly markerStatus: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private readonly focusRing: Phaser.GameObjects.Arc;
  private readonly guidePulse: Phaser.GameObjects.Arc;
  private discovered = false;
  private photographed = false;
  private guidedTarget = false;

  constructor(
    scene: Phaser.Scene,
    private readonly data: CameraStationPlacement,
    ordinal: number,
  ) {
    this.markerRoot = scene.add.container(data.x, data.y).setDepth(5).setAlpha(0.58);
    const mooring = new MooringVisual(scene, ordinal, data.y);
    const shadow = scene.add
      .ellipse(0, HABITAT_FLOOR_Y - data.y - 12, 104, 22, 0x02060c, 0.42)
      .setStrokeStyle(2, 0x17394a, 0.75);
    this.markerGlow = scene.add.circle(0, -43, 60, 0x3fd0c9, 0.06).setVisible(false);
    this.markerStatus = scene.add
      .text(66, -155, '✓', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#91e6a7',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.markerRoot.add([shadow, this.markerGlow, mooring.root, this.markerStatus]);

    this.focusRing = scene.add
      .circle(data.x, data.y, 69, 0x3fd0c9, 0.025)
      .setStrokeStyle(2, 0x9cf7ef, 0.48)
      .setDepth(4)
      .setVisible(false);
    this.guidePulse = scene.add
      .circle(data.x, data.y, 76, 0xf0c95a, 0.055)
      .setStrokeStyle(5, 0xffe57d, 0.98)
      .setDepth(4)
      .setVisible(false);
    scene.tweens.add({
      targets: this.guidePulse,
      scale: { from: 0.92, to: 1.24 },
      alpha: { from: 1, to: 0.12 },
      duration: 950,
      repeat: -1,
      ease: 'Sine.easeOut',
    });

    const labelText = `${i18n.t('dive.mooringLabel')} ${String(ordinal).padStart(2, '0')}`;
    this.label = scene.add
      .text(data.x, data.y - 178, labelText, {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: Palette.textLight,
        backgroundColor: '#062838cc',
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setVisible(false);
  }

  get id(): string {
    return this.data.id;
  }

  get position(): { x: number; y: number } {
    return { x: this.data.x, y: this.data.y };
  }

  get isDiscovered(): boolean {
    return this.discovered;
  }

  get hasPhoto(): boolean {
    return this.photographed;
  }

  get displayName(): string {
    return i18n.getLocale() === 'en' ? this.data.labelEn : this.data.labelZh;
  }

  get canPhotograph(): boolean {
    return !this.photographed;
  }

  distanceTo(x: number, y: number): number {
    return Phaser.Math.Distance.Between(x, y, this.data.x, this.data.y);
  }

  tryDiscover(diverX: number, diverY: number): boolean {
    if (this.discovered) return false;
    const distance = Phaser.Math.Distance.Between(diverX, diverY, this.data.x, this.data.y);
    if (distance > DISCOVERY_RADIUS) return false;

    this.discovered = true;
    this.markerRoot.setAlpha(1);
    this.label.setVisible(false);
    this.markerRoot.scene.tweens.add({
      targets: this.markerRoot,
      scale: { from: 1.04, to: 1 },
      duration: 250,
      ease: 'Back.easeOut',
    });
    return true;
  }

  tryPhotograph(diverX: number, diverY: number): boolean {
    const distance = Phaser.Math.Distance.Between(diverX, diverY, this.data.x, this.data.y);
    if (distance > PHOTO_RADIUS || this.photographed) return false;
    this.tryDiscover(diverX, diverY);
    this.photographed = true;
    this.markerGlow.setVisible(true);
    this.markerStatus.setVisible(true);
    this.markerRoot.scene.tweens.add({
      targets: this.markerRoot,
      scale: { from: 1.03, to: 1 },
      duration: 180,
      ease: 'Sine.easeOut',
    });
    return true;
  }

  setGuidedTarget(guided: boolean): void {
    this.guidedTarget = guided && !this.photographed;
  }

  updateFocus(diverX: number, diverY: number): void {
    const distance = Phaser.Math.Distance.Between(diverX, diverY, this.data.x, this.data.y);
    const near = distance <= PHOTO_RADIUS;
    this.focusRing.setVisible(near || this.guidedTarget);
    this.guidePulse.setVisible(this.guidedTarget);
    this.label.setVisible(
      this.guidedTarget || (distance > PHOTO_RADIUS && distance <= LABEL_RADIUS),
    );
    if (!this.guidedTarget) {
      this.label.setColor(Palette.textLight).setBackgroundColor('#062838cc');
    }
    if (this.guidedTarget) {
      this.focusRing.setFillStyle(0xf0c95a, 0.07).setStrokeStyle(7, 0xffe57d, 1);
      this.label.setColor('#fff3a8').setBackgroundColor('#4b3b13dd');
    } else if (near) {
      this.focusRing.setFillStyle(0x3fd0c9, 0.018);
      this.focusRing.setStrokeStyle(3, this.photographed ? 0x91e6a7 : 0x9cf7ef, 0.72);
    }
  }

  destroy(): void {
    this.markerRoot.destroy(true);
    this.label.destroy();
    this.focusRing.destroy();
    this.guidePulse.destroy();
  }
}
