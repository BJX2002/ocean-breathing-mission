import Phaser from 'phaser';
import type { InputAdapter, InputState } from './InputAdapter';
import { emptyInputState } from './InputAdapter';
import { KeyboardInputAdapter } from './KeyboardInputAdapter';
import { TouchInputAdapter } from './TouchInputAdapter';

/**
 * Aggregates all active input adapters and merges their intents into a single
 * {@link InputState}. Keyboard and touch adapters run simultaneously so a
 * hybrid device (touch laptop) works with either method.
 */
export class InputManager {
  private readonly adapters: InputAdapter[] = [];

  constructor(scene: Phaser.Scene) {
    this.adapters.push(new KeyboardInputAdapter(scene));
    // Only attach touch handling when the device reports touch support.
    if (scene.sys.game.device.input.touch) {
      this.adapters.push(new TouchInputAdapter(scene));
    }
  }

  /** Merge every adapter's state; movement is clamped to the unit range. */
  getState(): InputState {
    const merged = emptyInputState();
    for (const adapter of this.adapters) {
      const state = adapter.getState();
      merged.x += state.x;
      merged.y += state.y;
      merged.action = merged.action || state.action;
    }
    merged.x = Phaser.Math.Clamp(merged.x, -1, 1);
    merged.y = Phaser.Math.Clamp(merged.y, -1, 1);
    return merged;
  }

  destroy(): void {
    for (const adapter of this.adapters) {
      adapter.destroy();
    }
    this.adapters.length = 0;
  }
}
