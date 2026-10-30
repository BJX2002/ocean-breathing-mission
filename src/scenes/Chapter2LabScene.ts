import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette, SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { CHAPTER2_ART_MANIFEST, CHAPTER2_SCIENTIST_FRAME_KEYS } from '../graphics/assetManifest';
import { queueSceneArt } from '../graphics/SceneArtLoader';
import { i18n } from '../i18n/LocaleService';
import { inputPrompt } from '../input/ControlScheme';
import { narrationService, type NarrationCueId } from '../services/NarrationService';
import { gameState } from '../state/GameState';
import type { DepthZone, Sensor } from '../types';
import {
  DEMO_LOW_OXYGEN_THRESHOLD_MG_L,
  DEMO_DEPLOYMENT_SCENARIO,
  createDeploymentRunSnapshot,
  demoDoValueAtGridIndex,
  demoSensorHasSignalAtHour,
  deploymentCost,
  evaluateDeployment,
  gridPlacement,
  providesContinuousCoverage,
  repairCost,
  sensorSupportsDepth,
  totalDeploymentCost,
  type DeploymentCellRecord,
  type DeploymentEvaluation,
  type DeploymentRunSnapshot,
} from '../simulation/DeploymentRules';
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
const EVIDENCE_NEUTRAL_COLOR = 0x7895a0;

