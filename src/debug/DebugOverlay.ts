import Phaser from 'phaser';
import { Palette } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { gameState } from '../state/GameState';
import { OxygenModel } from '../simulation/OxygenModel';

/** Returns true when debug mode is requested via `?debug=1` in the URL. */
export function isDebugEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  } catch {
    return false;
  }
}

/**
 * Lightweight debug HUD: shows FPS and lets you cycle oxygen scenarios with the
 * `O` key. Cycling updates {@link gameState} and broadcasts on the event bus so
 * gameplay/UI can react without the debug tool knowing about them.
 */
export class DebugOverlay {
  private readonly fpsText: Phaser.GameObjects.Text;
  private readonly scenarioText: Phaser.GameObjects.Text;
  private readonly oxygenModel: OxygenModel;
  private readonly scenarioIds: string[];

  constructor(private readonly scene: Phaser.Scene) {
    this.oxygenModel = new OxygenModel(gameState.getData().oxygen);
    this.scenarioIds = this.oxygenModel.getScenarioIds();

    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: Palette.textLight,
      backgroundColor: '#00000066',
      padding: { x: 9, y: 6 },
    };

    this.fpsText = scene.add.text(12, 12, '', style).setScrollFactor(0).setDepth(1000);
    this.scenarioText = scene.add
      .text(12, 54, '', style)
      .setScrollFactor(0)
      .setDepth(1000);

    scene.input.keyboard?.on('keydown-O', this.cycleScenario, this);
    this.refreshScenarioText();

    // Clean up listeners when the host scene shuts down.
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private cycleScenario(): void {
    if (this.scenarioIds.length === 0) return;
    const currentIndex = this.scenarioIds.indexOf(gameState.currentScenarioId);
    const nextIndex = (currentIndex + 1) % this.scenarioIds.length;
    const nextId = this.scenarioIds[nextIndex];
    if (nextId === undefined) return;
    gameState.currentScenarioId = nextId;
    eventBus.emit('oxygen:scenarioChanged', { scenarioId: nextId });
    this.refreshScenarioText();
  }

  private refreshScenarioText(): void {
    this.scenarioText.setText(`Scenario [O]: ${gameState.currentScenarioId}`);
  }

  /** Call from the host scene's `update()` to refresh the FPS readout. */
  update(): void {
    const fps = Math.round(this.scene.game.loop.actualFps);
    this.fpsText.setText(`FPS: ${fps}`);
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-O', this.cycleScenario, this);
    this.fpsText.destroy();
    this.scenarioText.destroy();
  }
}
