import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette } from './constants';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { OpeningScene } from '../scenes/OpeningScene';
import { DiveScene } from '../scenes/DiveScene';
import { Chapter2LabScene } from '../scenes/Chapter2LabScene';

/**
 * Build the responsive Phaser game configuration.
 *
 * Uses a fixed 16:9 logical resolution scaled with `Scale.FIT` and centred, so
 * the same layout works on desktop, laptop and tablet without stretching.
 */
export function createGameConfig(parent: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent,
    backgroundColor: Palette.deepSea,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    // Enable both mouse and multi-touch for desktop + tablet support.
    input: {
      activePointers: 3,
      touch: true,
      mouse: true,
    },
    render: {
      pixelArt: false,
      antialias: true,
    },
    scene: [BootScene, PreloadScene, MenuScene, OpeningScene, DiveScene, Chapter2LabScene],
  };
}
