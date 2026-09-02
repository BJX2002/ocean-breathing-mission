import Phaser from 'phaser';
import type { InputAdapter, InputState } from './InputAdapter';
import { emptyInputState } from './InputAdapter';

/**
 * Desktop keyboard + WASD/arrow adapter. Space (or Enter) is the action key.
 */
export class KeyboardInputAdapter implements InputAdapter {
  private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (keyboard === null) {
      return;
    }
    this.keys.up = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keys.down = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keys.left = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keys.right = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keys.upArrow = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keys.downArrow = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keys.leftArrow = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keys.rightArrow = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.keys.action = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  private down(name: string): boolean {
    return this.keys[name]?.isDown ?? false;
  }

  getState(): InputState {
    const state = emptyInputState();
    if (this.down('left') || this.down('leftArrow')) state.x -= 1;
    if (this.down('right') || this.down('rightArrow')) state.x += 1;
    if (this.down('up') || this.down('upArrow')) state.y -= 1;
    if (this.down('down') || this.down('downArrow')) state.y += 1;
    state.action = this.down('action');
    return state;
  }

  destroy(): void {
    for (const key of Object.values(this.keys)) {
      key.destroy();
    }
  }
}
