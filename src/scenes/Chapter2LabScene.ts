import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette, SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { CHAPTER2_SCIENTIST_FRAME_KEYS } from '../graphics/assetManifest';
import { i18n } from '../i18n/LocaleService';
import { gameState } from '../state/GameState';
import type { DepthZone, Sensor } from '../types';
import {
  DEMO_LOW_OXYGEN_THRESHOLD_MG_L,
  DEMO_DEPLOYMENT_SCENARIO,
  demoDoValueAtGridIndex,
  deploymentCost,
  evaluateDeployment,
  gridPlacement,
  providesContinuousCoverage,
  sensorSupportsDepth,
  type DeploymentEvaluation,
} from '../simulation/DeploymentRules';
import { DoTimelineChart } from '../ui/DoTimelineChart';
import { createResearchSurface, ResearchButton } from '../ui/ResearchUi';

type LabZoneId = 'evidence' | 'workbench' | 'console';

interface LabZoneView {
  readonly id: LabZoneId;
  readonly x: number;
  readonly hotspot: Phaser.GameObjects.Arc;
  readonly ring: Phaser.GameObjects.Arc;
  readonly labelPlate: Phaser.GameObjects.Rectangle;
  readonly title: Phaser.GameObjects.Text;
  readonly status: Phaser.GameObjects.Text;
}

const FLOOR_Y = 962;
const WALK_SPEED = 330;

/**
 * Chapter 2 vertical slice: walk through the vessel lab, interpret Chapter 1
 * evidence, assemble a sensing-film node, then preview network deployment.
 */
