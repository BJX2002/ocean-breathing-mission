import Phaser from 'phaser';
import { GAME_WIDTH, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';
import { OxygenGauge } from './OxygenGauge';

const SAFE_MARGIN = 48;
const HUD_DEPTH = 900;
const PANEL_FILL = 0x062838;
const PANEL_LEFT = SAFE_MARGIN;
const PANEL_TOP = 28;
const PANEL_WIDTH = 760;
const PANEL_HEIGHT = 202;
const DESKTOP_NOTIFICATION_X = GAME_WIDTH / 2 + 70;
const TOUCH_NOTIFICATION_X = 1260;

export interface NormalGameplayHUDState {
  readonly completedTaskCount: number;
  readonly totalTaskCount: number;
  readonly taskLabel: string;
  readonly actionKey: string;
  readonly actionEnglish: string;
  readonly actionLabel: string;
  readonly touchControls: boolean;
  readonly targetTextureKey?: string | null;
  readonly targetLabel?: string | null;
}

/**
 * Persistent Chapter 1 guidance. The card always answers two questions in one
 * place: what the player must do now, and which control performs that action.
 * Brief success/error notifications remain separate and never replace it.
 */
export class NormalGameplayHUD {
  private readonly missionPanel: Phaser.GameObjects.Graphics;
  private readonly missionChapter: Phaser.GameObjects.Text;
  private readonly missionProgressText: Phaser.GameObjects.Text;
  private readonly missionTitle: Phaser.GameObjects.Text;
  private readonly actionPrefix: Phaser.GameObjects.Text;
  private readonly actionKeycap: Phaser.GameObjects.Rectangle;
  private readonly actionKey: Phaser.GameObjects.Text;
  private readonly movementKeycaps: Phaser.GameObjects.Rectangle[] = [];
  private readonly movementKeys: Phaser.GameObjects.Text[] = [];
  private readonly actionEnglish: Phaser.GameObjects.Text;
  private readonly actionLabel: Phaser.GameObjects.Text;
  private readonly targetCard: Phaser.GameObjects.Graphics;
  private readonly targetImage: Phaser.GameObjects.Image;
  private readonly targetLabel: Phaser.GameObjects.Text;
  private readonly oxygen: OxygenGauge;
  private readonly notificationBackground: Phaser.GameObjects.Rectangle;
  private readonly notificationText: Phaser.GameObjects.Text;
  private currentStateKey = '';
  private notificationTweenTargets: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.missionPanel = scene.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.missionChapter = scene.add
      .text(PANEL_LEFT + 18, PANEL_TOP + 14, '', this.textStyle(16, '#8edfd8', true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.missionProgressText = scene.add
      .text(PANEL_LEFT + PANEL_WIDTH - 18, PANEL_TOP + 12, '', this.textStyle(19, '#f0c95a', true))
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.missionTitle = scene.add
      .text(PANEL_LEFT + 18, PANEL_TOP + 52, '', {
        ...this.textStyle(27, Palette.textLight, true),
        wordWrap: { width: PANEL_WIDTH - 36, useAdvancedWrap: true },
      })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);

    this.actionPrefix = scene.add
      .text(PANEL_LEFT + 20, PANEL_TOP + 143, '', this.textStyle(20, '#ffffff', true))
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2);

    this.actionKeycap = scene.add
      .rectangle(PANEL_LEFT + 105, PANEL_TOP + 143, 108, 58, 0xf0c95a, 1)
      .setStrokeStyle(3, 0xffeba0, 0.96)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.actionKey = scene.add
      .text(PANEL_LEFT + 105, PANEL_TOP + 143, '', this.textStyle(21, '#17313b', true))
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2);
    ['W ↑', 'A ←', 'S ↓', 'D →'].forEach((label, index) => {
      const keyX = PANEL_LEFT + 76 + index * 54;
      this.movementKeycaps.push(
        scene.add
          .rectangle(keyX, PANEL_TOP + 143, 50, 58, 0xf0c95a, 1)
          .setStrokeStyle(2, 0xffeba0, 0.94)
          .setScrollFactor(0)
          .setDepth(HUD_DEPTH + 1)
          .setVisible(false),
      );
      this.movementKeys.push(
        scene.add
          .text(keyX, PANEL_TOP + 143, label, this.textStyle(17, '#17313b', true))
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(HUD_DEPTH + 2)
          .setVisible(false),
      );
    });
    this.actionEnglish = scene.add
      .text(PANEL_LEFT + 176, PANEL_TOP + 112, '', this.textStyle(14, '#f0c95a', true))
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2);
    this.actionLabel = scene.add
      .text(PANEL_LEFT + 176, PANEL_TOP + 143, '', {
        ...this.textStyle(21, '#ffffff', true),
        lineSpacing: 3,
        wordWrap: { width: 330, useAdvancedWrap: true },
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2);

    this.targetCard = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 1);
    this.targetImage = scene.add
      .image(PANEL_LEFT + PANEL_WIDTH - 112, PANEL_TOP + 145, '__WHITE')
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2)
      .setVisible(false);
    this.targetLabel = scene.add
      .text(PANEL_LEFT + PANEL_WIDTH - 28, PANEL_TOP + 145, '', {
        ...this.textStyle(17, '#fff3a8', true),
        align: 'center',
        wordWrap: { width: 104, useAdvancedWrap: true },
      })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 2)
      .setVisible(false);

    this.oxygen = new OxygenGauge(scene, SAFE_MARGIN, 998, false);

    this.notificationBackground = scene.add
      .rectangle(DESKTOP_NOTIFICATION_X, 82, 760, 86, PANEL_FILL, 0.94)
      .setStrokeStyle(2, 0xf2c75c, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 8)
      .setVisible(false)
      .setAlpha(0);
    this.notificationText = scene.add
      .text(DESKTOP_NOTIFICATION_X, 82, '', {
        ...this.textStyle(21, Palette.textLight, true),
        align: 'center',
        wordWrap: { width: 700, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH + 9)
      .setVisible(false)
      .setAlpha(0);

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  update(state: NormalGameplayHUDState): void {
    const completed = Phaser.Math.Clamp(state.completedTaskCount, 0, state.totalTaskCount);
    const stateKey = [
      completed,
      state.totalTaskCount,
      state.taskLabel,
      state.actionKey,
      state.actionEnglish,
      state.actionLabel,
      state.touchControls,
      state.targetTextureKey ?? '',
      state.targetLabel ?? '',
      i18n.getLocale(),
    ].join('|');
    if (stateKey === this.currentStateKey) return;
    this.currentStateKey = stateKey;

    this.missionChapter.setText(i18n.t('dive.hudChapter'));
    this.missionProgressText.setText(
      i18n
        .t('dive.guidanceProgress')
        .replace('{current}', String(completed))
        .replace('{total}', String(state.totalTaskCount)),
    );
    this.missionTitle.setText(
      i18n.t('dive.guidanceCurrentTask').replace('{task}', state.taskLabel),
    );
    this.actionKey.setText(state.actionKey);
    this.actionPrefix.setText(
      state.touchControls
        ? i18n.getLocale() === 'en'
          ? 'Use'
          : '使用'
        : i18n.getLocale() === 'en'
          ? 'Press'
          : '按',
    );
    this.actionEnglish.setText('');
    this.actionLabel.setText(state.actionLabel);
    const notificationX = state.touchControls ? TOUCH_NOTIFICATION_X : DESKTOP_NOTIFICATION_X;
    this.notificationBackground.setX(notificationX);
    this.notificationText.setX(notificationX);
    const targetVisible = this.updateTargetCard(
      state.targetTextureKey ?? null,
      state.targetLabel ?? null,
    );
    this.updateActionLayout(!state.touchControls && state.actionKey === 'WASD', targetVisible);
    this.drawMissionPanel(completed, state.totalTaskCount);
  }

  notify(message: string): void {
    this.scene.tweens.killTweensOf(this.notificationTweenTargets);
    this.notificationText.setText(message);
    this.notificationBackground.setVisible(true).setAlpha(0).setY(90);
    this.notificationText.setVisible(true).setAlpha(0).setY(90);
    this.notificationTweenTargets = [this.notificationBackground, this.notificationText];
    this.scene.tweens.add({
      targets: this.notificationTweenTargets,
      alpha: 1,
      y: 82,
      duration: 220,
      ease: 'Quad.easeOut',
      hold: 1800,
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.notificationTweenTargets,
          alpha: 0,
          y: 74,
          duration: 300,
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
    this.missionPanel.destroy();
    this.missionChapter.destroy();
    this.missionProgressText.destroy();
    this.missionTitle.destroy();
    this.actionPrefix.destroy();
    this.actionKeycap.destroy();
    this.actionKey.destroy();
    for (const keycap of this.movementKeycaps) keycap.destroy();
    for (const key of this.movementKeys) key.destroy();
    this.actionEnglish.destroy();
    this.actionLabel.destroy();
    this.targetCard.destroy();
    this.targetImage.destroy();
    this.targetLabel.destroy();
    this.notificationBackground.destroy();
    this.notificationText.destroy();
  }

  private drawMissionPanel(current: number, total: number): void {
    const ratio = total > 0 ? current / total : 0;
    const left = PANEL_LEFT;
    const top = PANEL_TOP;
    const width = PANEL_WIDTH;
    const height = PANEL_HEIGHT;
    const progressLeft = left + 18;
    const progressWidth = width - 36;
    const progressY = top + height - 13;

    this.missionPanel.clear();
    this.missionPanel.fillStyle(0x01060b, 0.32);
    this.missionPanel.fillRoundedRect(left + 8, top + 10, width, height, 18);
    this.missionPanel.fillStyle(PANEL_FILL, 0.92);
    this.missionPanel.fillRoundedRect(left, top, width, height, 18);
    this.missionPanel.lineStyle(2, Palette.accent, 0.42);
    this.missionPanel.strokeRoundedRect(left, top, width, height, 18);
    this.missionPanel.fillStyle(Palette.gold, 0.96);
    this.missionPanel.fillRoundedRect(left + 18, top + 7, 84, 5, 3);

    this.missionPanel.fillStyle(0x173f4d, 1);
    this.missionPanel.fillRoundedRect(progressLeft, progressY, progressWidth, 7, 4);
    this.missionPanel.fillStyle(Palette.accent, 1);
    this.missionPanel.fillRoundedRect(progressLeft, progressY, progressWidth * ratio, 7, 4);

    if (total <= 0) return;
    for (let index = 0; index <= total; index += 1) {
      const x = progressLeft + (progressWidth * index) / total;
      this.missionPanel.fillStyle(index <= current ? Palette.accentSoft : 0x315764, 1);
      this.missionPanel.fillCircle(x, progressY + 3.5, index === current ? 5 : 3.5);
    }
  }

  private updateTargetCard(textureKey: string | null, label: string | null): boolean {
    const visible = textureKey !== null && label !== null && this.scene.textures.exists(textureKey);
    this.targetCard.clear().setVisible(visible);
    this.targetImage.setVisible(visible);
    this.targetLabel.setVisible(visible);
    if (!visible) return false;

    const cardWidth = 250;
    const cardHeight = 104;
    const cardLeft = PANEL_LEFT + PANEL_WIDTH - cardWidth - 18;
    const cardTop = PANEL_TOP + 82;
    this.targetCard.fillStyle(0x173c32, 0.96);
    this.targetCard.fillRoundedRect(cardLeft, cardTop, cardWidth, cardHeight, 14);
    this.targetCard.lineStyle(2, 0xf0c95a, 0.72);
    this.targetCard.strokeRoundedRect(cardLeft, cardTop, cardWidth, cardHeight, 14);
    this.targetCard.fillStyle(0xf0c95a, 0.96);
    this.targetCard.fillRoundedRect(cardLeft + 10, cardTop - 7, 64, 20, 8);

    this.targetImage.setTexture(textureKey);
    const source = this.scene.textures.get(textureKey).getSourceImage();
    const scale = Math.min(82 / source.width, 60 / source.height);
    this.targetImage
      .setPosition(cardLeft + 56, cardTop + 58)
      .setDisplaySize(source.width * scale, source.height * scale);
    this.targetLabel
      .setPosition(cardLeft + cardWidth - 12, cardTop + 57)
      .setWordWrapWidth(148, true)
      .setText(label);
    return true;
  }

  private updateActionLayout(movement: boolean, targetVisible: boolean): void {
    this.actionKeycap.setVisible(!movement);
    this.actionKey.setVisible(!movement);
    for (const keycap of this.movementKeycaps) keycap.setVisible(movement);
    for (const key of this.movementKeys) key.setVisible(movement);

    const keycapX = PANEL_LEFT + 126;
    this.actionKeycap.setX(keycapX);
    this.actionKey.setX(keycapX);
    const textX = PANEL_LEFT + (movement ? 300 : 202);
    this.actionEnglish.setVisible(false).setX(textX);
    this.actionLabel
      .setX(textX)
      .setY(PANEL_TOP + 143)
      .setWordWrapWidth(
        targetVisible
          ? PANEL_LEFT + PANEL_WIDTH - 286 - textX
          : PANEL_LEFT + PANEL_WIDTH - 24 - textX,
        true,
      );
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
}
