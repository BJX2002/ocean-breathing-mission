import Phaser from 'phaser';
import { GAME_WIDTH, Palette } from '../config/constants';

/**
 * Small reusable "?" help button for opening tutorials/guide overlays.
 */
export class HelpButton {
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, onClick: () => void) {
    this.text = scene.add
      .text(GAME_WIDTH - 30, 38, '?', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.textMuted,
        backgroundColor: '#062838cc',
        padding: { x: 9, y: 4 },
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