export class Chapter2LabScene extends Phaser.Scene {
  private scientist!: Phaser.GameObjects.Sprite;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private leftKey: Phaser.Input.Keyboard.Key | null = null;
  private rightKey: Phaser.Input.Keyboard.Key | null = null;
  private targetX: number | null = null;
  private pendingInteractionZoneId: LabZoneId | null = null;
  private modalRoot: Phaser.GameObjects.Container | null = null;
  private evidenceReviewed = false;
  private sensorUnlocked = false;
  private consoleVisited = false;
  private readonly zones: LabZoneView[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private progress!: Phaser.GameObjects.Text;
  private toast: Phaser.GameObjects.Text | null = null;
  private toastTimer: Phaser.Time.TimerEvent | null = null;
  private highlightedZoneId: LabZoneId | null = null;
  private readonly progressDots: Phaser.GameObjects.Arc[] = [];
  private speechBubble: Phaser.GameObjects.Container | null = null;
  private readonly deploymentPlacements = new Map<number, string>();
  private deploymentRunComplete = false;
  private deploymentDetectedEvent = false;
  private monitoringComparisonComplete = false;

  constructor() {
    super(SceneKeys.Chapter2Lab);
  }

  create(): void {
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Chapter2Lab });
    this.createLabBackground();
    this.createHeader();
    this.createInteractionZones();
    this.createScientist();
    this.createControls();
    this.refreshZoneStates();
    this.showLabIntro();
    if (gameState.debugMode) this.applyDebugScreenRequest();
  }

  /** Opt-in review routes used to inspect canvas-only teaching screens. */
  private applyDebugScreenRequest(): void {
    const requested = new URLSearchParams(window.location.search).get('screen');
    if (requested === null) return;
    this.time.delayedCall(120, () => {
      this.closeModal();
      if (requested === 'evidence') {
        this.showEvidenceModal();
        return;
      }
      if (requested === 'unlock') {
        this.evidenceReviewed = true;
        this.sensorUnlocked = true;
        this.showUnlockModal();
        return;
      }
      if (requested === 'deployment') {
        this.evidenceReviewed = true;
        this.sensorUnlocked = true;
        this.monitoringComparisonComplete = true;
        this.showDeploymentModal();
        return;
      }
      if (requested === 'comparison') {
        this.evidenceReviewed = true;
        this.sensorUnlocked = true;
        this.showMonitoringComparisonModal();
        return;
      }
      if (requested === 'summary') {
        this.showLearningSummary();
        return;
      }
      if (requested === 'quiz') this.showFinalQuiz();
    });
  }

  override update(_time: number, delta: number): void {
    if (this.modalRoot !== null) return;

    const keyboardLeft = (this.cursors?.left.isDown ?? false) || (this.leftKey?.isDown ?? false);
    const keyboardRight = (this.cursors?.right.isDown ?? false) || (this.rightKey?.isDown ?? false);
    const direction = Number(keyboardRight) - Number(keyboardLeft);

    if (direction !== 0) {
      this.targetX = null;
      this.pendingInteractionZoneId = null;
      this.moveScientist(direction, delta);
    } else if (this.targetX !== null) {
      const difference = this.targetX - this.scientist.x;
      if (Math.abs(difference) < 8) {
        this.scientist.x = this.targetX;
        this.targetX = null;
        this.stopScientist();
        if (this.pendingInteractionZoneId !== null) {
          this.pendingInteractionZoneId = null;
          this.time.delayedCall(0, () => this.tryInteract());
        }
      } else {
        this.moveScientist(Math.sign(difference), delta);
      }
    } else {
      this.stopScientist();
    }

    this.updateNearbyPrompt();
  }

  private createLabBackground(): void {
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'chapter2-lab')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(0);

    const grade = this.add.graphics().setDepth(1);
    grade.fillGradientStyle(0x04111d, 0x04111d, 0x020912, 0x020912, 0.12, 0.12, 0.68, 0.68);
    grade.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    grade.fillStyle(0x020912, 0.82);
    grade.fillRect(0, 0, GAME_WIDTH, 118);
    grade.fillRect(0, GAME_HEIGHT - 92, GAME_WIDTH, 92);
    grade.lineStyle(2, Palette.accent, 0.34);
    grade.lineBetween(0, 118, GAME_WIDTH, 118);
    grade.lineBetween(0, GAME_HEIGHT - 92, GAME_WIDTH, GAME_HEIGHT - 92);
  }

  private createHeader(): void {
    this.add
      .text(72, 34, i18n.t('lab.eyebrow'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setDepth(20);
    this.add
      .text(72, 68, i18n.t('lab.title'), {
        fontFamily: 'sans-serif',
        fontSize: '39px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setDepth(20);
    this.add
      .text(GAME_WIDTH - 72, 52, i18n.t('lab.subtitle'), {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#b5d5df',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.progress = this.add
      .text(GAME_WIDTH - 72, 82, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#93b3bf',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    [0, 1, 2].forEach((index) => {
      const x = GAME_WIDTH - 250 + index * 38;
      const dot = this.add.circle(x, 89, 8, 0x4d6873, 1).setDepth(21);
      this.progressDots.push(dot);
      if (index < 2) this.add.rectangle(x + 19, 89, 22, 2, 0x4d6873, 0.65).setDepth(20);
    });

    this.add
      .text(72, GAME_HEIGHT - 58, i18n.t('lab.controls'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#a7c9d5',
      })
      .setDepth(20);
    this.prompt = this.add
      .text(GAME_WIDTH - 72, GAME_HEIGHT - 63, '', {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#efffff',
        backgroundColor: '#126f6a',
        padding: { x: 18, y: 9 },
      })
      .setOrigin(1, 0)
      .setDepth(25)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.tryInteract());
  }

  private createInteractionZones(): void {
    const definitions: ReadonlyArray<readonly [LabZoneId, number, number, string]> = [
      ['evidence', 300, 574, 'lab.zoneEvidence'],
      ['workbench', 960, 568, 'lab.zoneWorkbench'],
      ['console', 1590, 540, 'lab.zoneConsole'],
    ];

    definitions.forEach(([id, x, y, labelKey], index) => {
      const hotspot = this.add
        .circle(x, y, 50, 0x071721, 0.72)
        .setStrokeStyle(2, index === 0 ? Palette.accent : 0x66808b, 0.72)
        .setInteractive({ useHandCursor: true })
        .setDepth(10);
      const ring = this.add
        .circle(x, y, 67)
        .setStrokeStyle(2, index === 0 ? Palette.accent : 0x66808b, 0.58)
        .setDepth(9);
      this.tweens.add({
        targets: ring,
        scale: 1.16,
        alpha: 0.08,
        duration: 1500,
        yoyo: true,
        repeat: -1,
        delay: index * 260,
      });
      const glyph = this.add.graphics().setPosition(x, y).setDepth(11);
      this.drawZoneGlyph(glyph, id, index === 0 ? 0x8ff7e8 : 0x7f98a2);
      const labelPlate = this.add
        .rectangle(x, y + 105, 248, 58, 0x06141e, 0.76)
        .setStrokeStyle(1, index === 0 ? Palette.accent : 0x66808b, 0.46)
        .setDepth(11);
      const title = this.add
        .text(x, y + 94, i18n.t(labelKey), {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(12);
      const status = this.add
        .text(x, y + 120, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: Palette.accentText,
        })
        .setOrigin(0.5)
        .setDepth(12);
      const view: LabZoneView = { id, x, hotspot, ring, labelPlate, title, status };
      this.zones.push(view);
      const approachAndInteract = (): void => {
        this.targetX = x;
        this.pendingInteractionZoneId = id;
      };
      hotspot.on(Phaser.Input.Events.POINTER_UP, approachAndInteract);
      labelPlate
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_UP, approachAndInteract);
      title
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.POINTER_UP, approachAndInteract);
      hotspot.on(Phaser.Input.Events.POINTER_OVER, () => hotspot.setFillStyle(0x0d4350, 0.92));
      hotspot.on(Phaser.Input.Events.POINTER_OUT, () => this.refreshZoneStates());
      hotspot.setData('zone', id);
    });
  }

  private drawZoneGlyph(
    graphics: Phaser.GameObjects.Graphics,
    zoneId: LabZoneId,
    color: number,
  ): void {
    graphics.clear().lineStyle(4, color, 1).fillStyle(color, 0.18);
    if (zoneId === 'evidence') {
      graphics.fillRoundedRect(-30, -23, 60, 46, 5);
      graphics.strokeRoundedRect(-30, -23, 60, 46, 5);
      graphics.strokeCircle(0, 0, 12);
      graphics.lineBetween(-18, -30, 4, -30);
      graphics.lineBetween(-10, 22, 16, 5);
      return;
    }
    if (zoneId === 'workbench') {
      graphics.strokeCircle(0, 0, 23);
      graphics.fillCircle(0, 0, 9);
      graphics.lineBetween(-34, 0, -24, 0);
      graphics.lineBetween(24, 0, 34, 0);
      graphics.lineBetween(0, -34, 0, -24);
      graphics.lineBetween(0, 24, 0, 34);
      return;
    }
    graphics.strokeCircle(0, 0, 28);
    graphics.strokeCircle(0, 0, 17);
    graphics.lineBetween(0, 0, 22, -16);
    graphics.fillCircle(0, 0, 5);
    graphics.lineBetween(-34, 30, 34, 30);
  }

  private drawEvidenceGlyph(
    graphics: Phaser.GameObjects.Graphics,
    dimension: 'time' | 'location' | 'depth',
    color: number,
    scale = 1,
  ): void {
    graphics
      .clear()
      .lineStyle(4 * scale, color, 1)
      .fillStyle(color, 0.18);
    if (dimension === 'time') {
      graphics.strokeCircle(0, 0, 27 * scale);
      graphics.lineBetween(0, 0, 0, -16 * scale);
      graphics.lineBetween(0, 0, 14 * scale, 8 * scale);
      graphics.fillCircle(0, 0, 4 * scale);
      return;
    }
    if (dimension === 'location') {
      graphics.strokeCircle(-24 * scale, 12 * scale, 9 * scale);
      graphics.strokeCircle(0, -18 * scale, 9 * scale);
      graphics.strokeCircle(24 * scale, 12 * scale, 9 * scale);
      graphics.lineBetween(-16 * scale, 6 * scale, -5 * scale, -12 * scale);
      graphics.lineBetween(6 * scale, -12 * scale, 17 * scale, 6 * scale);
      graphics.lineBetween(-15 * scale, 12 * scale, 15 * scale, 12 * scale);
      return;
    }
    graphics.lineBetween(0, -31 * scale, 0, 31 * scale);
    graphics.lineBetween(-16 * scale, -22 * scale, 16 * scale, -22 * scale);
    graphics.lineBetween(-12 * scale, 0, 12 * scale, 0);
    graphics.lineBetween(-8 * scale, 22 * scale, 8 * scale, 22 * scale);
    graphics.fillTriangle(-6 * scale, 31 * scale, 6 * scale, 31 * scale, 0, 41 * scale);
  }

  private updateScientistBubble(zoneId: LabZoneId | null): void {
    this.speechBubble?.destroy(true);
    this.speechBubble = null;
    if (zoneId === null) return;

    const key =
      zoneId === 'evidence'
        ? this.evidenceReviewed
          ? 'lab.bubbleEvidenceDone'
          : 'lab.bubbleEvidence'
        : zoneId === 'workbench'
          ? !this.evidenceReviewed
            ? 'lab.bubbleWorkbenchLocked'
            : this.sensorUnlocked
              ? 'lab.bubbleWorkbenchDone'
              : 'lab.bubbleWorkbench'
          : !this.sensorUnlocked
            ? 'lab.bubbleConsoleLocked'
            : 'lab.bubbleConsole';
    const zone = this.zones.find((candidate) => candidate.id === zoneId);
    if (zone === undefined) return;
    const width = 500;
    const x = zone.x;
    const y = zone.hotspot.y - 132;
    const panel = this.add.graphics();
    panel.fillStyle(0xeffcff, 0.97).fillRoundedRect(-width / 2, -66, width, 104, 18);
    panel.fillTriangle(-18, 36, 18, 36, 0, 68);
    panel.lineStyle(2, 0x249b96, 0.85).strokeRoundedRect(-width / 2, -66, width, 104, 18);
    const text = this.add
      .text(0, -13, i18n.t(key), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#09202b',
        align: 'center',
        wordWrap: { width: width - 42, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    this.speechBubble = this.add.container(x, y, [panel, text]).setDepth(32);
  }

  private createScientist(): void {
    if (!this.anims.exists('chapter2-scientist-walk')) {
      this.anims.create({
        key: 'chapter2-scientist-walk',
        frames: CHAPTER2_SCIENTIST_FRAME_KEYS.map((key) => ({ key })),
        frameRate: 6,
        repeat: -1,
      });
    }
    this.scientist = this.add
      .sprite(330, FLOOR_Y, CHAPTER2_SCIENTIST_FRAME_KEYS[0] ?? '')
      .setDisplaySize(380, 380)
      .setOrigin(0.5, 0.86)
      .setDepth(18);
    this.add
      .ellipse(330, FLOOR_Y - 8, 118, 20, 0x02080d, 0.35)
      .setDepth(15)
      .setName('scientist-shadow');
  }

  private createControls(): void {
    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;
    this.leftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) ?? null;
    this.rightKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) ?? null;
    this.input.keyboard?.on('keydown-E', () => {
      if (this.modalRoot === null) this.tryInteract();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.modalRoot !== null) this.closeModal();
      else this.scene.start(SceneKeys.Menu, { screen: 'chapters' });
    });
  }

  private moveScientist(direction: number, delta: number): void {
    this.scientist.x = Phaser.Math.Clamp(
      this.scientist.x + direction * WALK_SPEED * (delta / 1000),
      120,
      GAME_WIDTH - 120,
    );
    this.scientist.setFlipX(direction < 0).play('chapter2-scientist-walk', true);
    const shadow = this.children.getByName('scientist-shadow') as Phaser.GameObjects.Ellipse | null;
    if (shadow !== null) shadow.x = this.scientist.x;
  }

  private stopScientist(): void {
    if (!this.scientist.anims.isPlaying) return;
    this.scientist.anims.stop();
    this.scientist.setTexture(CHAPTER2_SCIENTIST_FRAME_KEYS[0] ?? '');
  }

  private updateNearbyPrompt(): void {
    const nearest = this.nearestZone();
    const nearby = nearest !== null && Math.abs(nearest.x - this.scientist.x) <= 155;
    this.prompt.setVisible(nearby);
    if (nearby) this.prompt.setText(i18n.t('lab.interact'));
    const nextHighlighted = nearby ? (nearest?.id ?? null) : null;
    if (nextHighlighted !== this.highlightedZoneId) {
      this.highlightedZoneId = nextHighlighted;
      this.refreshZoneStates();
    }
  }

  private nearestZone(): LabZoneView | null {
    return this.zones.reduce<LabZoneView | null>((nearest, zone) => {
      if (nearest === null) return zone;
      return Math.abs(zone.x - this.scientist.x) < Math.abs(nearest.x - this.scientist.x)
        ? zone
        : nearest;
    }, null);
  }

  private tryInteract(): void {
    const zone = this.nearestZone();
    if (zone === null || Math.abs(zone.x - this.scientist.x) > 165) {
      this.showToast(i18n.t('lab.interact'));
      return;
    }

    if (zone.id === 'workbench' && !this.evidenceReviewed) {
      this.showToast(i18n.t('lab.lockedEvidenceFirst'));
      return;
    }
    if (zone.id === 'console' && !this.sensorUnlocked) {
      this.showToast(i18n.t('lab.lockedWorkbenchFirst'));
      return;
    }
    this.openLabZone(zone.id);
  }

  private openLabZone(zoneId: LabZoneId): void {
    if (zoneId === 'evidence') {
      this.showEvidenceModal();
      return;
    }
    if (zoneId === 'workbench') {
      if (this.sensorUnlocked) this.showUnlockModal();
      else this.showExperimentModal();
      return;
    }
    this.showConsoleModal();
  }

  private refreshZoneStates(): void {
    const completed =
      Number(this.evidenceReviewed) + Number(this.sensorUnlocked) + Number(this.consoleVisited);
    this.progress.setText(`${i18n.t('lab.progress')}  ${completed} / 3`);
    this.progressDots.forEach((dot, index) => {
      dot.setFillStyle(index < completed ? 0x78dda0 : index === completed ? 0xf0c95a : 0x4d6873, 1);
      if (index === completed && completed < 3) {
        this.tweens.add({ targets: dot, scale: 1.28, duration: 500, yoyo: true, repeat: 1 });
      }
    });

    this.zones.forEach((zone) => {
      const done =
        (zone.id === 'evidence' && this.evidenceReviewed) ||
        (zone.id === 'workbench' && this.sensorUnlocked) ||
        (zone.id === 'console' && this.consoleVisited);
      const locked =
        (zone.id === 'workbench' && !this.evidenceReviewed) ||
        (zone.id === 'console' && !this.sensorUnlocked);
      const color = done ? 0x79df97 : locked ? 0x627985 : Palette.accent;
      zone.hotspot
        .setFillStyle(done ? 0x123b35 : locked ? 0x0a202b : 0x082d3b, 0.76)
        .setStrokeStyle(2, color, 0.72);
      zone.ring.setStrokeStyle(2, color, locked ? 0.24 : 0.54);
      zone.labelPlate
        .setFillStyle(done ? 0x0b2d2a : 0x06141e, locked ? 0.58 : 0.76)
        .setStrokeStyle(1, color, locked ? 0.24 : 0.46);
      zone.title.setColor(done ? '#d9ffe4' : locked ? '#8ca2ab' : Palette.textLight);
      zone.status
        .setText(
          done
            ? `✓  ${i18n.t('lab.zoneDone')}`
            : locked
              ? i18n.t('lab.zoneLocked')
              : i18n.t('lab.zoneReady'),
        )
        .setColor(done ? '#91e6a7' : locked ? '#8196a0' : Palette.accentText);
    });
    if (this.highlightedZoneId !== null) {
      const highlighted = this.zones.find((zone) => zone.id === this.highlightedZoneId);
      highlighted?.hotspot.setStrokeStyle(3, 0xf4df78, 1);
      highlighted?.ring.setStrokeStyle(3, 0xf4df78, 0.72);
    }
    this.updateScientistBubble(this.highlightedZoneId);
  }

  private showEvidenceModal(): void {
    const root = this.createModal(
      i18n.t('lab.evidenceEyebrow'),
      i18n.t('lab.evidenceTitle'),
      i18n.t('lab.evidenceBody'),
      1660,
      880,
    );
    type EvidenceDimension = 'time' | 'location' | 'depth';
    const cards: ReadonlyArray<readonly [EvidenceDimension, number, string, string, number]> = [
      ['time', 460, 'lab.evidenceSampleTime', 'lab.evidenceTargetTime', 0xf0c95a],
      ['location', 960, 'lab.evidenceSampleLocation', 'lab.evidenceTargetLocation', 0x57d4cb],
      ['depth', 1460, 'lab.evidenceSampleDepth', 'lab.evidenceTargetDepth', 0x7aa7ff],
    ];
    const targets = new Map<
      EvidenceDimension,
      { panel: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; x: number; y: number }
    >();
    const matched = new Set<EvidenceDimension>(
      this.evidenceReviewed ? ['time', 'location', 'depth'] : [],
    );
    const progressText = this.add
      .text(960, 340, '', {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#f0c95a',
      })
      .setOrigin(0.5);
    root.add(progressText);

    cards.forEach(([dimension, x, sampleKey, targetKey, color], index) => {
      const panel = this.add
        .rectangle(x, 500, 410, 264, 0x092736, 0.96)
        .setStrokeStyle(2, color, 0.52);
      const number = this.add
        .text(x - 168, 390, `0${index + 1}`, {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: Phaser.Display.Color.IntegerToColor(color).rgba,
          fontStyle: 'bold',
        })
        .setAlpha(0.9);
      const icon = this.add.graphics().setPosition(x, 442);
      this.drawEvidenceGlyph(icon, dimension, color);
      const sample = this.add
        .text(x, 505, i18n.t(sampleKey), {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: Palette.textLight,
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: 334, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      const target = this.add
        .rectangle(x, 596, 280, 58, 0x04151f, 0.9)
        .setStrokeStyle(2, color, 0.45);
      const targetText = this.add
        .text(x, 596, i18n.t(targetKey), {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#73909d',
          align: 'center',
        })
        .setOrigin(0.5);
      targets.set(dimension, { panel: target, text: targetText, x, y: 596 });
      root.add([panel, number, icon, sample, target, targetText]);
    });

    const tray = this.add
      .rectangle(960, 746, 1220, 116, 0x041722, 0.92)
      .setStrokeStyle(1, 0x4e7d8d, 0.48);
    const trayLabel = this.add.text(380, 686, i18n.t('lab.evidenceTray'), {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#7fa8b7',
    });
    root.add([tray, trayLabel]);

    const tokenDefinitions: ReadonlyArray<readonly [EvidenceDimension, number, string, number]> = [
      ['depth', 600, 'lab.evidenceTokenDepth', 0x7aa7ff],
      ['time', 960, 'lab.evidenceTokenTime', 0xf0c95a],
      ['location', 1320, 'lab.evidenceTokenLocation', 0x57d4cb],
    ];
    const status = this.add
      .text(960, 838, i18n.t('lab.evidenceDragHint'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#8eadb9',
        align: 'center',
      })
      .setOrigin(0.5);
    root.add(status);

    const refresh = (): void => {
      progressText.setText(
        this.format('lab.evidenceProgress', {
          found: String(matched.size),
          total: String(cards.length),
        }),
      );
      const complete = matched.size === cards.length;
      recordButton?.setAlpha(complete ? 1 : 0.34);
      if (complete) status.setText(i18n.t('lab.evidenceComplete')).setColor('#91e6a7');
    };

    const draggableTokens: Array<Phaser.GameObjects.Container> = [];
    tokenDefinitions.forEach(([dimension, homeX, labelKey, color]) => {
      const body = this.add.rectangle(0, 0, 270, 66, 0x103b49, 0.98).setStrokeStyle(2, color, 0.9);
      const glyph = this.add.graphics().setPosition(-96, 0);
      this.drawEvidenceGlyph(glyph, dimension, color, 0.58);
      const label = this.add
        .text(18, 0, i18n.t(labelKey), {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const target = targets.get(dimension);
      const startX = matched.has(dimension) && target !== undefined ? target.x : homeX;
      const startY = matched.has(dimension) && target !== undefined ? target.y : 752;
      const token = this.add
        .container(startX, startY, [body, glyph, label])
        .setSize(270, 66)
        .setDepth(215)
        .setData('dimension', dimension)
        .setData('homeX', homeX)
        .setData('homeY', 752);
      if (!matched.has(dimension)) {
        token.setInteractive({ useHandCursor: true });
        this.input.setDraggable(token);
      } else {
        body.setFillStyle(0x185143, 1);
      }
      draggableTokens.push(token);
      root.add(token);
    });

    const onDrag = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
      dragX: number,
      dragY: number,
    ): void => {
      if (draggableTokens.includes(gameObject as Phaser.GameObjects.Container)) {
        (gameObject as Phaser.GameObjects.Container).setPosition(dragX, dragY);
      }
    };
    const onDragEnd = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
    ): void => {
      const token = gameObject as Phaser.GameObjects.Container;
      if (!draggableTokens.includes(token)) return;
      const dimension = token.getData('dimension') as EvidenceDimension;
      const target = targets.get(dimension);
      const closestWrongTarget = [...targets.entries()].find(
        ([otherDimension, otherTarget]) =>
          otherDimension !== dimension &&
          Phaser.Math.Distance.Between(token.x, token.y, otherTarget.x, otherTarget.y) < 150,
      );
      if (
        target !== undefined &&
        Phaser.Math.Distance.Between(token.x, token.y, target.x, target.y) < 155
      ) {
        token.setPosition(target.x, target.y).disableInteractive();
        (token.first as Phaser.GameObjects.Rectangle).setFillStyle(0x185143, 1);
        target.text.setVisible(false);
        target.panel.setFillStyle(0x17483d, 1).setStrokeStyle(3, 0x8ce6a3, 1);
        matched.add(dimension);
        this.tweens.add({ targets: token, scale: 1.06, duration: 150, yoyo: true });
        refresh();
      } else {
        if (closestWrongTarget !== undefined) {
          status.setText(i18n.t('lab.evidenceWrong')).setColor('#ffae8f');
        }
        this.tweens.add({
          targets: token,
          x: token.getData('homeX') as number,
          y: token.getData('homeY') as number,
          duration: 240,
          ease: 'Sine.Out',
        });
      }
    };
    this.input.on(Phaser.Input.Events.DRAG, onDrag);
    this.input.on(Phaser.Input.Events.DRAG_END, onDragEnd);
    root.once('destroy', () => {
      this.input.off(Phaser.Input.Events.DRAG, onDrag);
      this.input.off(Phaser.Input.Events.DRAG_END, onDragEnd);
    });

    const recordButton = this.addModalButton(
      root,
      960,
      920,
      420,
      i18n.t('lab.evidenceRecord'),
      true,
      () => {
        if (matched.size !== cards.length) return;
        this.evidenceReviewed = true;
        this.closeModal();
        this.refreshZoneStates();
        this.targetX = 960;
      },
    );
    this.addModalButton(root, 360, 920, 280, i18n.t('common.backStep'), false, () => {
      this.closeModal();
    });
    refresh();
  }

  private showLabIntro(): void {
    const root = this.createModal(
      i18n.t('lab.introEyebrow'),
      i18n.t('lab.introTitle'),
      i18n.t('lab.introBody'),
      1320,
      760,
    );
    const steps = [
      ['01', 'lab.introStepEvidence'],
      ['02', 'lab.introStepPrinciple'],
      ['03', 'lab.introStepBudget'],
    ] as const;
    steps.forEach(([number, key], index) => {
      const x = 560 + index * 400;
      const card = this.add
        .rectangle(x, 570, 330, 210, 0x0b3343, 0.96)
        .setStrokeStyle(2, index === 0 ? 0xf0c95a : Palette.accent, 0.7);
      const numberText = this.add
        .text(x, 500, number, {
          fontFamily: 'monospace',
          fontSize: '30px',
          color: index === 0 ? '#f0c95a' : Palette.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const text = this.add
        .text(x, 590, i18n.t(key), {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: Palette.textLight,
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: 280, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      root.add([card, numberText, text]);
    });
    const controls = this.add
      .text(960, 742, i18n.t('lab.introControls'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    root.add(controls);
    this.addModalButton(root, 1060, 836, 460, i18n.t('lab.introStart'), true, () => {
      this.closeModal();
      this.targetX = 300;
      this.pendingInteractionZoneId = 'evidence';
    });
    this.addModalButton(root, 520, 836, 290, i18n.t('common.backStep'), false, () => {
      this.scene.start(SceneKeys.Menu, { screen: 'chapters' });
    });
  }

  private showExperimentModal(): void {
    const root = this.createModal(
      i18n.t('lab.experimentEyebrow'),
      i18n.t('lab.experimentTitle'),
      i18n.t('lab.experimentBody'),
      1660,
      880,
    );
    let step = 0;
    let unlockTimer: Phaser.Time.TimerEvent | null = null;

    const step1 = this.add.text(250, 360, i18n.t('lab.dragFilm'), this.stepTextStyle(true));
    const step2 = this.add.text(1010, 360, i18n.t('lab.lightStep'), this.stepTextStyle(false));
    const step3 = this.add.text(1425, 360, i18n.t('lab.readerStep'), this.stepTextStyle(false));

    const flow = this.add.graphics();
    flow.lineStyle(4, 0x345966, 0.72);
    flow.lineBetween(825, 535, 1032, 535);
    flow.lineBetween(1208, 535, 1345, 535);
    flow.fillStyle(0x345966, 0.72);
    flow.fillTriangle(1032, 535, 1015, 524, 1015, 546);
    flow.fillTriangle(1345, 535, 1328, 524, 1328, 546);

    const beam = this.add
      .rectangle(1120, 535, 270, 32, 0xf7d968, 0.78)
      .setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD);
    const lightHalo = this.add
      .circle(1110, 535, 72, 0xf7d968, 0.08)
      .setStrokeStyle(3, 0xf7d968, 0.46);
    const lightIcon = this.add.graphics().setPosition(1110, 535);
    lightIcon.fillStyle(0xf4c94c, 0.95).fillCircle(0, 0, 24);
    lightIcon.lineStyle(4, 0xffef9b, 0.9);
    for (let angle = 0; angle < 360; angle += 45) {
      const radians = Phaser.Math.DegToRad(angle);
      lightIcon.lineBetween(
        Math.cos(radians) * 34,
        Math.sin(radians) * 34,
        Math.cos(radians) * 48,
        Math.sin(radians) * 48,
      );
    }

    const readerPanel = this.add
      .rectangle(1510, 535, 300, 170, 0x03131e, 0.98)
      .setStrokeStyle(3, 0x5f8998, 0.72);
    const readerLabel = this.add
      .text(1510, 480, i18n.t('lab.opticalReader'), {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#8caab6',
      })
      .setOrigin(0.5);
    const waveform = this.add.graphics();
    waveform.lineStyle(3, 0x65dfd5, 1);
    const waveformPoints = [
      [1390, 545],
      [1410, 545],
      [1424, 526],
      [1440, 568],
      [1460, 510],
      [1480, 556],
      [1500, 535],
      [1525, 522],
      [1545, 555],
      [1562, 532],
      [1580, 545],
      [1620, 545],
    ] as const;
    waveformPoints.slice(0, -1).forEach((point, index) => {
      const next = waveformPoints[index + 1];
      if (next !== undefined) waveform.lineBetween(point[0], point[1], next[0], next[1]);
    });
    waveform.setAlpha(0.12);

    const dataDots = [0, 1, 2, 3].map((index) =>
      this.add.circle(1430 + index * 34, 598, 6, 0x70eee1, 1).setVisible(false),
    );

    const filmBody = this.add
      .rectangle(0, 0, 190, 104, 0xe6c74f, 0.97)
      .setStrokeStyle(3, 0xffef9a, 1);
    const filmCore = this.add.rectangle(0, -10, 118, 28, 0x37bdb4, 1);
    const filmText = this.add
      .text(0, 32, i18n.t('lab.filmLabel'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#09202b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const film = this.add
      .container(300, 535, [filmBody, filmCore, filmText])
      .setSize(190, 104)
      .setDepth(210);
    film.setInteractive({ useHandCursor: true });
    this.input.setDraggable(film);

    const slot = this.add
      .rectangle(700, 535, 250, 174, 0x071a26, 0.98)
      .setStrokeStyle(3, Palette.accent, 0.64);
    const slotTop = this.add.rectangle(700, 450, 110, 18, 0x274954, 1);
    const slotBottom = this.add.rectangle(700, 620, 110, 18, 0x274954, 1);
    const slotText = this.add
      .text(700, 535, i18n.t('lab.sensorSlot'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8db4c2',
        align: 'center',
      })
      .setOrigin(0.5);
    root.add([
      flow,
      beam,
      lightHalo,
      lightIcon,
      readerPanel,
      readerLabel,
      waveform,
      ...dataDots,
      step1,
      step2,
      step3,
      slot,
      slotTop,
      slotBottom,
      slotText,
      film,
    ]);

    const lightButton = this.addModalButton(
      root,
      1110,
      680,
      270,
      i18n.t('lab.lightButton'),
      true,
      () => {
        if (step !== 1) return;
        step = 2;
        lightButton.setAlpha(0.72);
        step2.setColor('#91e6a7');
        readerButton.setAlpha(1);
        beam.setVisible(true);
        waveform.setAlpha(1);
        this.tweens.add({
          targets: [beam, lightHalo],
          alpha: 0.2,
          duration: 260,
          yoyo: true,
          repeat: 3,
        });
        this.tweens.add({ targets: slot, scale: 1.03, duration: 180, yoyo: true, repeat: 2 });
      },
    ).setAlpha(0.42);
    const readerButton = this.addModalButton(
      root,
      1510,
      680,
      270,
      i18n.t('lab.readerButton'),
      true,
      () => {
        if (step !== 2) return;
        step = 3;
        step3.setColor('#91e6a7');
        readerButton.setAlpha(0.72);
        dataDots.forEach((dot, index) => {
          dot.setVisible(true).setPosition(1415, 598);
          this.tweens.add({
            targets: dot,
            x: 1610,
            duration: 620,
            delay: index * 90,
            ease: 'Sine.InOut',
          });
        });
        unlockTimer = this.time.delayedCall(980, () => {
          this.sensorUnlocked = true;
          this.refreshZoneStates();
          this.closeModal();
          this.showUnlockModal();
        });
      },
    ).setAlpha(0.42);

    const notePanel = this.add
      .rectangle(960, 814, 1390, 92, 0x061d2a, 0.94)
      .setStrokeStyle(1, 0x598799, 0.48);
    const note = this.add
      .text(960, 814, i18n.t('lab.scienceNote'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#a9c8d2',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 1280, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([notePanel, note]);
    this.addModalButton(root, 340, 920, 280, i18n.t('common.backStep'), false, () => {
      this.closeModal();
    });

    const onDrag = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
      dragX: number,
      dragY: number,
    ): void => {
      if (gameObject === film && step === 0) film.setPosition(dragX, dragY);
    };
    const onDragEnd = (
      _pointer: Phaser.Input.Pointer,
      gameObject: Phaser.GameObjects.GameObject,
    ): void => {
      if (gameObject !== film || step !== 0) return;
      if (Phaser.Math.Distance.Between(film.x, film.y, slot.x, slot.y) < 150) {
        step = 1;
        film.setPosition(slot.x, slot.y).disableInteractive();
        slotText.setVisible(false);
        step1.setColor('#91e6a7');
        step2.setColor('#f0c95a');
        lightButton.setAlpha(1);
        flow.setAlpha(1);
      } else {
        this.tweens.add({ targets: film, x: 300, y: 535, duration: 240, ease: 'Sine.Out' });
      }
    };
    this.input.on(Phaser.Input.Events.DRAG, onDrag);
    this.input.on(Phaser.Input.Events.DRAG_END, onDragEnd);
    root.once('destroy', () => {
      this.input.off(Phaser.Input.Events.DRAG, onDrag);
      this.input.off(Phaser.Input.Events.DRAG_END, onDragEnd);
      unlockTimer?.remove(false);
    });
  }

  private showUnlockModal(): void {
    const root = this.createModal(
      'COMPONENT UNLOCKED  /  01',
      i18n.t('lab.unlockTitle'),
      i18n.t('lab.unlockBody'),
      1580,
      900,
    );
    const flowPanel = createResearchSurface(this, 960, 485, 1180, 104, {
      fill: 0x0b3a48,
      border: Palette.gold,
      borderAlpha: 0.7,
      radius: 16,
      shadow: false,
    });
    const flow = this.add
      .text(960, 485, i18n.t('lab.principleFlow'), {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#f7fcff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 1080, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const productCard = createResearchSurface(this, 960, 680, 500, 236, {
      fill: Palette.paper,
      border: Palette.gold,
      borderAlpha: 0.9,
      radius: 18,
      shadow: true,
    });
    const product = this.add.image(960, 662, 'chapter2-do-sensor-product').setDisplaySize(330, 186);
    const label = this.add
      .text(960, 778, i18n.t('lab.productReference'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#294650',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    root.add([flowPanel, flow, productCard, product, label]);
    this.addModalButton(root, 1120, 920, 430, i18n.t('lab.continue'), true, () => {
      this.closeModal();
      this.targetX = 1590;
    });
    this.addModalButton(root, 560, 920, 280, i18n.t('common.backStep'), false, () => {
      this.showExperimentModal();
    });
  }

  private showConsoleModal(): void {
    if (!this.monitoringComparisonComplete) {
      this.showMonitoringComparisonModal();
      return;
    }
    this.showDeploymentModal();
  }

  private showMonitoringComparisonModal(): void {
    const root = this.createModal(
      i18n.t('lab.compareEyebrow'),
      i18n.t('lab.compareTitle'),
      i18n.t('lab.compareBody'),
      1640,
      920,
    );
    const sensors = gameState.getData().sensors;
    const vessel = sensors.find((sensor) => sensor.id === 'vessel-sampling');
    const sensingFilm = sensors.find((sensor) => sensor.id === 'sensing-film-node');
    const sensorName = (sensor: Sensor | undefined): string => {
      if (sensor === undefined) return '';
      return i18n.getLocale() === 'en' ? sensor.nameEn : sensor.nameZh;
    };

    const methodSurface = createResearchSurface(this, 350, 565, 340, 430, {
      fill: Palette.cardSoft,
      border: Palette.gold,
      borderAlpha: 0.46,
      radius: 24,
      shadow: false,
    });
    const methodHalo = this.add.circle(350, 475, 72, Palette.gold, 0.11);
    const methodGlyph = this.add.graphics().setPosition(350, 475);
    const methodType = this.add
      .text(350, 375, '', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#f5d778',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    const methodTitle = this.add
      .text(350, 565, '', {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 280, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const promptText = this.add
      .text(350, 630, '', {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#c8e3e8',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 280, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    const resultText = this.add
      .text(350, 770, '', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#f4d678',
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: 286, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1);
    const stageText = this.add.text(560, 326, '', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: Palette.accentText,
      fontStyle: 'bold',
      backgroundColor: '#102f3ddd',
      padding: { x: 12, y: 7 },
    });
    root.add([
      methodSurface,
      methodHalo,
      methodGlyph,
      methodType,
      methodTitle,
      promptText,
      resultText,
      stageText,
    ]);

    const chart = new DoTimelineChart(
      this,
      root,
      { x: 555, y: 370, width: 1110, height: 450 },
      {
        thresholdMgPerL: DEMO_LOW_OXYGEN_THRESHOLD_MG_L,
        copy: {
          title: i18n.t('lab.chartTitle'),
          unit: i18n.t('lab.chartUnit'),
          emptyStatus: i18n.t('lab.chartWaiting'),
          emptyPrompt: i18n.t('lab.chartEmptyPrompt'),
          manualStatus: i18n.t('lab.chartManualStatus'),
          manualHint: i18n.t('lab.chartManualHint'),
          continuousStatus: i18n.t('lab.chartContinuousStatus'),
          continuousHint: i18n.t('lab.chartContinuousHint'),
          sampleLabel: i18n.t('lab.chartManualPoint'),
          detectedLabel: i18n.t('lab.chartDetected'),
          thresholdLabel: i18n.t('lab.chartAlert'),
          dawnLabel: i18n.t('lab.chartDawn'),
        },
      },
    );

    type ComparisonStep = 'manual-ready' | 'manual-result' | 'sensor-ready' | 'sensor-result';
    let step: ComparisonStep = 'manual-ready';
    const actionButton = new ResearchButton(this, 1280, 930, 510, 70, '', {
      tone: 'primary',
      fontSize: 22,
    });
    root.add(actionButton.root);
    this.addModalButton(root, 350, 930, 260, i18n.t('common.backStep'), false, () =>
      this.closeModal(),
    );

    const renderStep = (): void => {
      const manual = step === 'manual-ready' || step === 'manual-result';
      const activeSensor = manual ? vessel : sensingFilm;
      methodGlyph.clear();
      if (activeSensor !== undefined) {
        this.drawDeviceGlyph(
          methodGlyph,
          activeSensor,
          manual ? 1.65 : 1.5,
          manual ? 0xf5d778 : 0x9cf4e5,
        );
      }
      methodHalo.setFillStyle(manual ? Palette.gold : Palette.accent, 0.12);
      methodType
        .setText(manual ? i18n.t('lab.deviceSingle') : i18n.t('lab.deviceContinuous'))
        .setColor(manual ? '#f5d778' : '#8ff0df');
      methodTitle.setText(sensorName(activeSensor));
      stageText.setText(i18n.t(manual ? 'lab.compareManualStage' : 'lab.compareSensorStage'));

      if (step === 'manual-ready') {
        promptText.setText(i18n.t('lab.compareManualPrompt'));
        resultText.setText('');
        actionButton.setText(i18n.t('lab.compareManualRun'));
        chart.showEmpty();
        return;
      }
      if (step === 'manual-result') {
        promptText.setText(i18n.t('lab.compareManualPrompt'));
        resultText.setText(i18n.t('lab.compareManualResult')).setColor('#f4d678');
        actionButton.setText(i18n.t('lab.compareSwitchSensor'));
        chart.showManualSample({ hour: 14, value: 6.1 });
        return;
      }
      if (step === 'sensor-ready') {
        promptText.setText(i18n.t('lab.compareSensorPrompt'));
        resultText.setText('');
        actionButton.setText(i18n.t('lab.compareSensorRun'));
        chart.showEmpty();
        return;
      }
      promptText.setText(i18n.t('lab.compareSensorPrompt'));
      resultText.setText(i18n.t('lab.compareSensorResult')).setColor('#aaf2bb');
      actionButton.setText(i18n.t('lab.compareStartNetwork'));
      chart.showContinuousSeries();
    };

    actionButton.onPress(() => {
      if (step === 'manual-ready') step = 'manual-result';
      else if (step === 'manual-result') step = 'sensor-ready';
      else if (step === 'sensor-ready') {
        step = 'sensor-result';
        this.monitoringComparisonComplete = true;
      } else {
        this.showDeploymentModal();
        return;
      }
      renderStep();
    });
    renderStep();
  }

  private showDeploymentModal(): void {
    const root = this.createModal(
      i18n.t('lab.consoleEyebrow'),
      i18n.t('lab.consoleTitle'),
      i18n.t('lab.consoleBody'),
      1720,
      940,
    );
    const sensors = gameState.getData().sensors;
    const availableSensors = sensors.filter((sensor) =>
      ['vessel-sampling', 'fixed-probe', 'sensing-film-node'].includes(sensor.id),
    );
    if (availableSensors.length === 0) return;

    let selectedSensor: Sensor | null = null;
    const totalBudget = DEMO_DEPLOYMENT_SCENARIO.budget;
    let simulationTween: Phaser.Tweens.Tween | null = null;
    let summaryButton: Phaser.GameObjects.Container | null = null;
    let successCelebrationPlayed = false;
    let simulationRunning = false;
    const placements = new Map<number, Sensor>();
    this.deploymentPlacements.forEach((sensorId, index) => {
      const sensor = sensors.find((candidate) => candidate.id === sensorId);
      if (sensor !== undefined) placements.set(index, sensor);
    });
    const equipmentCards: Array<{
      sensor: Sensor;
      panel: Phaser.GameObjects.Rectangle;
      glyph: Phaser.GameObjects.Graphics;
    }> = [];
    const goalDefinitions = [
      { key: 'continuousRecording' as const, label: 'lab.goalContinuous' },
      { key: 'allLocationsCovered' as const, label: 'lab.goalLocations' },
      { key: 'multipleDepthsCovered' as const, label: 'lab.goalDepths' },
      { key: 'eventDetected' as const, label: 'lab.goalEvent' },
      { key: 'withinBudget' as const, label: 'lab.goalBudget' },
    ];
    const points: Array<{
      point: Phaser.GameObjects.Arc;
      ring: Phaser.GameObjects.Arc;
      heat: Phaser.GameObjects.Arc;
      glyph: Phaser.GameObjects.Graphics;
      value: Phaser.GameObjects.Text;
    }> = [];

    const equipmentTitle = this.add.text(120, 350, i18n.t('lab.equipment'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: Palette.accentText,
      fontStyle: 'bold',
    });
    const deploymentTitle = this.add.text(770, 350, i18n.t('lab.deployment'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: Palette.accentText,
      fontStyle: 'bold',
    });
    const budgetText = this.add
      .text(680, 350, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#f0c95a',
        fontStyle: 'bold',
        align: 'right',
      })
      .setOrigin(1, 0);
    const timeText = this.add
      .text(1770, 350, this.format('lab.simTime', { hour: '00:00' }), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8debe3',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    const selectedText = this.add
      .text(1265, 850, '', {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#d6f4f5',
        align: 'center',
        wordWrap: { width: 980, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([equipmentTitle, deploymentTitle, budgetText, timeText, selectedText]);

    const goalsSurface = createResearchSurface(this, 390, 805, 540, 172, {
      fill: Palette.cardSoft,
      border: Palette.accent,
      borderAlpha: 0.34,
      radius: 18,
      shadow: false,
    });
    const goalsTitle = this.add.text(145, 728, i18n.t('lab.goalTitle'), {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#f0c95a',
      fontStyle: 'bold',
    });
    const goalRows = goalDefinitions.map((goal, index) => {
      const row = this.add.text(150, 758 + index * 26, '', {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: '#789aa8',
        fontStyle: 'bold',
      });
      return { ...goal, row };
    });
    root.add([goalsSurface, goalsTitle, ...goalRows.map(({ row }) => row)]);

    const ocean = this.add.graphics();
    ocean.fillGradientStyle(0x0e6683, 0x0e6683, 0x08283c, 0x08283c, 0.92, 0.92, 0.98, 0.98);
    ocean.fillRoundedRect(760, 390, 1010, 398, 18);
    ocean.lineStyle(3, 0x75dcd6, 0.72);
    ocean.lineBetween(780, 456, 1750, 456);
    ocean.fillStyle(0x243d3d, 1);
    ocean.fillPoints(
      [
        new Phaser.Math.Vector2(760, 758),
        new Phaser.Math.Vector2(1000, 732),
        new Phaser.Math.Vector2(1290, 754),
        new Phaser.Math.Vector2(1530, 712),
        new Phaser.Math.Vector2(1770, 740),
        new Phaser.Math.Vector2(1770, 788),
        new Phaser.Math.Vector2(760, 788),
      ],
      true,
    );
    ocean.lineStyle(3, 0x718579, 0.82);
    ocean.beginPath();
    ocean.moveTo(760, 758);
    ocean.lineTo(1000, 732);
    ocean.lineTo(1290, 754);
    ocean.lineTo(1530, 712);
    ocean.lineTo(1770, 740);
    ocean.strokePath();
    root.add(ocean);

    for (let index = 0; index < 5; index += 1) {
      const bubble = this.add.circle(
        875 + index * 194,
        690 - (index % 3) * 74,
        3 + (index % 3),
        0xa5f3ef,
        0.16,
      );
      root.add(bubble);
    }

    const raft = this.add.graphics();
    raft.fillStyle(0xd1a84c, 1).fillRoundedRect(1240, 426, 102, 24, 8);
    raft
      .lineStyle(3, 0xf4d371, 0.95)
      .lineBetween(1252, 452, 1252, 550)
      .lineBetween(1330, 452, 1330, 550);
    raft.lineStyle(2, 0x82bec0, 0.45).strokeRect(1252, 454, 78, 96);
    root.add(raft);

    const siteKeys = ['lab.siteEntrance', 'lab.siteRaft', 'lab.siteInner'] as const;
    const depthKeys = ['lab.depthSurface', 'lab.depthMid', 'lab.depthBottom'] as const;
    const depthValues: readonly DepthZone[] = ['surface', 'mid', 'bottom'];
    const siteXs = [950, 1290, 1630] as const;
    const depthYs = [485, 606, 726] as const;
    siteKeys.forEach((key, column) => {
      const x = siteXs[column] ?? 950;
      const header = this.add
        .text(x, 412, i18n.t(key), {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: '#e1fbff',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      const guide = this.add.rectangle(x, 624, 2, 310, 0x8dded8, 0.12);
      root.add([guide, header]);
    });
    depthKeys.forEach((key, row) => {
      const y = depthYs[row] ?? 445;
      const label = this.add
        .text(790, y, i18n.t(key), {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#9bc3ce',
          align: 'left',
        })
        .setOrigin(0, 0.5);
      root.add(label);
    });

    depthYs.forEach((y, row) => {
      siteXs.forEach((x, column) => {
        const index = row * 3 + column;
        const heat = this.add.circle(x, y, 68, 0x4bc9c0, 0).setDepth(202);
        const ring = this.add.circle(x, y, 36).setStrokeStyle(2, 0x8edbd7, 0.28).setDepth(204);
        const point = this.add
          .circle(x, y, 24, 0x092735, 0.94)
          .setStrokeStyle(2, 0x8edbd7, 0.72)
          .setInteractive({ useHandCursor: true })
          .setDepth(205);
        const glyph = this.add.graphics().setPosition(x, y).setDepth(206);
        const value = this.add
          .text(x, y + 43, '', {
            fontFamily: 'monospace',
            fontSize: '18px',
            color: '#d8f7f5',
            backgroundColor: '#061923aa',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(207)
          .setVisible(false);
        points.push({ point, ring, heat, glyph, value });
        root.add([heat, ring, point, glyph, value]);
        point.on(Phaser.Input.Events.POINTER_UP, () => {
          if (simulationRunning) return;
          if (placements.has(index)) {
            placements.delete(index);
            this.deploymentPlacements.delete(index);
            this.deploymentRunComplete = false;
            this.deploymentDetectedEvent = false;
            summaryButton?.setVisible(false);
            render();
            return;
          }
          if (selectedSensor === null) {
            selectedText.setText(i18n.t('lab.selectDeviceFirst')).setColor('#ffcf78');
            return;
          }
          const usedBudget = [...placements.values()].reduce(
            (sum, sensor) => sum + deploymentCost(sensor),
            0,
          );
          if (usedBudget + deploymentCost(selectedSensor) > totalBudget) {
            selectedText.setText(i18n.t('lab.insufficientBudget')).setColor('#ff9c86');
            return;
          }
          const targetDepth = depthValues[row];
          if (targetDepth !== undefined && !sensorSupportsDepth(selectedSensor, targetDepth)) {
            selectedText
              .setText(this.format('lab.depthLimit', { name: sensorName(selectedSensor) }))
              .setColor('#ffcf78');
            return;
          }
          placements.set(index, selectedSensor);
          this.deploymentPlacements.set(index, selectedSensor.id);
          this.deploymentRunComplete = false;
          this.deploymentDetectedEvent = false;
          summaryButton?.setVisible(false);
          render();
        });
      });
    });

    const sensorName = (sensor: Sensor): string =>
      i18n.getLocale() === 'en' ? sensor.nameEn : sensor.nameZh;
    const depthLabel = (depth: DepthZone): string => {
      const keyByDepth: Record<DepthZone, string> = {
        surface: 'lab.depthSurface',
        mid: 'lab.depthMid',
        bottom: 'lab.depthBottom',
      };
      return i18n.t(keyByDepth[depth] ?? 'lab.depthBottom');
    };
    availableSensors.forEach((sensor, index) => {
      const x = 390;
      const y = 410 + index * 110;
      const panel = this.add
        .rectangle(x, y, 540, 92, 0x0a2c3b, 0.94)
        .setStrokeStyle(2, 0x507b89, 0.62)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add.graphics().setPosition(x - 220, y);
      this.drawDeviceGlyph(glyph, sensor, 0.78, 0x9bded8);
      const title = this.add.text(x - 165, y - 31, sensorName(sensor), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: Palette.textLight,
        fontStyle: 'bold',
        wordWrap: { width: 350, useAdvancedWrap: true },
      });
      const mode = i18n.t(sensor.continuous ? 'lab.deviceContinuous' : 'lab.deviceSingle');
      const detail = sensor.continuous
        ? this.format('lab.deviceEvery', { minutes: String(sensor.samplingIntervalMinutes) })
        : '';
      const maximumDepth = this.format('lab.deviceMaxDepth', {
        depth: depthLabel(sensor.maxDepthZone),
      });
      const values = this.add.text(
        x - 165,
        y + 4,
        `$${deploymentCost(sensor)}  ·  ${mode}\n${detail === '' ? maximumDepth : `${detail}  ·  ${maximumDepth}`}`,
        { fontFamily: 'monospace', fontSize: '14px', color: '#a9cbd4', lineSpacing: 4 },
      );
      const badge =
        sensor.id === 'sensing-film-node'
          ? this.add
              .text(x + 252, y - 37, i18n.t('lab.newPart'), {
                fontFamily: 'monospace',
                fontSize: '11px',
                color: '#09231f',
                backgroundColor: '#7ce2a0',
                padding: { x: 5, y: 3 },
              })
              .setOrigin(1, 0)
          : null;
      equipmentCards.push({ sensor, panel, glyph });
      root.add([panel, glyph, title, values]);
      if (badge !== null) root.add(badge);
      panel.on(Phaser.Input.Events.POINTER_UP, () => {
        if (simulationRunning) return;
        selectedSensor = sensor;
        render();
      });
    });

    const hint = this.add
      .text(960, 982, i18n.t('lab.previewHint'), {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#789aa8',
        align: 'center',
        wordWrap: { width: 1380, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add(hint);
    this.addModalButton(root, 1660, 930, 220, i18n.t('common.backStep'), false, () =>
      this.closeModal(),
    );
    this.addModalButton(root, 230, 930, 250, i18n.t('lab.backToMenu'), false, () => {
      this.scene.start(SceneKeys.Menu, { screen: 'chapters' });
    });

    const oxygenColor = (value: number): number =>
      value >= 5.5 ? 0x52d9c6 : value >= DEMO_LOW_OXYGEN_THRESHOLD_MG_L ? 0xf0c95a : 0xf47e68;
    const oxygenTextColor = (value: number): string =>
      value >= 5.5 ? '#83f2df' : value >= DEMO_LOW_OXYGEN_THRESHOLD_MG_L ? '#ffd873' : '#ff9b88';

    const updateSimulationVisual = (hour: number): void => {
      timeText.setText(
        this.format('lab.simTime', { hour: `${String(Math.floor(hour)).padStart(2, '0')}:00` }),
      );
      points.forEach(({ heat, value }, index) => {
        const sensor = placements.get(index);
        if (sensor === undefined) {
          heat.setFillStyle(0x6e8690, 0.05);
          value.setText('?').setColor('#718a94').setVisible(true);
          return;
        }
        const hasReadingNow = providesContinuousCoverage(sensor) || Math.abs(hour - 14) <= 0.7;
        if (!hasReadingNow) {
          heat.setFillStyle(0x6e8690, 0.05);
          value.setText('?').setColor('#718a94').setVisible(true);
          return;
        }
        const reading = demoDoValueAtGridIndex(index, hour);
        if (reading === null) {
          heat.setFillStyle(0x6e8690, 0.05);
          value.setText('?').setColor('#718a94').setVisible(true);
          return;
        }
        const color = oxygenColor(reading);
        heat.setAlpha(1).setFillStyle(color, 0.25);
        value
          .setText(`${reading.toFixed(1)} mg/L`)
          .setColor(oxygenTextColor(reading))
          .setVisible(true);
      });
    };

    const evaluateCurrentDeployment = (): DeploymentEvaluation => {
      const deployed = [...placements.entries()].flatMap(([index, sensor]) => {
        const placement = gridPlacement(index, sensor);
        return placement === null ? [] : [placement];
      });
      return evaluateDeployment(deployed, DEMO_DEPLOYMENT_SCENARIO);
    };

    const playSuccessCelebration = (): void => {
      if (successCelebrationPlayed) return;
      successCelebrationPlayed = true;
      const badge = this.add
        .text(1030, 800, i18n.t('lab.rewardBadge'), {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#fff4b8',
          fontStyle: 'bold',
          backgroundColor: '#6b521fd9',
          padding: { x: 22, y: 10 },
        })
        .setOrigin(0.5)
        .setScale(0.7)
        .setAlpha(0);
      root.add(badge);
      this.tweens.add({
        targets: badge,
        scale: 1,
        alpha: 1,
        duration: 420,
        ease: 'Back.Out',
      });
      for (let index = 0; index < 6; index += 1) {
        const startX = 870 + index * 150;
        const startY = 410 + (index % 3) * 120;
        const sparkle = this.add
          .text(startX, startY, index % 3 === 0 ? '✦' : '·', {
            fontFamily: 'sans-serif',
            fontSize: index % 3 === 0 ? '28px' : '38px',
            color: index % 2 === 0 ? '#ffe589' : '#8ff0df',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setAlpha(0);
        root.add(sparkle);
        this.tweens.add({
          targets: sparkle,
          y: startY - 72,
          angle: index % 2 === 0 ? 24 : -24,
          alpha: { from: 0, to: 1 },
          scale: { from: 0.5, to: 1.25 },
          duration: 620 + index * 32,
          yoyo: true,
          delay: index * 38,
          ease: 'Sine.Out',
        });
      }
    };

    const runSimulation = (): void => {
      if (simulationRunning) return;
      if (placements.size === 0) {
        selectedText.setText(i18n.t('lab.simNeedSensor')).setColor('#ffcf78');
        return;
      }
      simulationTween?.stop();
      simulationRunning = true;
      runButton.setAlpha(0.52);
      selectedText.setText(i18n.t('lab.simRunning')).setColor('#8debe3');
      simulationTween = this.tweens.addCounter({
        from: 0,
        to: 24,
        duration: 3000,
        ease: 'Linear',
        onUpdate: (tween) => updateSimulationVisual(tween.getValue() ?? 0),
        onComplete: () => {
          updateSimulationVisual(5);
          timeText.setText(i18n.t('lab.simSummaryTime'));
          const evaluation = evaluateCurrentDeployment();
          this.deploymentRunComplete = true;
          this.deploymentDetectedEvent = evaluation.success;
          if (evaluation.success) this.consoleVisited = true;
          this.refreshZoneStates();
          simulationRunning = false;
          render();
          if (evaluation.success) playSuccessCelebration();
          runButton.setAlpha(1);
          summaryButton?.setVisible(evaluation.success);
        },
      });
    };
    const runButton = this.addModalButton(
      root,
      1370,
      930,
      320,
      i18n.t('lab.run24h'),
      true,
      runSimulation,
    );
    summaryButton = this.addModalButton(root, 1020, 930, 300, i18n.t('lab.viewSummary'), true, () =>
      this.showLearningSummary(),
    ).setVisible(this.deploymentDetectedEvent);

    const render = (): void => {
      const evaluation = evaluateCurrentDeployment();
      budgetText.setText(
        `${i18n.t('lab.budget')}  $${evaluation.remainingBudget} / $${totalBudget}`,
      );

      if (this.deploymentRunComplete) {
        const missingGoals = goalRows
          .filter(({ key }) => !evaluation.goals[key])
          .map(({ label }) => i18n.t(label));
        selectedText
          .setText(
            evaluation.success
              ? i18n.t('lab.simDetected')
              : this.format('lab.goalsMissingPrefix', { goals: missingGoals.join(' · ') }),
          )
          .setColor(evaluation.success ? '#91e6a7' : '#ffcf78');
      } else if (selectedSensor === null) {
        selectedText.setText(i18n.t('lab.selectDeviceFirst')).setColor('#d6f4f5');
      } else {
        selectedText
          .setText(
            this.format('lab.placeDeviceNext', {
              name: sensorName(selectedSensor),
            }),
          )
          .setColor('#d6f4f5');
      }

      goalRows.forEach(({ key, label, row }) => {
        const pending = key === 'eventDetected' && !this.deploymentRunComplete;
        const waitingForFirstPlacement = key === 'withinBudget' && placements.size === 0;
        const complete = !pending && !waitingForFirstPlacement && evaluation.goals[key];
        row
          .setText(`${pending ? '?' : complete ? '✓' : '○'}  ${i18n.t(label)}`)
          .setColor(pending ? '#f0c95a' : complete ? '#91e6a7' : '#789aa8');
      });
      equipmentCards.forEach(({ sensor, panel, glyph }) => {
        const selected = sensor.id === selectedSensor?.id;
        panel
          .setFillStyle(selected ? 0x124b50 : 0x0a2c3b, 0.98)
          .setStrokeStyle(selected ? 3 : 2, selected ? 0x8ff0df : 0x507b89, selected ? 1 : 0.62);
        this.drawDeviceGlyph(glyph, sensor, 0.78, selected ? 0xc8fff5 : 0x7ea5af);
      });
      points.forEach(({ point, ring, heat, glyph, value }, index) => {
        const sensor = placements.get(index);
        glyph.clear();
        if (sensor === undefined) {
          const targetDepth = depthValues[Math.floor(index / 3)];
          const supported =
            selectedSensor === null ||
            targetDepth === undefined ||
            sensorSupportsDepth(selectedSensor, targetDepth);
          point
            .setAlpha(supported ? 1 : 0.32)
            .setFillStyle(0x092735, 0.94)
            .setStrokeStyle(
              2,
              selectedSensor === null ? 0x718a94 : 0x8edbd7,
              supported ? 0.64 : 0.2,
            );
          ring
            .setAlpha(supported ? 1 : 0.25)
            .setStrokeStyle(2, 0x8edbd7, selectedSensor === null ? 0.12 : 0.28);
          glyph
            .lineStyle(3, selectedSensor === null ? 0x617b86 : 0x9bded8, supported ? 0.82 : 0.26)
            .lineBetween(-8, 0, 8, 0)
            .lineBetween(0, -8, 0, 8);
          heat.setAlpha(0);
          value.setVisible(false);
        } else {
          point.setAlpha(1);
          ring.setAlpha(1);
          point.setFillStyle(0x164840, 0.98).setStrokeStyle(3, 0x8ce6a3, 1);
          ring.setStrokeStyle(2, 0x8ce6a3, 0.55);
          this.drawDeviceGlyph(glyph, sensor, 0.48, 0xd9fff1);
          if (!this.deploymentRunComplete) {
            heat.setAlpha(0);
            value.setVisible(false);
          }
        }
      });
      runButton.setAlpha(placements.size > 0 ? 1 : 0.38);
      summaryButton?.setVisible(this.deploymentDetectedEvent);
      if (this.deploymentRunComplete) {
        updateSimulationVisual(5);
        timeText.setText(i18n.t('lab.simSummaryTime'));
      } else if (!simulationRunning) {
        timeText.setText(this.format('lab.simTime', { hour: '00:00' }));
      }
    };
    render();
    root.once('destroy', () => simulationTween?.stop());
  }

  private showLearningSummary(): void {
    const root = this.createModal(
      i18n.t('lab.summaryEyebrow'),
      i18n.t('lab.summaryTitle'),
      i18n.t('lab.summaryBody'),
      1580,
      900,
    );
    const themes = [
      {
        mark: 'O₂',
        title: 'lab.summaryOceanTitle',
        body: 'lab.summaryOceanBody',
        color: 0x65cbea,
      },
      {
        mark: '✓',
        title: 'lab.summaryEvidenceTitle',
        body: 'lab.summaryEvidenceBody',
        color: 0xf0c95a,
      },
      {
        mark: '24h',
        title: 'lab.summarySensorTitle',
        body: 'lab.summarySensorBody',
        color: 0x91e6a7,
      },
    ] as const;
    themes.forEach((theme, index) => {
      const x = 490 + index * 470;
      const card = createResearchSurface(this, x, 565, 420, 320, {
        fill: Palette.cardSoft,
        border: theme.color,
        borderAlpha: 0.62,
        radius: 24,
        shadow: false,
      });
      const markBubble = this.add
        .circle(x, 475, 42, theme.color, 0.16)
        .setStrokeStyle(2, theme.color, 0.72);
      const mark = this.add
        .text(x, 475, theme.mark, {
          fontFamily: 'monospace',
          fontSize: theme.mark === '24h' ? '20px' : '25px',
          color: `#${theme.color.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const title = this.add
        .text(x, 555, i18n.t(theme.title), {
          fontFamily: 'sans-serif',
          fontSize: '27px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      const body = this.add
        .text(x, 615, i18n.t(theme.body), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#b8d3db',
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: 350, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0);
      root.add([card, markBubble, mark, title, body]);
    });
    this.addModalButton(root, 700, 930, 310, i18n.t('common.backStep'), false, () => {
      this.showConsoleModal();
    });
    this.addModalButton(root, 1220, 930, 360, i18n.t('lab.summaryFinish'), true, () =>
      this.showFinalQuiz(),
    );
  }

  private showFinalQuiz(): void {
    const root = this.createModal(
      i18n.t('lab.finalQuizEyebrow'),
      i18n.t('lab.finalQuizTitle'),
      i18n.t('lab.finalQuizBody'),
      1320,
      760,
    );
    const questionCard = createResearchSurface(this, 960, 470, 1080, 150, {
      fill: Palette.cardSoft,
      border: Palette.gold,
      borderAlpha: 0.58,
      radius: 20,
      shadow: false,
    });
    const question = this.add
      .text(960, 470, `${i18n.t('common.questionLabel')} ${i18n.t('lab.finalQuizQuestion')}`, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 7,
        wordWrap: { width: 980, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const optionsLabel = this.add.text(470, 590, i18n.t('common.optionsLabel'), {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#f0c95a',
      fontStyle: 'bold',
    });
    const feedback = this.add
      .text(960, 790, '', {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#91e6a7',
        align: 'center',
        wordWrap: { width: 900, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([questionCard, question, optionsLabel, feedback]);

    let finishButton: Phaser.GameObjects.Container | null = null;
    const choices = [
      { key: 'lab.finalQuizA', correct: false },
      { key: 'lab.finalQuizB', correct: true },
    ] as const;
    choices.forEach((choice, index) => {
      const button = new ResearchButton(
        this,
        680 + index * 560,
        680,
        500,
        84,
        `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`,
        { tone: 'secondary', fontSize: 22 },
      );
      button.onPress(() => {
        button.setTone(choice.correct ? 'primary' : 'danger');
        feedback
          .setText(i18n.t(choice.correct ? 'lab.finalQuizCorrect' : 'lab.finalQuizTryAgain'))
          .setColor(choice.correct ? '#91e6a7' : '#ffb09d');
        finishButton?.setVisible(choice.correct);
      });
      root.add(button.root);
    });

    this.addModalButton(root, 520, 870, 300, i18n.t('common.backStep'), false, () =>
      this.showLearningSummary(),
    );
    finishButton = this.addModalButton(
      root,
      1180,
      870,
      370,
      i18n.t('lab.finalQuizFinish'),
      true,
      () => this.scene.start(SceneKeys.Menu, { screen: 'chapters' }),
    ).setVisible(false);
  }

  private drawDeviceGlyph(
    graphics: Phaser.GameObjects.Graphics,
    sensor: Sensor,
    scale: number,
    color: number,
  ): void {
    graphics
      .clear()
      .lineStyle(3 * scale, color, 1)
      .fillStyle(color, 0.22);
    if (sensor.category === 'vessel-sampling') {
      graphics.fillPoints(
        [
          new Phaser.Math.Vector2(-25 * scale, 7 * scale),
          new Phaser.Math.Vector2(25 * scale, 7 * scale),
          new Phaser.Math.Vector2(16 * scale, 18 * scale),
          new Phaser.Math.Vector2(-18 * scale, 18 * scale),
        ],
        true,
      );
      graphics.strokeRect(-12 * scale, -7 * scale, 25 * scale, 14 * scale);
      graphics.lineBetween(0, -8 * scale, 0, -24 * scale);
      return;
    }
    if (sensor.category === 'handheld') {
      graphics.fillRoundedRect(-15 * scale, -25 * scale, 30 * scale, 48 * scale, 5 * scale);
      graphics.strokeRoundedRect(-15 * scale, -25 * scale, 30 * scale, 48 * scale, 5 * scale);
      graphics.strokeRect(-9 * scale, -17 * scale, 18 * scale, 14 * scale);
      graphics.lineBetween(0, 23 * scale, 0, 34 * scale);
      return;
    }
    if (sensor.category === 'fixed-probe') {
      graphics.lineBetween(0, -30 * scale, 0, 30 * scale);
      graphics.strokeRoundedRect(-12 * scale, -18 * scale, 24 * scale, 36 * scale, 5 * scale);
      graphics.fillCircle(0, 25 * scale, 6 * scale);
      return;
    }
    if (sensor.category === 'sensing-film') {
      graphics.fillRoundedRect(-19 * scale, -27 * scale, 38 * scale, 54 * scale, 7 * scale);
      graphics.strokeRoundedRect(-19 * scale, -27 * scale, 38 * scale, 54 * scale, 7 * scale);
      graphics.strokeRect(-10 * scale, -10 * scale, 20 * scale, 20 * scale);
      graphics.fillRect(-7 * scale, -7 * scale, 14 * scale, 14 * scale);
      return;
    }
    graphics.fillCircle(0, 4 * scale, 18 * scale);
    graphics.strokeCircle(0, 4 * scale, 18 * scale);
    graphics.lineBetween(0, -14 * scale, 0, -32 * scale);
    graphics.lineBetween(-8 * scale, -27 * scale, 8 * scale, -27 * scale);
    graphics.lineBetween(-22 * scale, 22 * scale, 22 * scale, 22 * scale);
  }

  private createModal(
    eyebrow: string,
    title: string,
    body: string,
    width = 1580,
    height = 840,
  ): Phaser.GameObjects.Container {
    this.closeModal();
    this.stopScientist();
    const root = this.add.container(0, 0).setDepth(200);
    const dim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x01070c, 0.78).setOrigin(0);
    const panel = createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, width, height, {
      goldRail: true,
      shadow: true,
    });
    const topLine = this.add.rectangle(
      GAME_WIDTH / 2,
      (GAME_HEIGHT - height) / 2 + 82,
      width - 88,
      2,
      Palette.accent,
      0.28,
    );
    const eyebrowText = this.add.text(
      (GAME_WIDTH - width) / 2 + 72,
      (GAME_HEIGHT - height) / 2 + 36,
      eyebrow,
      {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f0c95a',
        fontStyle: 'bold',
        letterSpacing: 2,
      },
    );
    const titleText = this.add
      .text(GAME_WIDTH / 2, (GAME_HEIGHT - height) / 2 + 112, title, {
        fontFamily: 'sans-serif',
        fontSize: '46px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: width - 220, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    const bodyText = this.add
      .text(GAME_WIDTH / 2, titleText.y + titleText.height + 24, body, {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#a9c8d3',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: width - 260, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    root.add([dim, panel, topLine, eyebrowText, titleText, bodyText]);
    this.modalRoot = root;
    return root;
  }

  private addModalButton(
    root: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    primary: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const button = new ResearchButton(this, x, y, width, 64, label, {
      tone: primary ? 'primary' : 'secondary',
      fontSize: 22,
    });
    button.onPress(onClick);
    root.add(button.root);
    return button.root;
  }

  private closeModal(): void {
    this.modalRoot?.destroy(true);
    this.modalRoot = null;
  }

  private showToast(message: string): void {
    this.toast?.destroy();
    this.toastTimer?.remove(false);
    this.toast = this.add
      .text(GAME_WIDTH / 2, 900, message, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#f5fbff',
        backgroundColor: '#123746',
        padding: { x: 22, y: 13 },
        align: 'center',
        wordWrap: { width: 850, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.toastTimer = this.time.delayedCall(2700, () => {
      this.toast?.destroy();
      this.toast = null;
    });
  }

  private stepTextStyle(active: boolean): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: active ? '#f0c95a' : '#617b86',
      fontStyle: 'bold',
    };
  }

  private format(key: string, replacements: Readonly<Record<string, string>>): string {
    return Object.entries(replacements).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      i18n.t(key),
    );
  }
}
