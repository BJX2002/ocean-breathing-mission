import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';
import { OxygenGauge } from './OxygenGauge';
import {
  chooseHudInteraction,
  selectCurrentStation,
  type HudInteraction,
  type HudStationProgress,
} from './HudModel';

const SAFE_MARGIN = 48;
const HUD_DEPTH = 900;
const PANEL_FILL = 0x062838;
const PANEL_ALPHA = 0.76;
const RESEARCH_Y = 42;
const RESEARCH_COUNTER_WIDTH = 154;
const RESEARCH_COUNTER_HEIGHT = 62;
const RESEARCH_COUNTER_GAP = 12;
const RESEARCH_COUNTER_X =
  GAME_WIDTH - SAFE_MARGIN - RESEARCH_COUNTER_WIDTH * 2 - RESEARCH_COUNTER_GAP - 56;
const MOVEMENT_HINT_Y = GAME_HEIGHT - 36;
const MOVEMENT_HINT_MAX_WIDTH = 520;

export interface NormalGameplayHUDState {
  readonly stationProgress: readonly HudStationProgress[];
  readonly stationPhotoCount: number;
  readonly stationPhotoGoal: number;
  readonly organismCount: number;
  readonly organismGoal: number;
}

interface CounterVisual {
  readonly background: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Graphics;
  readonly label: Phaser.GameObjects.Text;
  readonly value: Phaser.GameObjects.Text;
}

/**
 * Presentation-only HUD for the normal underwater exploration state.
 * Gameplay state stays in DiveScene and its existing entities/systems.
 */
