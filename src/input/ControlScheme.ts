import Phaser from 'phaser';
import { i18n } from '../i18n/LocaleService';

export type ControlScheme = 'keyboard' | 'touch';

/**
 * Resolve the controls once from the current device. Query-string overrides
 * make the tablet UI testable on a desktop browser.
 */
export function getControlScheme(scene: Phaser.Scene): ControlScheme {
  if (typeof window !== 'undefined') {
    const override = new URLSearchParams(window.location.search).get('controls');
    if (override === 'touch' || override === 'keyboard') {
      return override;
    }
  }

  return scene.sys.game.device.input.touch ? 'touch' : 'keyboard';
}

export function usesTouchControls(scene: Phaser.Scene): boolean {
  return getControlScheme(scene) === 'touch';
}

/** Return the device-appropriate version of an instructional string. */
export function inputPrompt(scene: Phaser.Scene, key: string): string {
  if (!usesTouchControls(scene)) return i18n.t(key);
  const touchKey = `${key}.touch`;
  const touchValue = i18n.t(touchKey);
  return touchValue === touchKey ? i18n.t(key) : touchValue;
}
