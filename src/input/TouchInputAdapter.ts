import Phaser from 'phaser';
import type { InputAdapter, InputState } from './InputAdapter';
import { emptyInputState } from './InputAdapter';

/** Distance (px) from the touch origin that maps to full axis deflection. */
const MAX_DRAG_RADIUS = 96;

/**
 * Tablet/touch adapter implementing a simple drag joystick: the first touch
 * sets an origin, and dragging away from it produces a movement vector. The act
 * of touching also counts as the action input for this MVP shell.
 */
export class TouchInputAdapter implements InputAdapter {
  private origin: Phaser.Math.Vector2 | null = null;
  private current: Phaser.Math.Vector2 | null = null;
  private isTouching = false;

  private readonly onDown = (pointer: Phaser.Input.Pointer): void => {
    this.origin = new Phaser.Math.Vector2(pointer.x, pointer.y);
    this.current = this.origin.clone();
    this.isTouching = true;
  };

  private readonly onMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.isTouching) {
      this.current = new Phaser.Math.Vector2(pointer.x, pointer.y);
    }
  };

  private readonly onUp = (): void => {
    this.origin = null;
    this.current = null;
    this.isTouching = false;
  };

  constructor(private readonly scene: Phaser.Scene) {
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
  }

  getState(): InputState {
    const state = emptyInputState();
    if (!this.isTouching || this.origin === null || this.current === null) {
      return state;
    }
    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    state.x = Phaser.Math.Clamp(dx / MAX_DRAG_RADIUS, -1, 1);
    state.y = Phaser.Math.Clamp(dy / MAX_DRAG_RADIUS, -1, 1);
    state.action = true;
    return state;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
  }
}
