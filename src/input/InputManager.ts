import Phaser from 'phaser';
import type { InputAdapter, InputState } from './InputAdapter';
import { emptyInputState } from './InputAdapter';
import { KeyboardInputAdapter } from './KeyboardInputAdapter';
import { TouchInputAdapter } from './TouchInputAdapter';
import { usesTouchControls } from './ControlScheme';

/**
 * Aggregates all active input adapters and merges their intents into a single
 * {@link InputState}. Keyboard and touch adapters run simultaneously so a
 * hybrid device (touch laptop) works with either method.
 */
export class InputManager {
  private readonly adapters: InputAdapter[] = [];
  private readonly touchAdapter: TouchInputAdapter | null;

  constructor(scene: Phaser.Scene) {
    this.adapters.push(new KeyboardInputAdapter(scene));
    this.touchAdapter = usesTouchControls(scene) ? new TouchInputAdapter(scene) : null;
    if (this.touchAdapter !== null) this.adapters.push(this.touchAdapter);
  }

  /** Merge every adapter's state; movement is clamped to the unit range. */
  getState(): InputState {
    const merged = emptyInputState();
    for (const adapter of this.adapters) {
      const state = adapter.getState();
      merged.x += state.x;
      merged.y += state.y;
      merged.action = merged.action || state.action;
      merged.cancel = merged.cancel || state.cancel;
    }
    merged.x = Phaser.Math.Clamp(merged.x, -1, 1);
    merged.y = Phaser.Math.Clamp(merged.y, -1, 1);
    return merged;
  }

  usesTouchControls(): boolean {
    return this.touchAdapter !== null;
  }

  setTouchControlsVisible(visible: boolean): void {
    this.touchAdapter?.setVisible(visible);
  }

  setTouchActionLabel(label: string): void {
    this.touchAdapter?.setActionLabel(label);
  }

  setTouchCancelVisible(visible: boolean): void {
    this.touchAdapter?.setCancelVisible(visible);
  }

  isTouchControlPoint(x: number, y: number): boolean {
    return this.touchAdapter?.containsControlPoint(x, y) ?? false;
  }

  destroy(): void {
    for (const adapter of this.adapters) {
      adapter.destroy();
    }
    this.adapters.length = 0;
  }
}
