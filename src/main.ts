import Phaser from 'phaser';
import { createGameConfig } from './config/gameConfig';

/**
 * Application entry point. Finds the mount element and creates the Phaser game
 * with the responsive 16:9 configuration. No game logic lives here.
 */
function bootstrap(): void {
  const parent = document.getElementById('game');
  if (parent === null) {
    throw new Error('Mount element #game not found in index.html');
  }
  new Phaser.Game(createGameConfig(parent));
}

bootstrap();
