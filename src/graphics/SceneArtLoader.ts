import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';
import type { ArtAsset } from './assetManifest';

/**
 * Queue one chapter's art and draw a real progress screen while Phaser loads
 * it. Already-cached textures are skipped, so returning to a chapter is
 * immediate.
 */
export function queueSceneArt(scene: Phaser.Scene, manifest: readonly ArtAsset[]): void {
  const pending = manifest.filter((asset) => !scene.textures.exists(asset.key));
  if (pending.length === 0) return;

  const background = scene.add
    .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, Palette.deepSea, 1)
    .setOrigin(0)
    .setDepth(10_000);
  const title = scene.add
    .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 72, i18n.t('loading.label'), {
      fontFamily: 'sans-serif',
      fontSize: '33px',
      color: Palette.textLight,
    })
    .setOrigin(0.5)
    .setDepth(10_001);
  const frame = scene.add.graphics().setDepth(10_001);
  const fill = scene.add.graphics().setDepth(10_001);
  const barWidth = 720;
  const barHeight = 42;
  const barX = (GAME_WIDTH - barWidth) / 2;
  const barY = GAME_HEIGHT / 2;
  frame.lineStyle(3, Palette.accent, 1).strokeRect(barX, barY, barWidth, barHeight);

  const drawProgress = (progress: number): void => {
    fill.clear();
    fill.fillStyle(Palette.accent, 1);
    fill.fillRect(barX + 3, barY + 3, (barWidth - 6) * progress, barHeight - 6);
    title.setText(`${i18n.t('loading.label')} ${Math.round(progress * 100)}%`);
  };
  drawProgress(0);

  const onFileError = (file: Phaser.Loader.File): void => {
    console.warn(`[SceneArtLoader] Missing art asset "${file.key}" (${file.url}).`);
  };
  const cleanup = (): void => {
    scene.load.off(Phaser.Loader.Events.PROGRESS, drawProgress);
    scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
    background.destroy();
    title.destroy();
    frame.destroy();
    fill.destroy();
  };

  scene.load.on(Phaser.Loader.Events.PROGRESS, drawProgress);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
  scene.load.once(Phaser.Loader.Events.COMPLETE, cleanup);

  for (const asset of pending) {
    if (asset.type === 'image') scene.load.image(asset.key, asset.url);
    else scene.load.atlas(asset.key, asset.textureUrl, asset.atlasUrl);
  }
}
