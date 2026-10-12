import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette, SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { i18n } from '../i18n/LocaleService';
import { loadGameData } from '../services/DataLoader';
import { gameState } from '../state/GameState';
import { ensureTextures } from '../graphics/TextureFactory';
import { CORE_ART_MANIFEST } from '../graphics/assetManifest';

const ART_PROGRESS_SHARE = 0.8;

/**
 * Loads external art (if any), generates procedural placeholders for anything
 * not supplied, then loads and validates all game data — all behind a progress
 * bar. Finally injects data into {@link gameState} and starts the MenuScene.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Preload);
  }

  create(): void {
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Preload });

    const barWidth = 720;
    const barHeight = 42;
    const x = (GAME_WIDTH - barWidth) / 2;
    const y = GAME_HEIGHT / 2;

    const label = this.add
      .text(GAME_WIDTH / 2, y - 72, i18n.t('loading.label'), {
        fontFamily: 'sans-serif',
        fontSize: '33px',
        color: Palette.textLight,
      })
      .setOrigin(0.5);

    // Bar frame (drawn at runtime — no external image assets).
    const frame = this.add.graphics();
    frame.lineStyle(3, Palette.accent, 1);
    frame.strokeRect(x, y, barWidth, barHeight);

    const fill = this.add.graphics();

    const drawFill = (progress: number): void => {
      fill.clear();
      fill.fillStyle(Palette.accent, 1);
      fill.fillRect(x + 3, y + 3, (barWidth - 6) * progress, barHeight - 6);
    };
    drawFill(0);

    this.loadArtThen(drawFill, label, () => {
      // Bake procedural placeholders only for keys not provided by real art.
      ensureTextures(this);
      void this.loadAll(
        (progress) => drawFill(ART_PROGRESS_SHARE + progress * (1 - ART_PROGRESS_SHARE)),
        label,
      );
    });
  }

  /**
   * Queue any external art from the manifest, then invoke `next`. Missing files
   * are logged and skipped so the game still runs with placeholders.
   */
  private loadArtThen(
    drawFill: (progress: number) => void,
    label: Phaser.GameObjects.Text,
    next: () => void,
  ): void {
    if (CORE_ART_MANIFEST.length === 0) {
      next();
      return;
    }

    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      console.warn(`[PreloadScene] Missing art asset "${file.key}" (${file.url}); using placeholder.`);
    });

    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      const overallProgress = progress * ART_PROGRESS_SHARE;
      drawFill(overallProgress);
      label.setText(`${i18n.t('loading.label')} ${Math.round(overallProgress * 100)}%`);
    });

    for (const asset of CORE_ART_MANIFEST) {
      if (asset.type === 'image') {
        this.load.image(asset.key, asset.url);
      } else {
        this.load.atlas(asset.key, asset.textureUrl, asset.atlasUrl);
      }
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, next);
    this.load.start();
  }

  private async loadAll(
    drawFill: (progress: number) => void,
    label: Phaser.GameObjects.Text,
  ): Promise<void> {
    try {
      const data = await loadGameData((progress, file) => {
        drawFill(progress);
        label.setText(`${i18n.t('loading.label')} ${file}`);
        eventBus.emit('loading:progress', { progress, label: file });
      });

      gameState.setData(data);
      eventBus.emit('loading:complete', { totalFiles: 7 });
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') {
        gameState.debugMode = true;
        const requestedScene = params.get('scene');
        if (requestedScene === 'opening') {
          this.scene.start(SceneKeys.Opening);
          return;
        }
        if (requestedScene === 'dive') {
          this.scene.start(SceneKeys.Dive);
          return;
        }
        if (requestedScene === 'lab') {
          this.scene.start(SceneKeys.Chapter2Lab);
          return;
        }
      }
      this.scene.start(SceneKeys.Menu);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      label.setColor('#ff8a8a').setText(`Data error: ${message}`);
      // Surface the failure loudly; do not proceed with invalid data.
      console.error('[PreloadScene] Failed to load game data:', error);
    }
  }
}