/**
 * Chapter 2 vertical slice: walk through the vessel lab, interpret Chapter 1
 * evidence, test a next-generation dissolved oxygen sensor, then preview network deployment.
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
  private deploymentRunSnapshot: DeploymentRunSnapshot | null = null;
  private readonly repairedDeploymentCells = new Set<number>();
  private deploymentRepairSpend = 0;
  private monitoringComparisonComplete = false;
  private deploymentToolRound = 0;
  private narrationInstance = 0;
  private budgetAlarmAudio: HTMLAudioElement | null = null;

  constructor() {
    super(SceneKeys.Chapter2Lab);
  }

  init(): void {
    // Phaser reuses Scene instances. Clear every transient reference before a
    // replay from chapter select so stale modal/input state cannot freeze the
    // lab on re-entry.
    this.modalRoot = null;
    this.targetX = null;
    this.pendingInteractionZoneId = null;
    this.highlightedZoneId = null;
    this.speechBubble = null;
    this.toast = null;
    this.toastTimer = null;
    this.evidenceReviewed = false;
    this.sensorUnlocked = false;
    this.consoleVisited = false;
    this.monitoringComparisonComplete = false;
    this.deploymentToolRound = 0;
    this.narrationInstance = 0;
    this.deploymentRunComplete = false;
    this.deploymentRunSnapshot = null;
    this.deploymentRepairSpend = 0;
    this.prepareBudgetAlarm();
    narrationService.resetAutomaticStarts();
    this.zones.length = 0;
    this.progressDots.length = 0;
    this.deploymentPlacements.clear();
    this.repairedDeploymentCells.clear();
  }

  preload(): void {
    queueSceneArt(this, CHAPTER2_ART_MANIFEST);
    narrationService.preload([
      'lab-intro-guide',
      'lab-evidence-guide',
      'lab-experiment-guide',
      'lab-sensor-unlock-guide',
      'lab-final-quiz-1',
      'lab-final-quiz-2',
      'lab-compare-manual',
      'lab-compare-fixed',
      'lab-compare-sensor',
      'lab-deployment-guide',
      'lab-deployment-result-review',
      'lab-deployment-result-failed',
      'lab-deployment-result-detected-incomplete',
      'lab-deployment-result-success',
      'lab-result-reason-unmonitored',
      'lab-result-reason-manual',
      'lab-result-reason-gap',
      'lab-result-reason-unsupported',
      'lab-result-reason-over-budget',
      'lab-result-cell-detected',
      'lab-result-cell-complete',
      'lab-summary-1',
      'lab-summary-2',
      'lab-summary-3',
      'lab-ending',
    ]);
  }

  create(): void {
    this.input.enabled = true;
    if (this.input.keyboard !== null) {
      this.input.keyboard.enabled = true;
      this.input.keyboard.resetKeys();
    }
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Chapter2Lab });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      narrationService.stop();
    });
    this.createLabBackground();
    this.createHeader();
    this.createInteractionZones();
    this.createScientist();
    this.createControls();
    this.refreshZoneStates();
    this.showLabIntro();
    this.sharpenVisibleText();
    if (gameState.debugMode) this.applyDebugScreenRequest();
  }

  /** Opt-in review routes used to inspect canvas-only teaching screens. */
  private applyDebugScreenRequest(): void {
    const requested = new URLSearchParams(window.location.search).get('screen');
    if (requested === null) return;
    this.time.delayedCall(120, () => {
      if (requested === 'lab-intro') return;
      this.closeModal();
      if (requested === 'evidence') {
        this.showEvidenceModal();
        return;
      }
      if (requested === 'experiment') {
        this.evidenceReviewed = true;
        this.showExperimentModal();
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
      if (requested === 'deployment-result') {
        this.showDeploymentResultModal();
        return;
      }
      if (requested === 'deployment-result-vessel' || requested === 'deployment-result-fixed') {
        const sensorId =
          requested === 'deployment-result-vessel' ? 'vessel-sampling' : 'fixed-probe';
        const sensor = gameState.getData().sensors.find((candidate) => candidate.id === sensorId);
        if (sensor === undefined) return;
        const placements = Array.from({ length: 9 }, (_, gridIndex) => {
          const placement = gridPlacement(gridIndex, sensor);
          return placement === null ? [] : [placement];
        }).flat();
        this.deploymentRunSnapshot = createDeploymentRunSnapshot(placements);
        this.deploymentRunComplete = true;
        this.showDeploymentResultModal();
        return;
      }
      if (requested === 'deployment-result-success') {
        const sensingFilm = gameState
          .getData()
          .sensors.find((sensor) => sensor.id === 'sensing-film-node');
        if (sensingFilm === undefined) return;
        const placements = Array.from({ length: 9 }, (_, gridIndex) => {
          const placement = gridPlacement(gridIndex, sensingFilm);
          return placement === null ? [] : [placement];
        }).flat();
        this.deploymentRunSnapshot = createDeploymentRunSnapshot(placements);
        this.deploymentRunComplete = true;
        this.showDeploymentResultModal();
        return;
      }
      if (requested === 'summary') {
        this.showLearningSummary();
        return;
      }
      if (requested === 'quiz') {
        this.showFinalQuiz();
        return;
      }
      if (requested === 'quiz-sensor') {
        this.showFinalQuizSensorQuestion();
        return;
      }
      if (requested === 'ending') this.showMissionCelebration();
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
      .text(GAME_WIDTH - 72, 42, i18n.t('lab.subtitle'), {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#c9e7ed',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    this.progress = this.add
      .text(GAME_WIDTH - 72, 80, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#b5d5df',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setDepth(20);

    [0, 1, 2].forEach((index) => {
      const x = GAME_WIDTH - 330 + index * 38;
      const dot = this.add.circle(x, 89, 8, 0x4d6873, 1).setDepth(21);
      this.progressDots.push(dot);
      if (index < 2) this.add.rectangle(x + 19, 89, 22, 2, 0x4d6873, 0.65).setDepth(20);
    });

    this.add
      .text(72, GAME_HEIGHT - 58, inputPrompt(this, 'lab.controls'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#a7c9d5',
        fontStyle: 'bold',
      })
      .setDepth(20);
    this.prompt = this.add
      .text(GAME_WIDTH - 72, GAME_HEIGHT - 63, '', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#efffff',
        fontStyle: 'bold',
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
        .rectangle(x, y + 108, 260, 72, 0x06141e, 0.76)
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
          fontSize: '20px',
          color: Palette.accentText,
          fontStyle: 'bold',
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

  /** Draws what the old record actually contains, not the missing monitoring dimension. */
  private drawObservedEvidenceGlyph(
    graphics: Phaser.GameObjects.Graphics,
    dimension: 'time' | 'location' | 'depth',
    color: number,
    scale = 1,
  ): void {
    graphics
      .clear()
      .lineStyle(4 * scale, color, 1)
      .fillStyle(color, 0.2);
    if (dimension === 'time') {
      graphics.lineBetween(-42 * scale, 26 * scale, 42 * scale, 26 * scale);
      graphics.lineBetween(-42 * scale, -28 * scale, -42 * scale, 26 * scale);
      graphics.fillCircle(6 * scale, -2 * scale, 9 * scale);
      graphics.strokeCircle(6 * scale, -2 * scale, 14 * scale);
      return;
    }
    if (dimension === 'location') {
      graphics.strokeRoundedRect(-42 * scale, -30 * scale, 84 * scale, 60 * scale, 8 * scale);
      graphics.strokeCircle(0, -5 * scale, 11 * scale);
      graphics.fillCircle(0, -5 * scale, 5 * scale);
      graphics.lineBetween(0, 6 * scale, 0, 24 * scale);
      return;
    }
    graphics.strokeRoundedRect(-34 * scale, -34 * scale, 68 * scale, 68 * scale, 7 * scale);
    graphics.fillRect(-30 * scale, -28 * scale, 60 * scale, 18 * scale);
    graphics.lineBetween(-24 * scale, -3 * scale, 24 * scale, -3 * scale);
    graphics.fillCircle(0, -19 * scale, 6 * scale);
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
        fontSize: '25px',
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
      .setDisplaySize(684, 684)
      .setOrigin(0.5, 0.86)
      .setDepth(18);
    this.add
      .ellipse(330, FLOOR_Y - 8, 190, 28, 0x02080d, 0.35)
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
    if (nearby) this.prompt.setText(inputPrompt(this, 'lab.interact'));
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
      this.showToast(inputPrompt(this, 'lab.interact'));
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
      940,
    );
    type EvidenceDimension = 'time' | 'location' | 'depth';
    const cards: ReadonlyArray<readonly [EvidenceDimension, number, string, string, number]> = [
      ['time', 460, 'lab.evidenceSampleTime', 'lab.evidenceTargetTime', 0xf0c95a],
      ['location', 960, 'lab.evidenceSampleLocation', 'lab.evidenceTargetLocation', 0x57d4cb],
      ['depth', 1460, 'lab.evidenceSampleDepth', 'lab.evidenceTargetDepth', 0x7aa7ff],
    ];
    const targets = new Map<
      EvidenceDimension,
      {
        panel: Phaser.GameObjects.Rectangle;
        text: Phaser.GameObjects.Text;
        cardPanel: Phaser.GameObjects.Rectangle;
        cardNumber: Phaser.GameObjects.Text;
        observedGlyph: Phaser.GameObjects.Graphics;
        x: number;
        y: number;
        roleColor: number;
      }
    >();
    const matched = new Set<EvidenceDimension>(
      this.evidenceReviewed ? ['time', 'location', 'depth'] : [],
    );
    const progressText = this.add
      .text(960, 330, '', {
        fontFamily: 'monospace',
        fontSize: '21px',
        color: '#f0c95a',
      })
      .setOrigin(0.5);
    root.add(progressText);

    cards.forEach(([dimension, x, sampleKey, targetKey, color], index) => {
      const alreadyMatched = matched.has(dimension);
      const visibleColor = alreadyMatched ? color : EVIDENCE_NEUTRAL_COLOR;
      const panel = this.add
        .rectangle(x, 510, 410, 300, 0x092736, 0.96)
        .setStrokeStyle(alreadyMatched ? 3 : 2, visibleColor, alreadyMatched ? 0.9 : 0.52);
      const number = this.add
        .text(x - 168, 376, `0${index + 1}`, {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: Phaser.Display.Color.IntegerToColor(visibleColor).rgba,
          fontStyle: 'bold',
        })
        .setAlpha(0.9);
      const icon = this.add.graphics().setPosition(x, 423);
      this.drawObservedEvidenceGlyph(icon, dimension, visibleColor);
      const sample = this.add
        .text(x, 510, i18n.t(sampleKey), {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: Palette.textLight,
          align: 'center',
          lineSpacing: 8,
          wordWrap: { width: 350, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      const target = this.add
        .rectangle(x, 616, 300, 66, 0x04151f, 0.9)
        .setStrokeStyle(alreadyMatched ? 3 : 2, visibleColor, alreadyMatched ? 1 : 0.45);
      const targetText = this.add
        .text(x, 616, i18n.t(targetKey), {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#73909d',
          align: 'center',
        })
        .setOrigin(0.5)
        .setVisible(!alreadyMatched);
      targets.set(dimension, {
        panel: target,
        text: targetText,
        cardPanel: panel,
        cardNumber: number,
        observedGlyph: icon,
        x,
        y: 616,
        roleColor: color,
      });
      root.add([panel, number, icon, sample, target, targetText]);
    });

    const tray = this.add
      .rectangle(960, 788, 1220, 130, 0x041722, 0.92)
      .setStrokeStyle(1, 0x4e7d8d, 0.48);
    const trayLabel = this.add.text(350, 687, i18n.t('lab.evidenceTray'), {
      fontFamily: 'monospace',
      fontSize: '19px',
      color: '#7fa8b7',
    });
    root.add([tray, trayLabel]);

    const tokenDefinitions: ReadonlyArray<readonly [EvidenceDimension, number, string, number]> = [
      ['depth', 600, 'lab.evidenceTokenDepth', 0x7aa7ff],
      ['time', 960, 'lab.evidenceTokenTime', 0xf0c95a],
      ['location', 1320, 'lab.evidenceTokenLocation', 0x57d4cb],
    ];
    const status = this.add
      .text(960, 877, i18n.t('lab.evidenceDragHint'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
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
      const body = this.add
        .rectangle(0, 0, 286, 70, 0x103b49, 0.98)
        .setStrokeStyle(2, EVIDENCE_NEUTRAL_COLOR, 0.9);
      const glyph = this.add.graphics().setPosition(-102, 0);
      this.drawEvidenceGlyph(glyph, dimension, EVIDENCE_NEUTRAL_COLOR, 0.58);
      const label = this.add
        .text(18, 0, i18n.t(labelKey), {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const target = targets.get(dimension);
      const startX = matched.has(dimension) && target !== undefined ? target.x : homeX;
      const startY = matched.has(dimension) && target !== undefined ? target.y : 792;
      const token = this.add
        .container(startX, startY, [body, glyph, label])
        .setSize(286, 70)
        .setDepth(215)
        .setData('dimension', dimension)
        .setData('roleColor', color)
        .setData('glyph', glyph)
        .setData('homeX', homeX)
        .setData('homeY', 792);
      if (!matched.has(dimension)) {
        token.setInteractive({ useHandCursor: true });
        this.input.setDraggable(token);
      } else {
        body.setFillStyle(0x185143, 1).setStrokeStyle(3, color, 1);
        glyph.clear();
        this.drawEvidenceGlyph(glyph, dimension, color, 0.58);
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
        const roleColor = token.getData('roleColor') as number;
        const tokenGlyph = token.getData('glyph') as Phaser.GameObjects.Graphics;
        token.setPosition(target.x, target.y).disableInteractive();
        (token.first as Phaser.GameObjects.Rectangle)
          .setFillStyle(0x185143, 1)
          .setStrokeStyle(3, roleColor, 1);
        tokenGlyph.clear();
        this.drawEvidenceGlyph(tokenGlyph, dimension, roleColor, 0.58);
        target.text.setVisible(false);
        target.panel.setFillStyle(0x17483d, 1).setStrokeStyle(3, target.roleColor, 1);
        target.cardPanel.setStrokeStyle(3, roleColor, 0.9);
        target.cardNumber.setColor(Phaser.Display.Color.IntegerToColor(roleColor).rgba);
        this.drawObservedEvidenceGlyph(target.observedGlyph, dimension, roleColor);
        matched.add(dimension);
        status.setText(i18n.t('lab.evidenceMatched')).setColor('#91e6a7');
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
      1340,
      956,
      360,
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
    this.addModalButton(root, 380, 956, 260, i18n.t('common.backStep'), false, () => {
      this.closeModal();
    });
    this.addModalNarration(
      root,
      'lab-evidence-guide',
      { x: 960, y: 600, width: 1540, height: 600 },
      880,
      956,
      320,
    );
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
      .text(960, 742, inputPrompt(this, 'lab.introControls'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    root.add(controls);
    this.addModalButton(root, 1320, 836, 430, i18n.t('lab.introStart'), true, () => {
      this.closeModal();
      this.targetX = 300;
      this.pendingInteractionZoneId = 'evidence';
    });
    this.addModalButton(root, 440, 836, 250, i18n.t('common.backStep'), false, () => {
      this.scene.start(SceneKeys.Menu, { screen: 'chapters' });
    });
    this.addModalNarration(
      root,
      'lab-intro-guide',
      { x: 960, y: 565, width: 1260, height: 410 },
      850,
      836,
      300,
    );
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

    const coachRing = this.add
      .ellipse(300, 535, 236, 144, 0xf4d35e, 0.035)
      .setStrokeStyle(5, 0xf4d35e, 1);
    const coachArrow = this.add.graphics();
    const coachText = this.add
      .text(500, 458, i18n.t('lab.experimentCoachDrag'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#10202a',
        fontStyle: 'bold',
        backgroundColor: '#f4d35e',
        padding: { x: 13, y: 7 },
      })
      .setOrigin(0.5);
    root.add([coachRing, coachArrow, coachText]);

    let coachPulse: Phaser.Tweens.Tween | null = null;
    let coachButtonPulse: Phaser.Tweens.Tween | null = null;
    const renderCoachmark = (activeStep: number): void => {
      coachPulse?.stop();
      coachButtonPulse?.stop();
      lightButton.setScale(1).setAlpha(activeStep > 1 ? 0.72 : activeStep === 1 ? 1 : 0.42);
      readerButton.setScale(1).setAlpha(activeStep > 2 ? 0.72 : activeStep === 2 ? 1 : 0.42);
      coachRing
        .setScale(1)
        .setAlpha(1)
        .setVisible(activeStep < 3);
      coachArrow.clear().setVisible(activeStep < 3);
      coachText.setVisible(activeStep < 3);
      if (activeStep >= 3) return;

      coachArrow.lineStyle(5, 0xf4d35e, 0.96).fillStyle(0xf4d35e, 0.96);
      if (activeStep === 0) {
        coachRing.setPosition(300, 535).setDisplaySize(236, 144);
        coachArrow.lineBetween(430, 535, 548, 535);
        coachArrow.fillTriangle(574, 535, 548, 520, 548, 550);
        coachText.setPosition(500, 458).setText(i18n.t('lab.experimentCoachDrag'));
      } else {
        const buttonX = activeStep === 1 ? 1110 : 1510;
        coachRing.setPosition(buttonX, 680).setDisplaySize(310, 88);
        coachArrow.lineBetween(buttonX, 604, buttonX, 628);
        coachArrow.fillTriangle(buttonX, 646, buttonX - 13, 626, buttonX + 13, 626);
        coachText.setPosition(buttonX, 584).setText(inputPrompt(this, 'lab.experimentCoachClick'));
      }
      coachPulse = this.tweens.add({
        targets: coachRing,
        alpha: 0.38,
        duration: 620,
        ease: 'Sine.InOut',
        yoyo: true,
        repeat: -1,
      });
      if (activeStep === 1 || activeStep === 2) {
        const activeButton = activeStep === 1 ? lightButton : readerButton;
        coachButtonPulse = this.tweens.add({
          targets: activeButton,
          scale: { from: 1, to: 1.045 },
          alpha: { from: 0.72, to: 1 },
          duration: 430,
          ease: 'Sine.InOut',
          yoyo: true,
          repeat: -1,
        });
      }
    };

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
        renderCoachmark(2);
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
        renderCoachmark(3);
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
      .rectangle(960, 790, 1390, 82, 0x061d2a, 0.94)
      .setStrokeStyle(1, 0x598799, 0.48);
    const note = this.add
      .text(960, 790, i18n.t('lab.scienceNote'), {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#a9c8d2',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 1280, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([notePanel, note]);
    renderCoachmark(0);
    this.addModalButton(root, 340, 920, 280, i18n.t('common.backStep'), false, () => {
      this.closeModal();
    });
    this.addModalNarration(
      root,
      'lab-experiment-guide',
      { x: 960, y: 570, width: 1500, height: 590 },
      1510,
      920,
      320,
    );

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
        renderCoachmark(1);
      } else {
        this.tweens.add({ targets: film, x: 300, y: 535, duration: 240, ease: 'Sine.Out' });
      }
    };
    this.input.on(Phaser.Input.Events.DRAG, onDrag);
    this.input.on(Phaser.Input.Events.DRAG_END, onDragEnd);
    root.once('destroy', () => {
      this.input.off(Phaser.Input.Events.DRAG, onDrag);
      this.input.off(Phaser.Input.Events.DRAG_END, onDragEnd);
      coachPulse?.stop();
      coachButtonPulse?.stop();
      unlockTimer?.remove(false);
    });
  }

  private showUnlockModal(): void {
    narrationService.stop();
    const root = this.createModal(
      i18n.t('lab.unlockEyebrow'),
      i18n.t('lab.unlockTitle'),
      i18n.t('lab.unlockBody'),
      1640,
      920,
    );

    const productCard = createResearchSurface(this, 500, 585, 560, 430, {
      fill: Palette.paper,
      border: Palette.gold,
      borderAlpha: 0.88,
      radius: 22,
      shadow: true,
    });
    const productHeading = this.add
      .text(500, 390, i18n.t('lab.unlockProductHeading'), {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#6c5319',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    const product = this.add.image(500, 560, 'chapter2-do-sensor-product').setDisplaySize(470, 313);
    const productReference = this.add
      .text(500, 770, i18n.t('lab.productReference'), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#294650',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 520, useAdvancedWrap: true },
      })
      .setOrigin(0.5);

    const columnDivider = this.add.rectangle(845, 590, 2, 450, Palette.accent, 0.32);
    const principleHeading = this.add
      .text(1290, 375, i18n.t('lab.unlockPrincipleHeading'), {
        fontFamily: 'monospace',
        fontSize: '23px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const principleConnector = this.add.graphics();
    principleConnector.lineStyle(4, 0x4b8791, 0.68).fillStyle(0x4b8791, 0.9);
    principleConnector.lineBetween(1148, 490, 1170, 490);
    principleConnector.fillTriangle(1182, 490, 1168, 481, 1168, 499);
    principleConnector.lineBetween(1408, 490, 1430, 490);
    principleConnector.fillTriangle(1442, 490, 1428, 481, 1428, 499);

    const principleSteps = [
      ['01', 1030, 'lab.unlockPrincipleOxygen'],
      ['02', 1290, 'lab.unlockPrincipleSignal'],
      ['03', 1550, 'lab.unlockPrincipleData'],
    ] as const;
    const principleObjects: Phaser.GameObjects.GameObject[] = [];
    principleSteps.forEach(([number, x, key]) => {
      const card = createResearchSurface(this, x, 490, 220, 154, {
        fill: 0x0b3442,
        border: Palette.accent,
        borderAlpha: 0.46,
        radius: 16,
        shadow: false,
      });
      const numberBubble = this.add
        .circle(x, 440, 22, Palette.gold, 0.16)
        .setStrokeStyle(2, Palette.gold, 0.82);
      const numberText = this.add
        .text(x, 440, number, {
          fontFamily: 'monospace',
          fontSize: '17px',
          color: '#f5dc83',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const stepText = this.add
        .text(x, 512, i18n.t(key), {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: 192, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      principleObjects.push(card, numberBubble, numberText, stepText);
    });

    const advantagesHeading = this.add
      .text(1290, 645, i18n.t('lab.unlockAdvantagesHeading'), {
        fontFamily: 'monospace',
        fontSize: '23px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const advantages = [
      [1030, 'lab.unlockAdvantageLongTerm'],
      [1290, 'lab.unlockAdvantageMultiPoint'],
      [1550, 'lab.unlockAdvantageReplaceable'],
    ] as const;
    const advantageObjects: Phaser.GameObjects.GameObject[] = [];
    advantages.forEach(([x, key]) => {
      const pill = createResearchSurface(this, x, 750, 230, 112, {
        fill: 0x103f43,
        border: 0x79dfa6,
        borderAlpha: 0.72,
        radius: 18,
        shadow: false,
      });
      const mark = this.add
        .text(x, 717, '✓', {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#9af0b0',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const advantage = this.add
        .text(x, 765, i18n.t(key), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#e7fff0',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 3,
          wordWrap: { width: 204, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      advantageObjects.push(pill, mark, advantage);
    });

    root.add([
      productCard,
      productHeading,
      product,
      productReference,
      columnDivider,
      principleConnector,
      principleHeading,
      ...principleObjects,
      advantagesHeading,
      ...advantageObjects,
    ]);
    this.addModalButton(root, 1120, 920, 430, i18n.t('lab.continue'), true, () => {
      this.closeModal();
      this.targetX = 1590;
    });
    this.addModalButton(root, 560, 920, 280, i18n.t('common.backStep'), false, () => {
      this.showExperimentModal();
    });
    this.addModalNarration(
      root,
      'lab-sensor-unlock-guide',
      { x: 1290, y: 580, width: 750, height: 470 },
      1510,
      920,
      280,
    );
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
      1660,
      800,
    );
    const sensors = gameState.getData().sensors;
    const vessel = sensors.find((sensor) => sensor.id === 'vessel-sampling');
    const fixedProbe = sensors.find((sensor) => sensor.id === 'fixed-probe');
    const sensingFilm = sensors.find((sensor) => sensor.id === 'sensing-film-node');
    const sensorName = (sensor: Sensor | undefined): string => {
      if (sensor === undefined) return '';
      return i18n.getLocale() === 'en' ? sensor.nameEn : sensor.nameZh;
    };

    const methodDefinitions = [
      {
        sensor: vessel,
        x: 470,
        color: Palette.gold,
        typeKey: 'lab.deviceSingle',
        bodyKey: 'lab.compareManualMethodBody',
        narrationKey: 'lab.compareManualNarration',
        tagKey: 'lab.compareManualMethodTag',
      },
      {
        sensor: fixedProbe,
        x: 960,
        color: 0x65cbea,
        typeKey: 'lab.deviceContinuous',
        bodyKey: 'lab.compareFixedMethodBody',
        narrationKey: 'lab.compareFixedNarration',
        tagKey: 'lab.compareFixedMethodTag',
      },
      {
        sensor: sensingFilm,
        x: 1450,
        color: Palette.accent,
        typeKey: 'lab.deviceContinuous',
        bodyKey: 'lab.compareSensorMethodBody',
        narrationKey: 'lab.compareSensorNarration',
        tagKey: 'lab.compareSensorMethodTag',
      },
    ] as const;

    const methodViews: Phaser.GameObjects.Container[] = [];

    methodDefinitions.forEach((method) => {
      const surface = createResearchSurface(this, method.x, 590, 420, 360, {
        fill: Palette.cardSoft,
        border: method.color,
        borderAlpha: 0.56,
        radius: 24,
        shadow: false,
      });
      const halo = this.add.circle(method.x, 490, 62, method.color, 0.12);
      const glyph = this.add.graphics().setPosition(method.x, 490);
      if (method.sensor !== undefined) {
        this.drawDeviceGlyph(glyph, method.sensor, 1.35, method.color);
      }
      const type = this.add
        .text(method.x, 435, i18n.t(method.typeKey), {
          fontFamily: 'monospace',
          fontSize: '19px',
          color: Phaser.Display.Color.IntegerToColor(method.color).rgba,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      const title = this.add
        .text(method.x, 580, sensorName(method.sensor), {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 350, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      const body = this.add
        .text(method.x, 625, i18n.t(method.bodyKey), {
          fontFamily: 'sans-serif',
          fontSize: i18n.getLocale() === 'en' ? '19px' : '21px',
          color: '#d4edf1',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: 370, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0);
      const tag = this.add
        .text(method.x, 750, i18n.t(method.tagKey), {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: Phaser.Display.Color.IntegerToColor(method.color).rgba,
          fontStyle: 'bold',
          backgroundColor: '#061923aa',
          padding: { x: 14, y: 8 },
        })
        .setOrigin(0.5);
      const methodView = this.add.container(0, 0, [surface, halo, glyph, type, title, body, tag]);
      root.add(methodView);
      methodViews.push(methodView);
    });

    const narrationStatus = this.add
      .text(960, 810, i18n.t('lab.compareNarrationLead'), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#fff3a8',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 900, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const narrationHighlight = this.add
      .rectangle(470, 590, 438, 378, 0xf0c95a, 0.025)
      .setStrokeStyle(4, Palette.gold, 0.95)
      .setVisible(false);
    root.add([narrationStatus, narrationHighlight]);

    this.addModalButton(root, 470, 875, 260, i18n.t('common.backStep'), false, () =>
      this.closeModal(),
    );
    const startButton = this.addModalButton(
      root,
      1270,
      875,
      420,
      i18n.t('lab.compareStartNetwork'),
      true,
      () => {
        this.monitoringComparisonComplete = true;
        this.deploymentToolRound = 0;
        this.deploymentPlacements.clear();
        this.deploymentRunSnapshot = null;
        this.deploymentRunComplete = false;
        this.showDeploymentModal();
      },
    ).setVisible(false);

    const narrationCues: readonly NarrationCueId[] = [
      'lab-compare-manual',
      'lab-compare-fixed',
      'lab-compare-sensor',
    ];
    const runNarration = (index: number): void => {
      if (this.modalRoot !== root) return;
      if (index >= methodDefinitions.length) {
        methodViews.forEach((view) => view.setAlpha(1));
        narrationHighlight.setVisible(false);
        narrationStatus.setText(i18n.t('lab.compareNarrationDone')).setColor('#91e6a7');
        startButton.setVisible(true);
        return;
      }

      methodViews.forEach((view, viewIndex) => {
        view.setAlpha(viewIndex === index ? 1 : 0.42);
      });
      narrationHighlight
        .setPosition(methodDefinitions[index]?.x ?? 470, 590)
        .setVisible(false)
        .setAlpha(1);
      narrationStatus
        .setText(i18n.t(methodDefinitions[index]?.narrationKey ?? 'lab.compareManualNarration'))
        .setColor('#fff3a8');

      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        this.tweens.killTweensOf(narrationHighlight);
        narrationHighlight.setVisible(false).setAlpha(1);
        runNarration(index + 1);
      };
      const cue = narrationCues[index];
      if (cue === undefined) {
        finish();
        return;
      }
      const accepted = narrationService.play(cue, {
        automatic: true,
        automaticKey: `lab-comparison-${index}`,
        onStart: () => {
          narrationHighlight.setVisible(true).setAlpha(0.32);
          this.tweens.add({
            targets: narrationHighlight,
            alpha: { from: 0.32, to: 1 },
            duration: 520,
            yoyo: true,
            repeat: -1,
          });
        },
        onComplete: finish,
        onError: finish,
        onStop: () => {
          this.tweens.killTweensOf(narrationHighlight);
          narrationHighlight.setVisible(false).setAlpha(1);
        },
      });
      if (!accepted) finish();
    };
    const narrationStart = this.time.delayedCall(320, () => runNarration(0));
    root.once('destroy', () => {
      narrationStart.remove(false);
      this.tweens.killTweensOf(narrationHighlight);
      narrationService.stop();
    });
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
    const sensorName = (sensor: Sensor): string =>
      i18n.getLocale() === 'en' ? sensor.nameEn : sensor.nameZh;
    const expectedSensor =
      availableSensors[Math.min(this.deploymentToolRound, availableSensors.length - 1)] ??
      availableSensors[0]!;

    let selectedSensor: Sensor | null = null;
    const totalBudget = DEMO_DEPLOYMENT_SCENARIO.budget;
    let simulationTween: Phaser.Tweens.Tween | null = null;
    let resultButton: Phaser.GameObjects.Container | null = null;
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
      { key: 'allPointsCovered' as const, label: 'lab.goalAllPoints' },
      { key: 'completeDataAtAllPoints' as const, label: 'lab.goalCompleteData' },
      { key: 'withinBudget' as const, label: 'lab.goalBudget' },
    ];
    const points: Array<{
      point: Phaser.GameObjects.Arc;
      ring: Phaser.GameObjects.Arc;
      heat: Phaser.GameObjects.Arc;
      glyph: Phaser.GameObjects.Graphics;
      value: Phaser.GameObjects.Text;
      wrench: Phaser.GameObjects.Text;
    }> = [];

    const isEnglish = i18n.getLocale() === 'en';
    const equipmentTitle = this.add
      .text(170, 318, i18n.t('lab.equipment'), {
        fontFamily: 'monospace',
        fontSize: isEnglish ? '22px' : '25px',
        color: Palette.accentText,
        fontStyle: 'bold',
        wordWrap: { width: 290, useAdvancedWrap: true },
      })
      .setOrigin(0, 0.5);
    const deploymentTitle = this.add.text(790, 316, i18n.t('lab.deployment'), {
      fontFamily: 'monospace',
      fontSize: '25px',
      color: Palette.accentText,
      fontStyle: 'bold',
    });
    const budgetPill = this.add
      .rectangle(600, 318, 270, 48, 0x3b3217, 0.94)
      .setStrokeStyle(2, Palette.gold, 0.64);
    const budgetText = this.add
      .text(600, 318, '', {
        fontFamily: 'monospace',
        fontSize: '21px',
        color: '#f0c95a',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    const showBudgetAlarm = (shortfall: number): void => {
      this.playBudgetAlarm();
      budgetPill.setFillStyle(0x6a2227, 1).setStrokeStyle(3, Palette.danger, 1);
      budgetText.setColor('#fff3ef');
      selectedText
        .setText(this.format('lab.budgetAlarm', { amount: `$${shortfall}` }))
        .setColor('#ffb09d');
      this.tweens.add({
        targets: [budgetPill, budgetText],
        scale: 1.06,
        duration: 90,
        yoyo: true,
        repeat: 2,
      });
      this.time.delayedCall(780, () => {
        budgetPill.setFillStyle(0x3b3217, 0.94).setStrokeStyle(2, Palette.gold, 0.64);
        budgetText.setColor('#f0c95a');
      });
    };
    const timeText = this.add
      .text(1770, 316, this.format('lab.simTime', { hour: '00:00' }), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#8debe3',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    const selectedText = this.add
      .text(1265, 850, '', {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#d6f4f5',
        align: 'center',
        wordWrap: { width: 980, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const trialText = this.add
      .text(
        1290,
        354,
        this.format('lab.trialRound', {
          round: String(this.deploymentToolRound + 1),
          name: sensorName(expectedSensor),
        }),
        {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#fff3a8',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 560, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5);
    root.add([
      equipmentTitle,
      deploymentTitle,
      trialText,
      budgetPill,
      budgetText,
      timeText,
      selectedText,
    ]);

    const goalsSurface = createResearchSurface(this, 450, 816, 580, 132, {
      fill: Palette.cardSoft,
      border: Palette.accent,
      borderAlpha: 0.34,
      radius: 18,
      shadow: false,
    });
    const goalsTitle = this.add.text(170, 758, i18n.t('lab.goalTitle'), {
      fontFamily: 'monospace',
      fontSize: '23px',
      color: '#f0c95a',
      fontStyle: 'bold',
    });
    const goalRows = goalDefinitions.map((goal, index) => {
      const row = this.add.text(175, 789 + index * 31, '', {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#789aa8',
        fontStyle: 'bold',
      });
      return { ...goal, row };
    });
    root.add([goalsSurface, goalsTitle, ...goalRows.map(({ row }) => row)]);

    const equipmentGuide = this.add
      .rectangle(318, 318, 292, 58, 0x3fd0c9, 0.025)
      .setStrokeStyle(4, Palette.accent, 0.95);
    const goalGuide = this.add
      .rectangle(450, 816, 598, 142, 0xf0c95a, 0.025)
      .setStrokeStyle(4, Palette.gold, 0.95);
    const stepTwoGuide = this.add
      .rectangle(965, 328, 400, 58, 0x3fd0c9, 0.025)
      .setStrokeStyle(4, Palette.accent, 0.95)
      .setVisible(false);
    root.add([equipmentGuide, goalGuide, stepTwoGuide]);
    const pulseGuide = (target: Phaser.GameObjects.Rectangle): void => {
      target.setVisible(true).setAlpha(1);
      this.tweens.killTweensOf(target);
      this.tweens.add({
        targets: target,
        alpha: { from: 0.28, to: 1 },
        scale: { from: 0.985, to: 1.025 },
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    };
    const stopGuide = (target: Phaser.GameObjects.Rectangle): void => {
      this.tweens.killTweensOf(target);
      target.setVisible(false).setScale(1).setAlpha(1);
    };
    const stopIntroGuides = (): void => {
      stopGuide(goalGuide);
      stopGuide(equipmentGuide);
      equipmentTitle.setAlpha(1);
      goalsTitle.setAlpha(1);
    };
    const narrationStart = this.time.delayedCall(320, () => {
      const accepted = narrationService.play('lab-deployment-guide', {
        automatic: true,
        automaticKey: 'lab-deployment-guide-screen',
        onStart: () => {
          // Keep the words steady; only the two surrounding coachmark frames pulse.
          pulseGuide(goalGuide);
          pulseGuide(equipmentGuide);
        },
        onComplete: stopIntroGuides,
        onError: stopIntroGuides,
        onStop: stopIntroGuides,
      });
      if (!accepted) stopIntroGuides();
    });
    let stepTwoTimer: Phaser.Time.TimerEvent | null = null;

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
          fontSize: '20px',
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
          fontSize: '19px',
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
            fontSize: '19px',
            color: '#d8f7f5',
            backgroundColor: '#061923aa',
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5)
          .setDepth(207)
          .setVisible(false);
        const wrench = this.add
          .text(x + 31, y - 35, '🔧', { fontFamily: 'sans-serif', fontSize: '26px' })
          .setOrigin(0.5)
          .setDepth(208)
          .setVisible(false);
        points.push({ point, ring, heat, glyph, value, wrench });
        root.add([heat, ring, point, glyph, value, wrench]);
        point.on(Phaser.Input.Events.POINTER_UP, () => {
          if (simulationRunning) return;
          if (placements.has(index)) {
            const placedSensor = placements.get(index);
            const affectedIndexes =
              placedSensor?.id === 'vessel-sampling' ? [column, column + 3, column + 6] : [index];
            affectedIndexes.forEach((affectedIndex) => {
              placements.delete(affectedIndex);
              this.deploymentPlacements.delete(affectedIndex);
            });
            this.deploymentRunComplete = false;
            this.deploymentRunSnapshot = null;
            this.repairedDeploymentCells.clear();
            this.deploymentRepairSpend = 0;
            resultButton?.setVisible(false);
            render();
            return;
          }
          if (selectedSensor === null) {
            selectedText.setText(i18n.t('lab.selectDeviceFirst')).setColor('#ffcf78');
            return;
          }
          const targetDepth = depthValues[row];
          if (targetDepth !== undefined && !sensorSupportsDepth(selectedSensor, targetDepth)) {
            selectedText
              .setText(this.format('lab.depthLimit', { name: sensorName(selectedSensor) }))
              .setColor('#ffcf78');
            return;
          }
          const nextPlacements = new Map(placements);
          const sensorToPlace = selectedSensor;
          const affectedIndexes =
            sensorToPlace.id === 'vessel-sampling' ? [column, column + 3, column + 6] : [index];
          affectedIndexes.forEach((affectedIndex) =>
            nextPlacements.set(affectedIndex, sensorToPlace),
          );
          const projectedDeployment = [...nextPlacements.entries()].flatMap(
            ([gridIndex, sensor]) => {
              const placement = gridPlacement(gridIndex, sensor);
              return placement === null ? [] : [placement];
            },
          );
          const projectedCost = totalDeploymentCost(projectedDeployment);
          if (projectedCost > totalBudget) showBudgetAlarm(projectedCost - totalBudget);
          placements.clear();
          nextPlacements.forEach((sensor, gridIndex) => placements.set(gridIndex, sensor));
          this.deploymentPlacements.clear();
          placements.forEach((sensor, gridIndex) =>
            this.deploymentPlacements.set(gridIndex, sensor.id),
          );
          this.deploymentRunComplete = false;
          this.deploymentRunSnapshot = null;
          this.repairedDeploymentCells.clear();
          this.deploymentRepairSpend = 0;
          resultButton?.setVisible(false);
          stopGuide(stepTwoGuide);
          stepTwoTimer?.remove(false);
          render();
        });
      });
    });

    availableSensors.forEach((sensor, index) => {
      const x = 450;
      const y = 412 + index * 128;
      const panel = this.add
        .rectangle(x, y, 580, 118, 0x0a2c3b, 0.94)
        .setStrokeStyle(2, 0x507b89, 0.62)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add.graphics().setPosition(x - 238, y);
      this.drawDeviceGlyph(glyph, sensor, 0.96, 0x9bded8);
      const title = this.add.text(x - 175, y - 43, sensorName(sensor), {
        fontFamily: 'sans-serif',
        fontSize: isEnglish ? '24px' : '26px',
        color: Palette.textLight,
        fontStyle: 'bold',
        wordWrap: { width: 405, useAdvancedWrap: true },
      });
      const ruleKey =
        sensor.id === 'vessel-sampling'
          ? 'lab.deviceVesselRule'
          : sensor.id === 'fixed-probe'
            ? 'lab.deviceFixedRule'
            : 'lab.deviceFilmRule';
      const values = this.add.text(
        x - 175,
        y - 4,
        this.format(ruleKey, {
          price: `$${deploymentCost(sensor)}`,
          repair: `$${repairCost(sensor)}`,
        }),
        {
          fontFamily: 'sans-serif',
          fontSize: isEnglish ? '21px' : '23px',
          color: '#c5e0e6',
          lineSpacing: 5,
          wordWrap: { width: 405, useAdvancedWrap: true },
        },
      );
      const badge =
        sensor.id === 'sensing-film-node'
          ? this.add
              .text(x + 272, y - 48, i18n.t('lab.newPart'), {
                fontFamily: 'monospace',
                fontSize: '18px',
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
        if (sensor.id !== expectedSensor.id) {
          selectedText
            .setText(
              this.format('lab.trialLocked', {
                name: sensorName(expectedSensor),
              }),
            )
            .setColor('#ffcf78');
          return;
        }
        if (selectedSensor?.id !== sensor.id) {
          placements.clear();
          this.deploymentPlacements.clear();
          this.deploymentRunComplete = false;
          this.deploymentRunSnapshot = null;
          this.repairedDeploymentCells.clear();
          this.deploymentRepairSpend = 0;
          resultButton?.setVisible(false);
        }
        selectedSensor = sensor;
        narrationService.stop();
        stopGuide(goalGuide);
        stopGuide(equipmentGuide);
        this.tweens.killTweensOf(equipmentTitle);
        this.tweens.killTweensOf(goalsTitle);
        equipmentTitle.setAlpha(1);
        goalsTitle.setAlpha(1);
        pulseGuide(stepTwoGuide);
        stepTwoTimer?.remove(false);
        stepTwoTimer = this.time.delayedCall(5000, () => stopGuide(stepTwoGuide));
        render();
      });
    });

    const hint = this.add
      .text(960, 982, i18n.t('lab.previewHint'), {
        fontFamily: 'sans-serif',
        fontSize: '17px',
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
      points.forEach(({ heat, value, wrench }, index) => {
        const sensor = placements.get(index);
        wrench.setVisible(false);
        if (sensor === undefined) {
          heat.setFillStyle(0x6e8690, 0.05);
          value.setText('?').setColor('#718a94').setVisible(true);
          return;
        }
        const signalInterrupted =
          providesContinuousCoverage(sensor) && !demoSensorHasSignalAtHour(sensor, hour);
        if (signalInterrupted) {
          heat.setAlpha(1).setFillStyle(Palette.gold, 0.18);
          value.setText(i18n.t('lab.simSignalGap')).setColor('#ffd873').setVisible(true);
          wrench.setVisible(true);
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

    const currentDeployment = () =>
      [...placements.entries()].flatMap(([index, sensor]) => {
        const placement = gridPlacement(index, sensor);
        return placement === null ? [] : [placement];
      });

    const evaluateCurrentDeployment = (): DeploymentEvaluation =>
      evaluateDeployment(currentDeployment(), DEMO_DEPLOYMENT_SCENARIO);

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
      this.repairedDeploymentCells.clear();
      this.deploymentRepairSpend = 0;
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
          const snapshot = createDeploymentRunSnapshot(
            currentDeployment(),
            DEMO_DEPLOYMENT_SCENARIO,
          );
          const evaluation = snapshot.evaluation;
          this.deploymentRunComplete = true;
          this.deploymentRunSnapshot = snapshot;
          if (evaluation.success) this.consoleVisited = true;
          this.refreshZoneStates();
          simulationRunning = false;
          render();
          if (evaluation.success) playSuccessCelebration();
          runButton.setAlpha(1);
          resultButton?.setVisible(true);
          this.time.delayedCall(420, () => this.showDeploymentResultModal());
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
    resultButton = this.addModalButton(
      root,
      1020,
      930,
      340,
      i18n.t('lab.viewDeploymentResult'),
      true,
      () => this.showDeploymentResultModal(),
    ).setVisible(this.deploymentRunSnapshot !== null);

    const render = (): void => {
      const evaluation = evaluateCurrentDeployment();
      const remainingAfterRepairs = evaluation.remainingBudget - this.deploymentRepairSpend;
      budgetText.setText(`${i18n.t('lab.budget')}  $${remainingAfterRepairs} / $${totalBudget}`);
      budgetText.setColor(remainingAfterRepairs < 0 ? '#ff9c86' : '#f0c95a');

      if (this.deploymentRunComplete) {
        const missingGoals = goalRows
          .filter(({ key }) =>
            key === 'withinBudget' ? remainingAfterRepairs < 0 : !evaluation.goals[key],
          )
          .map(({ label }) => i18n.t(label));
        const effectiveSuccess = evaluation.success && remainingAfterRepairs >= 0;
        selectedText
          .setText(
            effectiveSuccess
              ? i18n.t('lab.simDetected')
              : this.format('lab.goalsMissingPrefix', { goals: missingGoals.join(' · ') }),
          )
          .setColor(effectiveSuccess ? '#91e6a7' : '#ffcf78');
      } else if (selectedSensor === null) {
        selectedText.setText(i18n.t('lab.selectDeviceFirst')).setColor('#d6f4f5');
      } else {
        const placementInstruction =
          selectedSensor.id === 'vessel-sampling'
            ? i18n.t('lab.placeVesselNext')
            : inputPrompt(this, 'lab.placeDeviceNext');
        selectedText
          .setText(placementInstruction.replace('{name}', sensorName(selectedSensor)))
          .setColor('#d6f4f5');
      }

      goalRows.forEach(({ key, label, row }) => {
        const pending = key === 'completeDataAtAllPoints' && !this.deploymentRunComplete;
        const waitingForFirstPlacement = key === 'withinBudget' && placements.size === 0;
        const goalComplete =
          key === 'withinBudget' ? remainingAfterRepairs >= 0 : evaluation.goals[key];
        const complete = !pending && !waitingForFirstPlacement && goalComplete;
        row
          .setText(`${pending ? '?' : complete ? '✓' : '○'}  ${i18n.t(label)}`)
          .setColor(pending ? '#f0c95a' : complete ? '#91e6a7' : '#789aa8');
      });
      equipmentCards.forEach(({ sensor, panel, glyph }) => {
        const selected = sensor.id === selectedSensor?.id;
        const availableThisRound = sensor.id === expectedSensor.id;
        panel
          .setFillStyle(selected ? 0x124b50 : 0x0a2c3b, 0.98)
          .setStrokeStyle(
            selected ? 3 : 2,
            selected ? 0x8ff0df : availableThisRound ? 0xf0c95a : 0x507b89,
            selected ? 1 : availableThisRound ? 0.9 : 0.32,
          )
          .setAlpha(availableThisRound ? 1 : 0.42);
        glyph.setAlpha(availableThisRound ? 1 : 0.42);
        this.drawDeviceGlyph(glyph, sensor, 0.96, selected ? 0xc8fff5 : 0x7ea5af);
      });
      points.forEach(({ point, ring, heat, glyph, value, wrench }, index) => {
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
          wrench.setVisible(false);
        } else {
          point.setAlpha(1);
          ring.setAlpha(1);
          point.setFillStyle(0x164840, 0.98).setStrokeStyle(3, 0x8ce6a3, 1);
          ring.setStrokeStyle(2, 0x8ce6a3, 0.55);
          this.drawDeviceGlyph(glyph, sensor, 0.48, 0xd9fff1);
          if (!this.deploymentRunComplete) {
            heat.setAlpha(0);
            value.setVisible(false);
            wrench.setVisible(false);
          } else if (sensor.id === 'fixed-probe') {
            wrench.setVisible(!this.repairedDeploymentCells.has(index));
          }
        }
      });
      runButton.setAlpha(placements.size > 0 ? 1 : 0.38);
      resultButton?.setVisible(this.deploymentRunSnapshot !== null);
      if (this.deploymentRunComplete) {
        updateSimulationVisual(5);
        points.forEach(({ wrench }, index) => {
          const sensor = placements.get(index);
          wrench.setVisible(
            sensor?.id === 'fixed-probe' && !this.repairedDeploymentCells.has(index),
          );
        });
        timeText.setText(i18n.t('lab.simSummaryTime'));
      } else if (!simulationRunning) {
        timeText.setText(this.format('lab.simTime', { hour: '00:00' }));
      }
    };
    render();
    root.once('destroy', () => {
      simulationTween?.stop();
      narrationStart.remove(false);
      narrationService.stop();
      stepTwoTimer?.remove(false);
      [equipmentGuide, goalGuide, stepTwoGuide].forEach((guide) => this.tweens.killTweensOf(guide));
    });
  }

  private showDeploymentResultModal(): void {
    const snapshot = this.deploymentRunSnapshot;
    const resultTitle =
      snapshot === null
        ? i18n.t('lab.deploymentResultNoRunTitle')
        : snapshot.success
          ? i18n.t('lab.deploymentResultSuccessTitle')
          : snapshot.eventDetected
            ? i18n.t('lab.deploymentResultDetectedTitle')
            : i18n.t('lab.deploymentResultGapTitle');
    const resultBody =
      snapshot === null
        ? i18n.t('lab.deploymentResultNoRunBody')
        : snapshot.success
          ? i18n.t('lab.deploymentResultSuccessBody')
          : snapshot.eventDetected
            ? i18n.t('lab.deploymentResultDetectedBody')
            : i18n.t('lab.deploymentResultGapBody');
    const root = this.createModal(
      i18n.t('lab.deploymentResultEyebrow'),
      resultTitle,
      resultBody,
      1720,
      940,
    );

    const hasNextToolTrial = snapshot !== null && !snapshot.success && this.deploymentToolRound < 2;
    let nextToolHighlight: Phaser.GameObjects.Rectangle | null = null;
    if (hasNextToolTrial) {
      nextToolHighlight = this.add
        .rectangle(500, 930, 422, 82, 0xf0c95a, 0.035)
        .setStrokeStyle(4, Palette.gold, 0.95);
      root.add(nextToolHighlight);
      this.tweens.add({
        targets: nextToolHighlight,
        alpha: { from: 0.28, to: 1 },
        scale: { from: 0.98, to: 1.035 },
        duration: 540,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    const resultActionButton = this.addModalButton(
      root,
      500,
      930,
      hasNextToolTrial ? 390 : 300,
      i18n.t(hasNextToolTrial ? 'lab.deploymentResultNextTrial' : 'lab.deploymentResultBack'),
      false,
      () => {
        if (hasNextToolTrial) {
          this.deploymentToolRound += 1;
          this.deploymentPlacements.clear();
          this.deploymentRunComplete = false;
          this.deploymentRunSnapshot = null;
          this.repairedDeploymentCells.clear();
          this.deploymentRepairSpend = 0;
        }
        this.showDeploymentModal();
      },
    );
    if (hasNextToolTrial) root.bringToTop(resultActionButton);
    root.once('destroy', () => {
      if (nextToolHighlight !== null) this.tweens.killTweensOf(nextToolHighlight);
    });

    if (snapshot === null) {
      const emptySurface = createResearchSurface(this, 960, 585, 1120, 360, {
        fill: Palette.cardSoft,
        border: 0x6f8d98,
        borderAlpha: 0.42,
        radius: 24,
        shadow: false,
      });
      const emptyText = this.add
        .text(960, 585, i18n.t('lab.deploymentResultNoRunBody'), {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: '#a9c8d3',
          align: 'center',
        })
        .setOrigin(0.5);
      root.add([emptySurface, emptyText]);
      return;
    }

    const failureReasonKeys: string[] = [];
    const resultNarrationCues: NarrationCueId[] = [];
    if (snapshot.success) {
      resultNarrationCues.push('lab-deployment-result-success');
    } else {
      resultNarrationCues.push(
        snapshot.eventDetected
          ? 'lab-deployment-result-detected-incomplete'
          : 'lab-deployment-result-failed',
      );
      if (snapshot.cells.some((cell) => cell.mode === 'unmonitored')) {
        failureReasonKeys.push('lab.resultReasonUnmonitored');
        resultNarrationCues.push('lab-result-reason-unmonitored');
      }
      if (snapshot.cells.some((cell) => cell.mode === 'unsupported')) {
        failureReasonKeys.push('lab.resultReasonUnsupported');
        resultNarrationCues.push('lab-result-reason-unsupported');
      }
      if (snapshot.cells.some((cell) => cell.mode === 'manual')) {
        failureReasonKeys.push('lab.resultReasonManual');
        resultNarrationCues.push('lab-result-reason-manual');
      }
      if (snapshot.cells.some((cell) => cell.signalGaps.length > 0)) {
        failureReasonKeys.push('lab.resultReasonGap');
        resultNarrationCues.push('lab-result-reason-gap');
      }
      if (!snapshot.evaluation.goals.withinBudget) {
        failureReasonKeys.push('lab.resultReasonOverBudget');
        resultNarrationCues.push('lab-result-reason-over-budget');
      }
    }

    const resultCriteria = this.add
      .text(960, 319, '', {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#d8eef2',
        fontStyle: 'bold',
        align: 'center',
        backgroundColor: '#0b3441dd',
        padding: { x: 18, y: 8 },
      })
      .setOrigin(0.5);
    root.add(resultCriteria);

    const sensors = gameState.getData().sensors;
    const siteKeys = ['lab.siteEntrance', 'lab.siteRaft', 'lab.siteInner'] as const;
    const depthKeys: Record<DepthZone, string> = {
      surface: 'lab.depthSurface',
      mid: 'lab.depthMid',
      bottom: 'lab.depthBottom',
    };
    const coverageSurface = createResearchSurface(this, 850, 580, 1170, 430, {
      fill: Palette.cardSoft,
      border: Palette.accent,
      borderAlpha: 0.44,
      radius: 24,
      shadow: false,
    });
    const coverageTitle = this.add.text(300, 386, i18n.t('lab.resultCoverageTitle'), {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#f0c95a',
      fontStyle: 'bold',
      wordWrap: { width: 430, useAdvancedWrap: true },
    });
    const coverageHint = this.add
      .text(1390, 390, inputPrompt(this, 'lab.resultCoverageHint'), {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#a7cbd4',
        align: 'right',
        wordWrap: { width: 620, useAdvancedWrap: true },
      })
      .setOrigin(1, 0);
    root.add([coverageSurface, coverageTitle, coverageHint]);

    const cellXs = [630, 900, 1170] as const;
    const cellYs = [500, 615, 730] as const;
    siteKeys.forEach((key, column) => {
      const x = cellXs[column];
      if (x === undefined) return;
      const label = this.add
        .text(x, 432, i18n.t(key), {
          fontFamily: 'sans-serif',
          fontSize: '27px',
          color: '#e5fbff',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 260, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      root.add(label);
    });

    const cellViews: Array<{
      cell: DeploymentCellRecord;
      panel: Phaser.GameObjects.Rectangle;
      label: Phaser.GameObjects.Text;
      border: number;
    }> = [];
    const cellLabelKey = (cell: DeploymentCellRecord): string => {
      if (this.repairedDeploymentCells.has(cell.gridIndex)) {
        return cell.lowOxygenDetected ? 'lab.resultCellRepairedLow' : 'lab.resultCellRepaired';
      }
      if (cell.signalGaps.length > 0) {
        return cell.lowOxygenDetected ? 'lab.resultCellLowGap' : 'lab.resultCellGap';
      }
      if (cell.lowOxygenDetected) return 'lab.resultCellLow';
      if (cell.mode === 'continuous') return 'lab.resultCellContinuous';
      if (cell.mode === 'manual') return 'lab.resultCellManual';
      return 'lab.resultCellNoData';
    };
    const cellNarrationCue = (cell: DeploymentCellRecord): NarrationCueId => {
      if (cell.mode === 'unmonitored') return 'lab-result-reason-unmonitored';
      if (cell.mode === 'unsupported') return 'lab-result-reason-unsupported';
      if (cell.mode === 'manual') return 'lab-result-reason-manual';
      if (cell.signalGaps.length > 0) return 'lab-result-reason-gap';
      return cell.lowOxygenDetected ? 'lab-result-cell-detected' : 'lab-result-cell-complete';
    };
    snapshot.cells.forEach((cell) => {
      const column = cell.gridIndex % 3;
      const row = Math.floor(cell.gridIndex / 3);
      const x = cellXs[column];
      const y = cellYs[row];
      if (x === undefined || y === undefined) return;
      if (column === 0) {
        const depthLabel = this.add
          .text(475, y, i18n.t(depthKeys[cell.depthZone]), {
            fontFamily: 'sans-serif',
            fontSize: '26px',
            color: '#b8dbe2',
            fontStyle: 'bold',
            align: 'right',
          })
          .setOrigin(1, 0.5);
        root.add(depthLabel);
      }
      const fill = cell.lowOxygenDetected
        ? 0x592d32
        : cell.signalGaps.length > 0
          ? 0x413a22
          : cell.mode === 'continuous'
            ? 0x164840
            : cell.mode === 'manual'
              ? 0x4c3d1e
              : 0x102b36;
      const border = cell.lowOxygenDetected
        ? Palette.danger
        : cell.signalGaps.length > 0
          ? Palette.gold
          : cell.mode === 'continuous'
            ? Palette.success
            : cell.mode === 'manual'
              ? Palette.gold
              : 0x607c87;
      const panel = this.add
        .rectangle(x, y, 248, 102, fill, 0.98)
        .setStrokeStyle(3, border, 0.78)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x, y, i18n.t(cellLabelKey(cell)), {
          fontFamily: 'sans-serif',
          fontSize: i18n.getLocale() === 'en' ? '18px' : '22px',
          color: cell.mode === 'unmonitored' ? '#7f9ba5' : '#f0fffc',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 5,
          wordWrap: { width: 228, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      cellViews.push({ cell, panel, label, border });
      root.add([panel, label]);
    });

    const detailSurface = createResearchSurface(this, 850, 848, 1080, 76, {
      fill: Palette.cardSoft,
      border: Palette.accent,
      borderAlpha: 0.34,
      radius: 18,
      shadow: false,
    });
    const selectedDevice = this.add
      .text(850, 829, '', {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#e5f8fa',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 1000, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const cellExplanation = this.add
      .text(850, 864, '', {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#cbe7eb',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: 1000, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([detailSurface, selectedDevice, cellExplanation]);

    const sidebarSurface = createResearchSurface(this, 1600, 630, 350, 350, {
      fill: Palette.cardSoft,
      border: snapshot.success ? Palette.success : Palette.gold,
      borderAlpha: 0.56,
      radius: 22,
      shadow: false,
    });
    const sidebarTitle = this.add
      .text(
        1600,
        490,
        i18n.t(snapshot.success ? 'lab.resultAdvantageTitle' : 'lab.resultReviewTitle'),
        {
          fontFamily: 'sans-serif',
          fontSize: '25px',
          color: snapshot.success ? '#91e6a7' : '#f0c95a',
          fontStyle: 'bold',
          align: 'center',
        },
      )
      .setOrigin(0.5);
    const sidebarBody = this.add
      .text(
        1600,
        545,
        snapshot.success ? i18n.t('lab.resultAdvantageBody') : '',
        {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          color: '#d7edf1',
          align: 'left',
          lineSpacing: 14,
          wordWrap: { width: 290, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5, 0);
    const sidebarReasons = this.add.container(1445, 545).setVisible(!snapshot.success);
    const renderFailureReasons = (): void => {
      sidebarReasons.removeAll(true);
      const reasonCount = failureReasonKeys.length;
      const fontSize = reasonCount >= 4 ? 14 : reasonCount === 3 ? 16 : 18;
      const itemGap = reasonCount >= 4 ? 6 : 12;
      let offsetY = 0;
      failureReasonKeys.forEach((key) => {
        const bullet = this.add
          .text(0, offsetY, '•', {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            color: '#d7edf1',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0);
        const reason = this.add
          .text(22, offsetY, i18n.t(key), {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            color: '#d7edf1',
            align: 'left',
            lineSpacing: 4,
            wordWrap: { width: 275, useAdvancedWrap: true },
          })
          .setOrigin(0, 0);
        sidebarReasons.add([bullet, reason]);
        offsetY += Math.max(bullet.height, reason.height) + itemGap;
      });
    };
    if (!snapshot.success) renderFailureReasons();
    root.add([sidebarSurface, sidebarTitle, sidebarBody, sidebarReasons]);

    this.addModalNarration(
      root,
      resultNarrationCues,
      { x: 1600, y: 630, width: 340, height: 370 },
      snapshot.success ? 960 : 1490,
      930,
      300,
    );

    let activeCell: DeploymentCellRecord | null = null;
    const repairButton = new ResearchButton(
      this,
      1600,
      842,
      300,
      72,
      this.format('lab.repairProbe', { cost: '$0' }),
      { tone: 'secondary', fontSize: 22 },
    );
    repairButton.root.setVisible(false);
    root.add(repairButton.root);

    const refreshResultCriteria = (): void => {
      const remaining =
        DEMO_DEPLOYMENT_SCENARIO.budget -
        snapshot.evaluation.totalCost -
        this.deploymentRepairSpend;
      resultCriteria
        .setText(
          this.format('lab.resultCriteria', {
            covered: String(snapshot.evaluation.coveredPointCount),
            complete: String(snapshot.evaluation.completePointCount),
            budget: `$${remaining}`,
          }),
        )
        .setColor(remaining < 0 ? '#ff9c86' : '#d8eef2');
    };
    refreshResultCriteria();

    repairButton.onPress(() => {
      if (activeCell === null || activeCell.sensorId !== 'fixed-probe') return;
      if (this.repairedDeploymentCells.has(activeCell.gridIndex)) return;
      const sensor = sensors.find((candidate) => candidate.id === activeCell?.sensorId);
      if (sensor === undefined) return;
      const cost = repairCost(sensor);
      this.repairedDeploymentCells.add(activeCell.gridIndex);
      this.deploymentRepairSpend += cost;
      const cellView = cellViews.find(({ cell }) => cell.gridIndex === activeCell?.gridIndex);
      cellView?.label.setText(
        i18n.t(
          activeCell.lowOxygenDetected ? 'lab.resultCellRepairedLow' : 'lab.resultCellRepaired',
        ),
      );
      repairButton.root.setVisible(false);
      cellExplanation.setText(i18n.t('lab.resultRepairCompleted'));
      refreshResultCriteria();
      if (
        snapshot.evaluation.totalCost + this.deploymentRepairSpend >
        DEMO_DEPLOYMENT_SCENARIO.budget
      ) {
        if (!failureReasonKeys.includes('lab.resultReasonOverBudget')) {
          failureReasonKeys.push('lab.resultReasonOverBudget');
          resultNarrationCues.push('lab-result-reason-over-budget');
          renderFailureReasons();
        }
        this.playBudgetAlarm();
        narrationService.play('lab-result-reason-over-budget');
      }
    });

    const siteLabelForCell = (cell: DeploymentCellRecord): string => {
      const column = cell.gridIndex % 3;
      const key = siteKeys[column];
      return key === undefined ? cell.locationId : i18n.t(key);
    };
    const renderCell = (cell: DeploymentCellRecord): void => {
      activeCell = cell;
      cellViews.forEach(({ cell: candidate, panel, border }) => {
        const selected = candidate.gridIndex === cell.gridIndex;
        panel.setStrokeStyle(selected ? 4 : 2, selected ? 0xffd75d : border, selected ? 1 : 0.7);
      });

      const site = siteLabelForCell(cell);
      const depth = i18n.t(depthKeys[cell.depthZone]);
      const sensor =
        cell.sensorId === null
          ? null
          : (sensors.find((candidate) => candidate.id === cell.sensorId) ?? null);
      selectedDevice.setText(
        sensor === null
          ? `${site} · ${depth}`
          : `${site} · ${depth}  |  ${i18n.getLocale() === 'en' ? sensor.nameEn : sensor.nameZh}`,
      );

      if (cell.mode === 'manual') {
        repairButton.root.setVisible(false);
        cellExplanation.setText(i18n.t('lab.resultManual'));
      } else if (cell.mode === 'continuous') {
        const needsRepair =
          cell.sensorId === 'fixed-probe' &&
          cell.signalGaps.length > 0 &&
          !this.repairedDeploymentCells.has(cell.gridIndex);
        repairButton.root.setVisible(needsRepair);
        if (needsRepair && sensor !== null) {
          repairButton.setText(this.format('lab.repairProbe', { cost: `$${repairCost(sensor)}` }));
        }
        cellExplanation.setText(
          i18n.t(
            this.repairedDeploymentCells.has(cell.gridIndex)
              ? 'lab.resultRepairCompleted'
              : cell.signalGaps.length > 0
                ? cell.lowOxygenDetected
                  ? 'lab.resultDetectedWithGap'
                  : 'lab.resultFixedGap'
                : cell.lowOxygenDetected
                  ? 'lab.resultDetected'
                  : 'lab.resultContinuous',
          ),
        );
      } else if (cell.mode === 'unsupported') {
        repairButton.root.setVisible(false);
        cellExplanation.setText(i18n.t('lab.resultUnsupportedPrompt'));
      } else {
        repairButton.root.setVisible(false);
        cellExplanation.setText(
          i18n.t(
            cell.depthZone === 'bottom' && cell.mode === 'unmonitored'
              ? 'lab.resultNearBedGap'
              : 'lab.resultNoData',
          ),
        );
      }
    };

    cellViews.forEach(({ cell, panel }) => {
      panel.on(Phaser.Input.Events.POINTER_UP, () => {
        if (narrationService.isPlaying()) return;
        renderCell(cell);
        narrationService.play(cellNarrationCue(cell));
      });
    });
    const eventCell = snapshot.cells.find(
      (cell) =>
        cell.locationId === DEMO_DEPLOYMENT_SCENARIO.eventPoint.locationId &&
        cell.depthZone === DEMO_DEPLOYMENT_SCENARIO.eventPoint.depthZone,
    );
    const initialCell =
      snapshot.cells.find((cell) => cell.lowOxygenDetected) ??
      snapshot.cells.find((cell) => cell.mode === 'continuous' || cell.mode === 'manual') ??
      eventCell ??
      snapshot.cells[0];
    if (initialCell !== undefined) renderCell(initialCell);

    if (snapshot.success) {
      this.addModalButton(root, 1420, 930, 390, i18n.t('lab.deploymentResultContinue'), true, () =>
        this.showLearningSummary(),
      );
    }
  }

  private showLearningSummary(): void {
    const root = this.createModal(
      i18n.t('lab.summaryEyebrow'),
      i18n.t('lab.summaryTitle'),
      i18n.t('lab.summaryBody'),
      1720,
      940,
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
    const themeViews: Phaser.GameObjects.Container[] = [];
    themes.forEach((theme, index) => {
      const x = 490 + index * 470;
      const card = createResearchSurface(this, x, 470, 420, 260, {
        fill: Palette.cardSoft,
        border: theme.color,
        borderAlpha: 0.62,
        radius: 24,
        shadow: false,
      });
      const markBubble = this.add
        .circle(x, 395, 32, theme.color, 0.16)
        .setStrokeStyle(2, theme.color, 0.72);
      const mark = this.add
        .text(x, 395, theme.mark, {
          fontFamily: 'monospace',
          fontSize: theme.mark === '24h' ? '18px' : '23px',
          color: `#${theme.color.toString(16).padStart(6, '0')}`,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const title = this.add
        .text(x, 452, i18n.t(theme.title), {
          fontFamily: 'sans-serif',
          fontSize: '25px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      const body = this.add
        .text(x, 488, i18n.t(theme.body), {
          fontFamily: 'sans-serif',
          fontSize: i18n.getLocale() === 'en' ? '20px' : '22px',
          color: '#cce3e8',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 6,
          wordWrap: { width: 380, useAdvancedWrap: true },
        })
        .setOrigin(0.5, 0);
      const themeView = this.add.container(0, 0, [card, markBubble, mark, title, body]);
      root.add(themeView);
      themeViews.push(themeView);
    });
    const summaryHighlight = this.add
      .rectangle(490, 470, 438, 278, 0xf0c95a, 0.025)
      .setStrokeStyle(4, Palette.gold, 0.96)
      .setVisible(false);
    root.add(summaryHighlight);

    const comparisonTitle = this.add
      .text(960, 620, i18n.t('lab.summaryMethodCompare'), {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#e6f8fa',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    root.add(comparisonTitle);

    const miniDefinitions = [
      {
        x: 490,
        title: 'lab.summaryVesselMini',
        tag: 'lab.summaryVesselMiniTag',
        mark: '1×',
        color: Palette.gold,
      },
      {
        x: 960,
        title: 'lab.summaryFixedMini',
        tag: 'lab.summaryFixedMiniTag',
        mark: '!',
        color: 0x65cbea,
      },
      {
        x: 1430,
        title: 'lab.summaryFilmMini',
        tag: 'lab.summaryFilmMiniTag',
        mark: '24h',
        color: Palette.success,
      },
    ] as const;
    miniDefinitions.forEach((definition) => {
      const card = createResearchSurface(this, definition.x, 720, 420, 150, {
        fill: Palette.cardSoft,
        border: definition.color,
        borderAlpha: 0.5,
        radius: 18,
        shadow: false,
      });
      const title = this.add
        .text(definition.x, 666, i18n.t(definition.title), {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      const markBubble = this.add
        .circle(definition.x, 720, 29, definition.color, 0.16)
        .setStrokeStyle(2, definition.color, 0.72);
      const mark = this.add
        .text(definition.x, 720, definition.mark, {
          fontFamily: 'monospace',
          fontSize: definition.mark === '24h' ? '17px' : '22px',
          color: Phaser.Display.Color.IntegerToColor(definition.color).rgba,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const tag = this.add
        .text(definition.x, 768, i18n.t(definition.tag), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: Phaser.Display.Color.IntegerToColor(definition.color).rgba,
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5);
      root.add([card, title, markBubble, mark, tag]);
    });

    const networkTakeaway = this.add
      .text(960, 838, i18n.t('lab.summaryNetwork'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#dffcf5',
        fontStyle: 'bold',
        align: 'center',
        backgroundColor: '#0f4d50dd',
        padding: { x: 24, y: 9 },
        wordWrap: { width: 1160, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add(networkTakeaway);

    this.addModalButton(root, 700, 940, 310, i18n.t('common.backStep'), false, () => {
      this.showDeploymentResultModal();
    });
    const finishButton = new ResearchButton(
      this,
      1220,
      940,
      420,
      64,
      i18n.t('lab.summaryListenFirst'),
      { tone: 'primary', fontSize: 22 },
    );
    finishButton.setEnabled(false);
    finishButton.onPress(() => this.showFinalQuiz());
    root.add(finishButton.root);

    const summaryCues: readonly NarrationCueId[] = [
      'lab-summary-1',
      'lab-summary-2',
      'lab-summary-3',
    ];
    const narrateTheme = (index: number): void => {
      if (this.modalRoot !== root) return;
      if (index >= themeViews.length) {
        themeViews.forEach((view) => view.setAlpha(1));
        summaryHighlight.setVisible(false);
        finishButton.setText(i18n.t('lab.summaryFinish')).setEnabled(true);
        return;
      }
      themeViews.forEach((view, viewIndex) => view.setAlpha(viewIndex === index ? 1 : 0.38));
      summaryHighlight
        .setPosition(490 + index * 470, 470)
        .setVisible(false)
        .setAlpha(1);
      this.tweens.killTweensOf(summaryHighlight);
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        this.tweens.killTweensOf(summaryHighlight);
        summaryHighlight.setVisible(false).setScale(1).setAlpha(1);
        narrateTheme(index + 1);
      };
      const cue = summaryCues[index];
      if (cue === undefined) {
        finish();
        return;
      }
      const accepted = narrationService.play(cue, {
        automatic: true,
        automaticKey: `lab-summary-${index}`,
        onStart: () => {
          summaryHighlight.setVisible(true).setAlpha(0.28).setScale(0.985);
          this.tweens.add({
            targets: summaryHighlight,
            alpha: { from: 0.28, to: 1 },
            scale: { from: 0.985, to: 1.025 },
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
        },
        onComplete: finish,
        onError: finish,
        onStop: () => {
          this.tweens.killTweensOf(summaryHighlight);
          summaryHighlight.setVisible(false).setScale(1).setAlpha(1);
        },
      });
      if (!accepted) finish();
    };
    const narrationStart = this.time.delayedCall(320, () => narrateTheme(0));
    root.once('destroy', () => {
      narrationStart.remove(false);
      this.tweens.killTweensOf(summaryHighlight);
      narrationService.stop();
    });
  }

  private showFinalQuiz(): void {
    const root = this.createModal(
      this.format('lab.finalQuizEyebrow', { step: '1 / 2' }),
      i18n.t('lab.finalQuizTitle'),
      i18n.t('lab.finalQuizBody'),
      1500,
      820,
    );
    const questionCard = createResearchSurface(this, 960, 470, 1240, 150, {
      fill: Palette.cardSoft,
      border: Palette.gold,
      borderAlpha: 0.58,
      radius: 20,
      shadow: false,
    });
    const question = this.add
      .text(960, 470, `${i18n.t('common.questionLabel')} ${i18n.t('lab.finalQuizQuestion')}`, {
        fontFamily: 'sans-serif',
        fontSize: '34px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 7,
        wordWrap: { width: 1160, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const optionsLabel = this.add
      .text(370, 600, i18n.t('common.optionsLabel'), {
        fontFamily: 'monospace',
        fontSize: '29px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 1);
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
    let quizComplete = false;
    const choiceButtons: ResearchButton[] = [];
    const choices = [
      { key: 'lab.finalQuizA', correct: false },
      { key: 'lab.finalQuizB', correct: true },
    ] as const;
    choices.forEach((choice, index) => {
      const button = new ResearchButton(
        this,
        630 + index * 660,
        680,
        620,
        140,
        `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`,
        { tone: 'secondary', fontSize: 27, lineSpacing: 7 },
      );
      button.onPress(() => {
        if (quizComplete) return;
        if (!choice.correct) {
          button.setTone('danger');
          feedback.setText(i18n.t('lab.finalQuizTryAgain')).setColor('#ffb09d');
          finishButton?.setVisible(false);
          narrationService.play('feedback-try-again');
          return;
        }

        quizComplete = true;
        button.setTone('primary');
        feedback.setText(i18n.t('lab.finalQuizCorrect')).setColor('#91e6a7');
        finishButton?.setVisible(true);
        choiceButtons.forEach((choiceButton) => choiceButton.setEnabled(false));
        narrationService.play('feedback-correct-v2');
      });
      choiceButtons.push(button);
      root.add(button.root);
    });

    this.addModalButton(root, 400, 890, 260, i18n.t('common.backStep'), false, () =>
      this.showLearningSummary(),
    );
    finishButton = this.addModalButton(
      root,
      1320,
      890,
      340,
      i18n.t('lab.finalQuizNext'),
      true,
      () => this.showFinalQuizSensorQuestion(),
    ).setVisible(false);
    this.addModalNarration(
      root,
      'lab-final-quiz-1',
      { x: 960, y: 605, width: 1460, height: 460 },
      850,
      890,
      300,
    );
  }

  private showFinalQuizSensorQuestion(): void {
    const root = this.createModal(
      this.format('lab.finalQuizEyebrow', { step: '2 / 2' }),
      i18n.t('lab.finalQuizTitle'),
      i18n.t('lab.finalQuizBody'),
      1500,
      820,
    );
    const questionCard = createResearchSurface(this, 960, 470, 1240, 150, {
      fill: Palette.cardSoft,
      border: Palette.gold,
      borderAlpha: 0.58,
      radius: 20,
      shadow: false,
    });
    const question = this.add
      .text(
        960,
        470,
        `${i18n.t('common.questionLabel')} ${i18n.t('lab.finalQuizSensorQuestion')}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '34px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 7,
          wordWrap: { width: 1160, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5);
    const optionsLabel = this.add
      .text(370, 600, i18n.t('common.optionsLabel'), {
        fontFamily: 'monospace',
        fontSize: '29px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 1);
    const feedback = this.add
      .text(960, 790, '', {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#91e6a7',
        align: 'center',
        wordWrap: { width: 960, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([questionCard, question, optionsLabel, feedback]);

    let finishButton: Phaser.GameObjects.Container | null = null;
    let quizComplete = false;
    const choiceButtons: ResearchButton[] = [];
    const choices = [
      { key: 'lab.finalQuizSensorA', correct: true },
      { key: 'lab.finalQuizSensorB', correct: false },
    ] as const;
    choices.forEach((choice, index) => {
      const button = new ResearchButton(
        this,
        630 + index * 660,
        680,
        620,
        140,
        `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`,
        { tone: 'secondary', fontSize: 26, lineSpacing: 8 },
      );
      button.onPress(() => {
        if (quizComplete) return;
        if (!choice.correct) {
          button.setTone('danger');
          feedback.setText(i18n.t('lab.finalQuizSensorTryAgain')).setColor('#ffb09d');
          finishButton?.setVisible(false);
          narrationService.play('feedback-try-again');
          return;
        }

        quizComplete = true;
        button.setTone('primary');
        feedback.setText(i18n.t('lab.finalQuizSensorCorrect')).setColor('#91e6a7');
        finishButton?.setVisible(true);
        choiceButtons.forEach((choiceButton) => choiceButton.setEnabled(false));
        narrationService.play('feedback-correct-v2');
      });
      choiceButtons.push(button);
      root.add(button.root);
    });

    this.addModalButton(root, 400, 890, 260, i18n.t('common.backStep'), false, () =>
      this.showFinalQuiz(),
    );
    finishButton = this.addModalButton(
      root,
      1320,
      890,
      340,
      i18n.t('lab.finalQuizFinish'),
      true,
      () => this.showMissionCelebration(),
    ).setVisible(false);
    this.addModalNarration(
      root,
      'lab-final-quiz-2',
      { x: 960, y: 605, width: 1460, height: 460 },
      850,
      890,
      300,
    );
  }

  private showMissionCelebration(): void {
    const root = this.createModal(
      i18n.t('lab.endingEyebrow'),
      i18n.t('lab.endingTitle'),
      i18n.t('lab.endingBody'),
      1380,
      820,
    );
    const achievements = [
      { mark: '01', key: 'lab.endingBadgeChange' },
      { mark: '02', key: 'lab.endingBadgeEvidence' },
      { mark: '03', key: 'lab.endingBadgeNetwork' },
    ] as const;
    achievements.forEach((achievement, index) => {
      const x = 600 + index * 360;
      const card = createResearchSurface(this, x, 440, 310, 108, {
        fill: Palette.cardSoft,
        border: index === 1 ? Palette.gold : Palette.success,
        borderAlpha: 0.58,
        radius: 18,
        shadow: false,
      });
      const mark = this.add
        .text(x - 112, 440, achievement.mark, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: index === 1 ? '#f0c95a' : '#91e6a7',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const label = this.add
        .text(x + 18, 440, i18n.t(achievement.key), {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 225, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      root.add([card, mark, label]);
    });

    const scienceSurface = createResearchSurface(this, 960, 665, 1120, 220, {
      fill: Palette.cardSoft,
      border: Palette.success,
      borderAlpha: 0.68,
      radius: 24,
      shadow: false,
    });
    const scienceMark = this.add
      .text(960, 575, '✦  OCEAN SCIENCE  ✦', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#91e6a7',
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setOrigin(0.5);
    const scienceText = this.add
      .text(960, 645, i18n.t('lab.endingRealScience'), {
        fontFamily: 'sans-serif',
        fontSize: '25px',
        color: '#e5fbf6',
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 10,
        wordWrap: { width: 1000, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    const protectText = this.add
      .text(960, 745, i18n.t('lab.endingProtect'), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#fff3a8',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5);
    root.add([scienceSurface, scienceMark, scienceText, protectText]);

    for (let index = 0; index < 12; index += 1) {
      const sparkle = this.add
        .text(390 + index * 104, 370 + (index % 2) * 500, index % 3 === 0 ? '✦' : '·', {
          fontFamily: 'sans-serif',
          fontSize: index % 3 === 0 ? '30px' : '42px',
          color: index % 2 === 0 ? '#ffe589' : '#8ff0df',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setAlpha(0.2);
      root.add(sparkle);
      this.tweens.add({
        targets: sparkle,
        alpha: { from: 0.2, to: 1 },
        scale: { from: 0.75, to: 1.25 },
        duration: 620 + index * 24,
        delay: index * 55,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    const endingButton = new ResearchButton(
      this,
      960,
      895,
      480,
      64,
      i18n.t('lab.endingListenFirst'),
      { tone: 'primary', fontSize: 22 },
    );
    endingButton.setEnabled(false);
    endingButton.onPress(() => this.scene.start(SceneKeys.Menu, { screen: 'chapters' }));
    root.add(endingButton.root);

    const completeNarration = (): void => {
      if (this.modalRoot !== root) return;
      this.tweens.killTweensOf(scienceSurface);
      scienceSurface.setAlpha(1);
      endingButton.setText(i18n.t('lab.endingAction')).setEnabled(true);
    };
    const narrationStart = this.time.delayedCall(380, () => {
      const accepted = narrationService.play('lab-ending', {
        automatic: true,
        automaticKey: 'lab-ending-screen',
        onStart: () => {
          this.tweens.add({
            targets: scienceSurface,
            alpha: { from: 0.72, to: 1 },
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut',
          });
        },
        onComplete: completeNarration,
        onError: completeNarration,
        onStop: () => {
          this.tweens.killTweensOf(scienceSurface);
          scienceSurface.setAlpha(1);
        },
      });
      if (!accepted) completeNarration();
    });
    root.once('destroy', () => {
      narrationStart.remove(false);
      this.tweens.killTweensOf(scienceSurface);
      narrationService.stop();
    });
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
        fontSize: '22px',
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
        fontSize: '25px',
        color: '#bdd8df',
        align: 'center',
        lineSpacing: 6,
        wordWrap: { width: width - 260, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    root.add([dim, panel, topLine, eyebrowText, titleText, bodyText]);
    this.modalRoot = root;
    this.time.delayedCall(0, () => this.sharpenVisibleText());
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

  /** Attach recorded narration, a replay button and a non-obscuring pulse to a modal. */
  private addModalNarration(
    root: Phaser.GameObjects.Container,
    cueOrCues: NarrationCueId | readonly NarrationCueId[],
    bounds: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    },
    buttonX: number,
    buttonY: number,
    buttonWidth = 320,
  ): Phaser.GameObjects.Container {
    const cues = typeof cueOrCues === 'string' ? [cueOrCues] : cueOrCues;
    const narrationGroupKey = `lab-modal-${++this.narrationInstance}`;
    const highlight = this.add
      .rectangle(bounds.x, bounds.y, bounds.width, bounds.height, 0xf0c95a, 0.018)
      .setStrokeStyle(4, Palette.gold, 0.82)
      .setVisible(false);
    root.addAt(highlight, Math.min(2, root.list.length));

    const voiceButton = new ResearchButton(
      this,
      buttonX,
      buttonY,
      buttonWidth,
      64,
      i18n.t('report.aiVoiceReplay'),
      { tone: 'secondary', fontSize: 20 },
    );
    root.add(voiceButton.root);

    const stopHighlight = (): void => {
      this.tweens.killTweensOf(highlight);
      if (highlight.active) highlight.setVisible(false).setAlpha(1);
    };
    const setReady = (key = 'report.aiVoiceReplay'): void => {
      if (this.modalRoot !== root || !voiceButton.root.active) return;
      voiceButton.setText(i18n.t(key)).setEnabled(true);
    };
    const play = (automatic = false): void => {
      if (this.modalRoot !== root) return;
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
      const playCue = (index: number): void => {
        const cue = cues[index];
        if (cue === undefined) {
          stopHighlight();
          setReady();
          return;
        }
        const accepted = narrationService.play(cue, {
          automatic,
          automaticKey: `${narrationGroupKey}-${index}`,
          onStart: () => {
            if (this.modalRoot !== root || !highlight.active) return;
            this.tweens.killTweensOf(highlight);
            highlight.setVisible(true).setAlpha(0.34);
            this.tweens.add({
              targets: highlight,
              alpha: { from: 0.34, to: 1 },
              duration: 520,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.InOut',
            });
          },
          onComplete: () => playCue(index + 1),
          onError: () => playCue(index + 1),
          onStop: () => {
            stopHighlight();
            setReady();
          },
        });
        if (!accepted) {
          stopHighlight();
          setReady(index === 0 ? 'report.aiVoiceReplay' : 'report.aiVoiceRetry');
        }
      };
      playCue(0);
    };
    voiceButton.onPress(() => play(false));
    play(true);
    root.once('destroy', () => {
      stopHighlight();
    });
    return voiceButton.root;
  }

  private closeModal(): void {
    narrationService.stop();
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

  private prepareBudgetAlarm(): void {
    if (typeof window === 'undefined' || typeof window.Audio === 'undefined') return;
    const audio = new window.Audio(new URL('audio/sfx/budget-alarm.mp3', document.baseURI).href);
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.load();
    this.budgetAlarmAudio = audio;
  }

  private playBudgetAlarm(): void {
    const audio = this.budgetAlarmAudio;
    if (audio !== null) {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = 0.72;
      void audio.play().catch(() => this.playSynthesizedBudgetAlarm());
      return;
    }
    this.playSynthesizedBudgetAlarm();
  }

  private playSynthesizedBudgetAlarm(): void {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextConstructor === undefined) return;
    const context = new AudioContextConstructor();
    const scheduleAlarm = (): void => {
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.13, context.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.34);
      gain.connect(context.destination);
      [0, 0.18].forEach((delay) => {
        const oscillator = context.createOscillator();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(880, context.currentTime + delay);
        oscillator.frequency.exponentialRampToValueAtTime(520, context.currentTime + delay + 0.12);
        oscillator.connect(gain);
        oscillator.start(context.currentTime + delay);
        oscillator.stop(context.currentTime + delay + 0.14);
        if (delay > 0) oscillator.addEventListener('ended', () => void context.close());
      });
    };
    if (context.state === 'suspended') {
      void context
        .resume()
        .then(scheduleAlarm)
        .catch(() => void context.close());
    } else {
      scheduleAlarm();
    }
  }

  private stepTextStyle(active: boolean): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: active ? '#f0c95a' : '#617b86',
      fontStyle: 'bold',
    };
  }

  private sharpenVisibleText(): void {
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    const sharpen = (object: Phaser.GameObjects.GameObject): void => {
      if (object instanceof Phaser.GameObjects.Text) object.setResolution(resolution);
      if (object instanceof Phaser.GameObjects.Container) object.list.forEach(sharpen);
    };
    this.children.list.forEach(sharpen);
  }

  private format(key: string, replacements: Readonly<Record<string, string>>): string {
    return Object.entries(replacements).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      i18n.t(key),
    );
  }
}
