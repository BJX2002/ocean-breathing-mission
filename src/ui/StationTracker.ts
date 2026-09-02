import Phaser from 'phaser';
import { Palette } from '../config/constants';
import { eventBus, type GameEventMap } from '../events/EventBus';
import { i18n } from '../i18n/LocaleService';

/**
 * HUD readout of discovered camera stations (e.g. "Stations: 1/3").
 *
 * Pure presentation: listens to `station:discovered` on the EventBus and never
 * reads gameplay entities directly.
 */
export class StationTracker {
  private readonly text: Phaser.GameObjects.Text;

  private readonly onDiscovered = (payload: GameEventMap['station:discovered']): void => {
    this.render(payload.discovered, payload.total);
  };

  constructor(scene: Phaser.Scene, x: number, y: number, total: number) {
    this.text = scene.add
      .text(x, y, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: Palette.textLight,
      })
      .setScrollFactor(0)
      .setDepth(1000);
    this.render(0, total);

    eventBus.on('station:discovered', this.onDiscovered);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private render(discovered: number, total: number): void {
    this.text.setText(`${i18n.t('hud.stations')}: ${discovered}/${total}`);
  }

  destroy(): void {
    eventBus.off('station:discovered', this.onDiscovered);
    this.text.destroy();
  }
}
