import Phaser from 'phaser';
import { Palette } from '../config/constants';
import { eventBus, type GameEventMap } from '../events/EventBus';
import { i18n } from '../i18n/LocaleService';

const WIDTH = 300;
const HEIGHT = 12;

/**
 * HUD oxygen gauge.
 *
 * Pure presentation: it listens to `oxygen:changed` on the EventBus and never
 * reads the OxygenSystem directly, keeping UI decoupled from gameplay systems.
 */
export class OxygenGauge {
  private readonly label: Phaser.GameObjects.Text;
  private readonly value: Phaser.GameObjects.Text;
  private readonly track: Phaser.GameObjects.Graphics;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly x: number;
  private readonly y: number;

  private readonly onChange = (payload: GameEventMap['oxygen:changed']): void => {
    this.draw(payload.current, payload.max);
  };

  constructor(scene: Phaser.Scene, x: number, y: number, autoDestroyOnShutdown = true) {
    this.x = x;
    this.y = y;

    this.label = scene.add
      .text(x, y - 35, i18n.t('hud.oxygenShort'), {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setDepth(1000);

    this.value = scene.add
      .text(x + WIDTH, y - 35, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.track = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    this.drawTrack();

    this.fill = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    eventBus.on('oxygen:changed', this.onChange);
    if (autoDestroyOnShutdown) scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private draw(current: number, max: number): void {
    const ratio = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
    const colour = ratio > 0.7 ? Palette.accent : ratio > 0.4 ? 0xf2c75c : 0xf07d5f;
    this.fill.clear();
    this.fill.fillStyle(colour, 1);
    this.fill.fillRoundedRect(this.x, this.y, WIDTH * ratio, HEIGHT, HEIGHT / 2);
    this.value.setText(`${Math.round(current)}%`).setColor(
      ratio > 0.7 ? Palette.accentText : ratio > 0.4 ? '#f2c75c' : '#f07d5f',
    );
  }

  destroy(): void {
    eventBus.off('oxygen:changed', this.onChange);
    this.label.destroy();
    this.value.destroy();
    this.track.destroy();
    this.fill.destroy();
  }

  private drawTrack(): void {
    this.track.clear();
    this.track.fillStyle(0x0b3a4c, 0.86);
    this.track.fillRoundedRect(this.x, this.y, WIDTH, HEIGHT, HEIGHT / 2);
    this.track.lineStyle(1, Palette.accent, 0.34);
    this.track.strokeRoundedRect(this.x, this.y, WIDTH, HEIGHT, HEIGHT / 2);
  }
}
