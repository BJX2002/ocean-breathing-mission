/** Normalised movement + action intent, produced by input adapters. */
export interface InputState {
  /** Horizontal axis in [-1, 1]. */
  x: number;
  /** Vertical axis in [-1, 1]. */
  y: number;
  /** Whether the primary action (photograph/scan) is active. */
  action: boolean;
}

/**
 * Common contract for every input source. Adapters translate a device
 * (keyboard, touch, ...) into a device-agnostic {@link InputState} so gameplay
 * code never talks to a specific device directly.
 */
export interface InputAdapter {
  /** Read the current intent. Called once per frame by the InputManager. */
  getState(): InputState;
  /** Release any listeners/resources. */
  destroy(): void;
}

export function emptyInputState(): InputState {
  return { x: 0, y: 0, action: false };
}
