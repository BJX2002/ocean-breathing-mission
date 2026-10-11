import Phaser from 'phaser';
import { GAME_WIDTH, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';

/**
 * Reusable labelled help button for opening tutorials/guide overlays.
 */
export class HelpButton {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, onClick: () => void) {
    this.text = scene.add
      .text(GAME_WIDTH - 30, 32, i18n.t('tutorial.button'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: Palette.textLight,
        backgroundColor: '#062838cc',
        padding: { x: 14, y: 9 },
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setDepth(2500)
      .setInteractive({ useHandCursor: true });

    this.text.on(Phaser.Input.Events.POINTER_OVER, () => this.text.setScale(1.05));
    this.text.on(Phaser.Input.Events.POINTER_OUT, () => this.text.setScale(1));
    this.text.on(Phaser.Input.Events.POINTER_UP, onClick);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  destroy(): void {
    this.text.destroy();
  }
}
