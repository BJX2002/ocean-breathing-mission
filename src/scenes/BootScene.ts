import Phaser from 'phaser';
import { SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { saveService } from '../services/SaveService';
import { gameState } from '../state/GameState';

/**
 * First scene. Performs cheap, synchronous bootstrapping (load save file,
 * announce the scene) then hands off to the PreloadScene. No heavy asset or
 * data loading happens here.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    // Restore persisted progress if present.
    const save = saveService.load();
    if (save !== null) {
      gameState.loadSave(save);
    }

    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Boot });
    this.scene.start(SceneKeys.Preload);
  }
}