export class NormalGameplayHUD {
  private readonly missionPanel: Phaser.GameObjects.Graphics;
  private readonly missionChapter: Phaser.GameObjects.Text;
  private readonly missionTitle: Phaser.GameObjects.Text;
  private readonly missionStation: Phaser.GameObjects.Text;
  private readonly missionProgress: Phaser.GameObjects.Graphics;
  private readonly researchCounters: CounterVisual[];
  private readonly oxygen: OxygenGauge;
  private readonly movementHint: Phaser.GameObjects.Text;
  private readonly promptBackground: Phaser.GameObjects.Rectangle;
  private readonly promptKeycap: Phaser.GameObjects.Rectangle;
  private readonly promptKey: Phaser.GameObjects.Text;
  private readonly promptLabel: Phaser.GameObjects.Text;
  private readonly notificationBackground: Phaser.GameObjects.Rectangle;
  private readonly notificationText: Phaser.GameObjects.Text;
  private currentPrompt: HudInteraction | null = null;
  private currentStateKey = '';
  private notificationTweenTargets: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.missionPanel = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.missionChapter = scene.add
      .text(SAFE_MARGIN + 18, 42, '', this.textStyle(17, '#8edfd8', true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.missionTitle = scene.add
      .text(SAFE_MARGIN + 18, 67, '', this.textStyle(32, Palette.textLight, true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.missionStation = scene.add
      .text(SAFE_MARGIN + 18, 111, '', this.textStyle(20, Palette.textMuted, false))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.missionProgress = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);

    this.researchCounters = [
      this.createCounter(RESEARCH_COUNTER_X, RESEARCH_Y, 'camera'),
      this.createCounter(
        RESEARCH_COUNTER_X + RESEARCH_COUNTER_WIDTH + RESEARCH_COUNTER_GAP,
        RESEARCH_Y,
        'fish',
      ),
    ];

    this.oxygen = new OxygenGauge(scene, SAFE_MARGIN, GAME_HEIGHT - 82, false);
    // Keep the persistent guidance compact and separate from the contextual
    // action prompt. Nearby E / SPACE actions are presented by setInteraction,
    // so this strip only needs to help the player navigate the scene.
    this.movementHint = scene.add
      .text(SAFE_MARGIN, MOVEMENT_HINT_Y, i18n.t('dive.controlsPersistent'), {
        ...this.textStyle(17, Palette.textLight, true),
        backgroundColor: '#04121fcc',
        padding: { x: 12, y: 7 },
        wordWrap: { width: MOVEMENT_HINT_MAX_WIDTH, useAdvancedWrap: true },
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2);

    this.promptBackground = scene.add
      .rectangle(GAME_WIDTH - SAFE_MARGIN - 210, GAME_HEIGHT - 70, 420, 66, PANEL_FILL, 0.9)
      .setStrokeStyle(1, Palette.accent, 0.28)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 4)
      .setVisible(false);
    this.promptKeycap = scene.add
      .rectangle(GAME_WIDTH - SAFE_MARGIN - 382, GAME_HEIGHT - 70, 62, 42, 0x123c50, 0.98)
      .setStrokeStyle(1, Palette.accent, 0.7)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 5)
      .setVisible(false);
    this.promptKey = scene.add
      .text(
        GAME_WIDTH - SAFE_MARGIN - 382,
        GAME_HEIGHT - 70,
        '',
        this.textStyle(18, Palette.textLight, true),
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 6)
      .setVisible(false);
    this.promptLabel = scene.add
      .text(
        GAME_WIDTH - SAFE_MARGIN - 344,
        GAME_HEIGHT - 70,
        '',
        this.textStyle(21, Palette.textLight, false),
      )
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 5)
      .setVisible(false);

    this.notificationBackground = scene.add
      .rectangle(GAME_WIDTH / 2 + 180, 192, 660, 66, PANEL_FILL, 0.92)
      .setStrokeStyle(1, 0xf2c75c, 0.46)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 8)
      .setVisible(false)
      .setAlpha(0);
    this.notificationText = scene.add
      .text(GAME_WIDTH / 2 + 180, 192, '', this.textStyle(21, Palette.textLight, true))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 9)
      .setVisible(false)
      .setAlpha(0);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  update(state: NormalGameplayHUDState): void {
    const station = selectCurrentStation(state.stationProgress);
    const location = station === null ? '' : this.getStationLocation(station.displayName);
    const stateKey = [
      station?.ordinal ?? 'none',
      station?.displayName ?? '',
      station?.photographed ?? false,
      state.stationProgress.length,
      state.stationPhotoCount,
      state.stationPhotoGoal,
      state.organismCount,
      state.organismGoal,
      i18n.getLocale(),
    ].join('|');
    if (stateKey === this.currentStateKey) return;
    this.currentStateKey = stateKey;

    this.missionChapter.setText(i18n.t('dive.hudChapter'));
    this.missionTitle.setText(i18n.t('dive.hudMissionTitle'));
    this.movementHint.setText(i18n.t('dive.controlsPersistent'));
    this.missionStation.setText(
      station === null
        ? i18n.t('dive.hudSurveyComplete')
        : `${i18n.t('dive.hudStation')} ${station.ordinal} / ${state.stationProgress.length} · ${location}`,
    );
    this.drawMissionPanel(state.stationPhotoCount, state.stationPhotoGoal);

    this.updateCounter(
      this.researchCounters[0]!,
      i18n.t('dive.hudPhotoCounter'),
      state.stationPhotoCount,
      state.stationPhotoGoal,
    );
    this.updateCounter(
      this.researchCounters[1]!,
      i18n.t('dive.hudSpeciesCounter'),
      state.organismCount,
      state.organismGoal,
    );
  }

  setInteraction(
    station: HudInteraction | null,
    subject: HudInteraction | null,
    vessel: HudInteraction | null,
  ): void {
    const next = chooseHudInteraction(station, subject, vessel);
    const currentKey =
      this.currentPrompt === null
        ? ''
        : `${this.currentPrompt.kind}|${this.currentPrompt.key}|${this.currentPrompt.label}`;
    const nextKey = next === null ? '' : `${next.kind}|${next.key}|${next.label}`;
    if (currentKey === nextKey) return;

    this.currentPrompt = next;
    this.scene.tweens.killTweensOf([
      this.promptBackground,
      this.promptKeycap,
      this.promptKey,
      this.promptLabel,
    ]);
    if (next === null) {
      this.scene.tweens.add({
        targets: [this.promptBackground, this.promptKeycap, this.promptKey, this.promptLabel],
        alpha: 0,
        y: '+=4',
        duration: 180,
        onComplete: () => {
          this.setPromptVisible(false);
          this.resetPromptY();
        },
      });
      return;
    }

    this.promptKeycap.setFillStyle(next.kind === 'station' ? 0x5b4b25 : 0x123c50, 0.98);
    this.promptKey.setText(next.key);
    this.promptLabel.setText(next.label);
    this.setPromptVisible(true);
    this.promptBackground.setAlpha(0).setY(GAME_HEIGHT - 78);
    this.promptKeycap.setAlpha(0).setY(GAME_HEIGHT - 78);
    this.promptKey.setAlpha(0).setY(GAME_HEIGHT - 78);
    this.promptLabel.setAlpha(0).setY(GAME_HEIGHT - 78);
    this.scene.tweens.add({
      targets: [this.promptBackground, this.promptKeycap, this.promptKey, this.promptLabel],
      alpha: 1,
      y: GAME_HEIGHT - 70,
      duration: 200,
      ease: 'Quad.easeOut',
    });
  }

  notify(message: string): void {
    this.scene.tweens.killTweensOf(this.notificationTweenTargets);
    this.notificationText.setText(message);
    this.notificationBackground.setVisible(true).setAlpha(0).setY(200);
    this.notificationText.setVisible(true).setAlpha(0).setY(200);
    this.notificationTweenTargets = [this.notificationBackground, this.notificationText];
    this.scene.tweens.add({
      targets: this.notificationTweenTargets,
      alpha: 1,
      y: 192,
      duration: 240,
      ease: 'Quad.easeOut',
      hold: 2200,
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.notificationTweenTargets,
          alpha: 0,
          y: 184,
          duration: 360,
          ease: 'Quad.easeIn',
          onComplete: () => {
            this.notificationBackground.setVisible(false);
            this.notificationText.setVisible(false);
          },
        });
      },
    });
  }

  clearNotification(): void {
    this.scene.tweens.killTweensOf(this.notificationTweenTargets);
    this.notificationBackground.setVisible(false).setAlpha(0);
    this.notificationText.setVisible(false).setAlpha(0).setText('');
  }

  destroy(): void {
    this.oxygen.destroy();
    this.movementHint.destroy();
    this.missionPanel.destroy();
    this.missionChapter.destroy();
    this.missionTitle.destroy();
    this.missionStation.destroy();
    this.missionProgress.destroy();
    for (const counter of this.researchCounters) {
      counter.background.destroy();
      counter.icon.destroy();
      counter.label.destroy();
      counter.value.destroy();
    }
    this.promptBackground.destroy();
    this.promptKeycap.destroy();
    this.promptKey.destroy();
    this.promptLabel.destroy();
    this.notificationBackground.destroy();
    this.notificationText.destroy();
  }

  private drawMissionPanel(current: number, goal: number): void {
    const x = SAFE_MARGIN;
    const y = 28;
    const width = 450;
    const height = 142;
    const ratio = goal > 0 ? Phaser.Math.Clamp(current / goal, 0, 1) : 0;
    this.missionPanel.clear();
    this.missionPanel.fillStyle(PANEL_FILL, PANEL_ALPHA);
    this.missionPanel.fillRoundedRect(x, y, width, height, 12);
    this.missionPanel.fillStyle(Palette.accent, 0.9);
    this.missionPanel.fillRect(x, y + 18, 3, 80);
    this.missionPanel.lineStyle(1, Palette.accent, 0.32);
    this.missionPanel.lineBetween(x + 3, y + height, x + 158, y + height);
    this.missionPanel.lineStyle(2, 0x1a4c5e, 0.95);
    this.missionPanel.lineBetween(x + 18, y + 129, x + width - 18, y + 129);
    this.missionPanel.lineStyle(2, Palette.accent, 0.9);
    this.missionPanel.lineBetween(x + 18, y + 129, x + 18 + (width - 36) * ratio, y + 129);
  }

  private createCounter(x: number, y: number, icon: 'camera' | 'fish'): CounterVisual {
    const background = this.scene.add
      .rectangle(x, y, RESEARCH_COUNTER_WIDTH, RESEARCH_COUNTER_HEIGHT, PANEL_FILL, 0.66)
      .setStrokeStyle(1, Palette.accent, 0.2)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    const iconGraphic = this.scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.drawResearchIcon(iconGraphic, x + 22, y + 27, icon);
    const label = this.scene.add
      .text(x + 42, y + 10, '', this.textStyle(12, Palette.textMuted, true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    const value = this.scene.add
      .text(x + 42, y + 30, '', this.textStyle(20, Palette.textLight, true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    return { background, icon: iconGraphic, label, value };
  }

  private updateCounter(
    counter: CounterVisual,
    label: string,
    current: number,
    goal: number,
  ): void {
    counter.label.setText(label.toUpperCase());
    counter.value.setText(`${Math.min(current, goal)} / ${goal}`);
  }

  private drawResearchIcon(
    graphic: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    icon: 'camera' | 'fish',
  ): void {
    graphic.clear();
    if (icon === 'camera') {
      graphic.lineStyle(2, 0x35d5d0, 0.95);
      graphic.strokeRoundedRect(x - 13, y - 8, 26, 17, 4);
      graphic.strokeCircle(x, y, 5);
      graphic.lineBetween(x - 7, y - 12, x + 1, y - 12);
      graphic.lineBetween(x - 5, y - 12, x - 2, y - 16);
      return;
    }

    graphic.fillStyle(0xf2c75c, 0.95);
    graphic.fillEllipse(x, y, 24, 12);
    graphic.fillTriangle(x - 11, y, x - 19, y - 7, x - 19, y + 7);
    graphic.fillTriangle(x + 8, y - 2, x + 15, y - 8, x + 15, y + 4);
    graphic.fillStyle(PANEL_FILL, 1);
    graphic.fillCircle(x + 7, y - 2, 1.5);
  }

  private getStationLocation(displayName: string): string {
    const separator = displayName.lastIndexOf('\u2014');
    return separator >= 0 ? displayName.slice(separator + 1).trim() : displayName;
  }

  private textStyle(
    fontSize: number,
    color: string,
    bold: boolean,
  ): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'sans-serif',
      fontSize: `${fontSize}px`,
      color,
      fontStyle: bold ? 'bold' : 'normal',
    };
  }

  private setPromptVisible(visible: boolean): void {
    this.promptBackground.setVisible(visible);
    this.promptKeycap.setVisible(visible);
    this.promptKey.setVisible(visible);
    this.promptLabel.setVisible(visible);
  }

  private resetPromptY(): void {
    this.promptBackground.setY(GAME_HEIGHT - 70);
    this.promptKeycap.setY(GAME_HEIGHT - 70);
    this.promptKey.setY(GAME_HEIGHT - 70);
    this.promptLabel.setY(GAME_HEIGHT - 70);
  }
}
