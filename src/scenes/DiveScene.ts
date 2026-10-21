import Phaser from 'phaser';
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  Palette,
  SEABED_TOP,
  SceneKeys,
  WATER_SURFACE_Y,
} from '../config/constants';
import { eventBus, type GameEventMap } from '../events/EventBus';
import { i18n } from '../i18n/LocaleService';
import { gameState } from '../state/GameState';
import { InputManager } from '../input/InputManager';
import { inputPrompt } from '../input/ControlScheme';
import { DebugOverlay } from '../debug/DebugOverlay';
import { Diver } from '../entities/Diver';
import { DiveMapView } from '../entities/DiveMapView';
import { Atmosphere } from '../graphics/Atmosphere';
import { OxygenSystem } from '../systems/OxygenSystem';
import { NormalGameplayHUD } from '../ui/NormalGameplayHUD';
import { TutorialOverlay } from '../ui/TutorialOverlay';
import { HelpButton } from '../ui/HelpButton';
import { FoodWebPuzzle, type FoodWebZoneId } from '../ui/FoodWebPuzzle';
import { createResearchSurface, ResearchButton } from '../ui/ResearchUi';
import {
  ensureEdgeTransparentTexture,
  ensureNormalizedTextureSequence,
} from '../graphics/TextureFactory';
import { saveService } from '../services/SaveService';
import { narrationService, type NarrationCueId } from '../services/NarrationService';
import {
  currentPhotoKeyForStation,
  getCreatureFramePlan,
  historicalPhotoKeyForStation,
} from './OpeningModel';
import {
  DIVE_FIELD_TASK_COUNT,
  getDiveFieldTask,
  getRequiredSpeciesForStation,
  getTaskIndexForStation,
  REQUIRED_DIVE_SPECIES_IDS,
} from '../ui/DiveTaskModel';
import type { DiveMap, Mission } from '../types';

const EDGE_MARGIN = 70;
const VESSEL = { x: 650, y: WATER_SURFACE_Y };
const DIVER_START = { x: VESSEL.x, y: WATER_SURFACE_Y + 170 };
const REQUIRED_STATION_PHOTOS = 3;
const DIRECT_DRAG_PICKUP_RADIUS = 150;

interface ViewfinderPhotoSpec {
  readonly speciesId: string;
  readonly key: string;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly target?: boolean;
  readonly grounded?: boolean;
}

interface ViewfinderFocusPhoto {
  readonly image: Phaser.GameObjects.Image;
  readonly speciesId: string;
  x: number;
  y: number;
  readonly originX: number;
  readonly originY: number;
  readonly imageBaseX: number;
  readonly imageBaseY: number;
  floatTime: number;
  readonly floatPhase: number;
  readonly floatSpeed: number;
  readonly floatWidth: number;
  readonly floatHeight: number;
  readonly swayAngle: number;
  readonly grounded: boolean;
  readonly isTarget: boolean;
  readonly frameKeys: readonly string[];
  readonly frameDurationMs: number;
  frameElapsedMs: number;
  frameIndex: number;
}
/**
 * Chapter 1 vertical slice: a calm, evidence-first field survey.
 *
 * The scene deliberately avoids capture, combat and character systems. The
 * player observes, records and returns with qualified evidence.
 */
export class DiveScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private diver!: Diver;
  private mapView: DiveMapView | null = null;
  private atmosphere!: Atmosphere;
  private oxygen!: OxygenSystem;
  private bounds!: Phaser.Geom.Rectangle;
  private debugOverlay: DebugOverlay | null = null;
  private safeReturnShown = false;
  private paused = false;
  private oxygenNoticeLevel = 0;
  private briefingOpen = false;
  private reportOpen = false;
  private viewfinderOpen = false;
  private viewfinderKey: Phaser.Input.Keyboard.Key | null = null;
  private observationReviewKey: Phaser.Input.Keyboard.Key | null = null;
  private fieldTaskIndex = 0;
  private viewfinderTarget:
    | { kind: 'station'; id: string; displayName: string; distance: number }
    | {
        kind: 'subject';
        id: string;
        stationId: string;
        speciesId: string;
        displayName: string;
        distance: number;
      }
    | null = null;
  private viewfinderObjects: Phaser.GameObjects.GameObject[] = [];
  private viewfinderFocusPhotos: ViewfinderFocusPhoto[] = [];
  private viewfinderCrosshair: Phaser.GameObjects.Arc | null = null;
  private viewfinderCrosshairLines: Phaser.GameObjects.Graphics | null = null;
  private viewfinderTargetLabel: Phaser.GameObjects.Text | null = null;
  private viewfinderQualityText: Phaser.GameObjects.Text | null = null;
  private viewfinderAimX = 0;
  private viewfinderAimY = 0;
  private viewfinderAimOrigin = { x: 0, y: 0 };
  private viewfinderAimBounds = { left: 0, right: 0, top: 0, bottom: 0 };
  private viewfinderTargetLabelOffsetY = 112;
  private readonly observedSpecies = new Set<string>();
  private pendingObservationReview: GameEventMap['subject:discovered'] | null = null;
  private actionWasDown = false;
  private cancelWasDown = false;
  private doReadingTaken = false;
  private deviceNoticeShown = false;
  private mission: Mission | null = null;
  private hud!: NormalGameplayHUD;
  private reviewHintText!: Phaser.GameObjects.Text;
  private vesselRoot!: Phaser.GameObjects.Container;
  private vesselReturnGuide: Phaser.GameObjects.Container | null = null;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private lessonOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private lessonOverlayTimers: Phaser.Time.TimerEvent[] = [];
  private foodWebPuzzle: FoodWebPuzzle | null = null;
  private foodWebNarrationHighlight: Phaser.GameObjects.Rectangle | null = null;
  private foodWebNarrationButton: ResearchButton | null = null;
  private doBridgeNarrationPlayed = false;
  private directDragPointerId: number | null = null;
  private directDragOffset = new Phaser.Math.Vector2();
  private directDragTarget: Phaser.Math.Vector2 | null = null;

  private readonly onDepleted = (payload: GameEventMap['oxygen:depleted']): void => {
    if (this.viewfinderOpen) this.closeViewfinder();
    this.showSafeReturn(payload.missionId);
  };

  private readonly onSubjectDiscovered = (payload: GameEventMap['subject:discovered']): void => {
    const firstDiscovery = !this.observedSpecies.has(payload.speciesId);
    this.observedSpecies.add(payload.speciesId);
    if (this.paused || this.reportOpen || this.viewfinderOpen) return;
    if (firstDiscovery) {
      this.showStatus(
        `${i18n.t('dive.hudSpeciesRecorded')} ${this.observedSpecies.size}/${gameState.getData().species.length}`,
      );
    }
    this.requestObservationReview(payload);
  };

  private readonly onStationDiscovered = (payload: GameEventMap['station:discovered']): void => {
    if (this.paused || this.reportOpen || this.viewfinderOpen) return;
    this.showStatus(`${i18n.t('dive.hudMooringLocated')} ${payload.discovered}/${payload.total}`);
  };

  private readonly onSubjectInfoRequested = (
    payload: GameEventMap['subject:infoRequested'],
  ): void => {
    if (this.paused || this.reportOpen || this.viewfinderOpen) return;
    if (this.observedSpecies.has(payload.speciesId)) {
      this.requestObservationReview(payload);
    } else {
      this.showObservationCard(payload);
    }
  };

  private readonly onEscape = (): void => {
    if (this.viewfinderOpen) {
      this.closeViewfinder();
      return;
    }
    // Report/lesson screens own a multi-step learning flow. Jumping straight
    // to the chapter menu here used to destroy the final-question timer and
    // leave a correct recap screen with no usable way forward.
    if (this.reportOpen || this.briefingOpen || this.lessonOverlayObjects.length > 0) return;
    this.scene.start(SceneKeys.Menu);
  };

  private readonly onDirectDragStart = (pointer: Phaser.Input.Pointer): void => {
    if (
      !this.inputManager.usesTouchControls() ||
      this.paused ||
      this.reportOpen ||
      this.viewfinderOpen ||
      this.oxygen.isDepleted ||
      this.directDragPointerId !== null ||
      this.inputManager.isTouchControlPoint(pointer.x, pointer.y)
    ) {
      return;
    }
    const position = this.diver.getPosition();
    if (
      Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, position.x, position.y) >
      DIRECT_DRAG_PICKUP_RADIUS
    ) {
      return;
    }
    this.directDragPointerId = pointer.id;
    this.directDragOffset.set(position.x - pointer.worldX, position.y - pointer.worldY);
    this.directDragTarget = new Phaser.Math.Vector2(position.x, position.y);
    this.diver.stopMovement();
  };

  private readonly onDirectDragMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.directDragPointerId) return;
    this.directDragTarget = new Phaser.Math.Vector2(
      pointer.worldX + this.directDragOffset.x,
      pointer.worldY + this.directDragOffset.y,
    );
  };

  private readonly onDirectDragEnd = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.directDragPointerId) return;
    this.directDragPointerId = null;
    this.directDragTarget = null;
    this.diver.stopMovement();
  };

  constructor() {
    super(SceneKeys.Dive);
  }

  create(): void {
    this.safeReturnShown = false;
    this.paused = false;
    this.oxygenNoticeLevel = 0;
    this.briefingOpen = false;
    this.reportOpen = false;
    this.viewfinderOpen = false;
    this.viewfinderObjects = [];
    this.viewfinderFocusPhotos = [];
    this.viewfinderTarget = null;
    this.doReadingTaken = false;
    this.deviceNoticeShown = false;
    this.actionWasDown = false;
    this.fieldTaskIndex = 0;
    this.observedSpecies.clear();
    this.pendingObservationReview = null;
    this.doBridgeNarrationPlayed = false;
    this.directDragPointerId = null;
    this.directDragTarget = null;
    this.directDragOffset.set(0, 0);
    narrationService.preload([
      'dive-mission-brief',
      'report-today-gallery',
      'report-compare-1',
      'report-compare-2',
      'report-food-lesson',
      'report-food-chain-v2',
      'report-fish-gills-question-v3',
      'report-do-bridge',
      'report-recap-1',
      'report-recap-2',
      'report-recap-3',
      'report-recap-4-v2',
      'feedback-correct-v2',
      'feedback-try-again',
    ]);
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Dive });
    this.atmosphere = new Atmosphere(this, { showSurface: true });
    this.bounds = new Phaser.Geom.Rectangle(
      EDGE_MARGIN,
      WATER_SURFACE_Y + 24,
      GAME_WIDTH - EDGE_MARGIN * 2,
      SEABED_TOP - 28 - (WATER_SURFACE_Y + 24),
    );

    this.mission = this.selectMission();
    const map = this.selectDiveMap(this.mission);
    this.createVessel();

    if (map !== null) {
      const locale = i18n.getLocale();
      const labels = new Map(
        gameState
          .getData()
          .species.map((species) => [
            species.id,
            locale === 'en' ? species.nameEn : species.nameZh,
          ]),
      );
      this.mapView = new DiveMapView(this, map, labels);
      this.syncGuidedTarget();
    }

    this.diver = new Diver(this, DIVER_START.x, DIVER_START.y);
    const budget =
      this.mission !== null && this.mission.oxygenBudget > 0 ? this.mission.oxygenBudget : 100;
    this.oxygen = new OxygenSystem(this.mission?.id ?? 'unknown', budget);

    this.inputManager = new InputManager(this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDirectDragStart);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onDirectDragMove);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onDirectDragEnd);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onDirectDragEnd);
    this.viewfinderKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) ?? null;
    this.observationReviewKey =
      this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.I) ?? null;
    this.createHud();
    this.oxygen.start();
    if (gameState.debugMode) this.debugOverlay = new DebugOverlay(this);

    new HelpButton(this, () => this.openTutorial(false));
    eventBus.on('oxygen:depleted', this.onDepleted);
    eventBus.on('station:discovered', this.onStationDiscovered);
    eventBus.on('subject:discovered', this.onSubjectDiscovered);
    eventBus.on('subject:infoRequested', this.onSubjectInfoRequested);
    this.input.keyboard?.on('keydown-ESC', this.onEscape, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);

    const debugScreenRequested =
      gameState.debugMode && map !== null ? this.applyDebugScreenRequest(map) : false;

    // The controls briefing is the final beat of the opening sequence. Show it
    // every time Chapter 1 is deliberately started so saved progress never
    // causes the player to miss the actual instructions.
    if (gameState.selectedChapter === 1 && !debugScreenRequested) this.showMissionBriefing();
    this.sharpenVisibleText();
  }

  override update(_time: number, delta: number): void {
    this.inputManager.setTouchControlsVisible(!this.paused && !this.reportOpen);
    this.inputManager.setTouchCancelVisible(this.viewfinderOpen);
    if (this.viewfinderOpen) this.inputManager.setTouchActionLabel(i18n.t('touch.shutter'));

    if (
      this.observationReviewKey !== null &&
      Phaser.Input.Keyboard.JustDown(this.observationReviewKey)
    ) {
      if (
        !this.paused &&
        !this.reportOpen &&
        !this.viewfinderOpen &&
        this.pendingObservationReview !== null
      ) {
        const payload = this.pendingObservationReview;
        this.pendingObservationReview = null;
        this.clearObservationReviewHint();
        this.showObservationCard(payload);
      }
      return;
    }
    if (
      !this.viewfinderOpen &&
      this.viewfinderKey !== null &&
      Phaser.Input.Keyboard.JustDown(this.viewfinderKey) &&
      !this.paused &&
      !this.reportOpen
    ) {
      const task = getDiveFieldTask(this.fieldTaskIndex);
      if (task?.kind === 'station') {
        this.openViewfinder();
        return;
      }
    }
    if (this.paused || this.reportOpen) return;

    const input = this.inputManager.getState();
    if (this.viewfinderOpen) {
      if (input.cancel && !this.cancelWasDown) {
        this.closeViewfinder();
        this.actionWasDown = input.action;
        this.cancelWasDown = input.cancel;
        return;
      }
      if (!this.oxygen.isDepleted) {
        // The viewfinder owns WASD / arrows. Do not let residual diver
        // velocity resume when the camera mode closes.
        this.diver.stopMovement();
        this.updateViewfinderFish(delta);
        this.updateViewfinderAim(input, delta);
        this.oxygen.update(delta, false);
        this.updateOxygenGuidance();
        if (input.action && !this.actionWasDown) this.captureViewfinder();
      }
      this.actionWasDown = input.action;
      this.cancelWasDown = input.cancel;
      return;
    }

    if (!this.oxygen.isDepleted) {
      let draggedThisFrame = false;
      if (this.directDragPointerId !== null) {
        const target = this.directDragTarget;
        this.directDragTarget = null;
        if (target !== null) {
          const before = this.diver.getPosition();
          this.diver.setPosition(
            Phaser.Math.Clamp(target.x, this.bounds.left, this.bounds.right),
            Phaser.Math.Clamp(target.y, this.bounds.top, this.bounds.bottom),
          );
          const after = this.diver.getPosition();
          draggedThisFrame =
            Phaser.Math.Distance.Between(before.x, before.y, after.x, after.y) > 0.5;
        }
      } else {
        this.diver.update(delta, input, this.bounds);
      }
      this.oxygen.update(delta, draggedThisFrame || this.diver.isMoving);
      this.updateOxygenGuidance();
      const pos = this.diver.getPosition();
      this.mapView?.update(pos.x, pos.y);
      this.updateAutomaticSurveyUnit(pos.x, pos.y);

      if (input.action && !this.actionWasDown) this.handleAction(pos.x, pos.y);
      this.updateHud(pos.x, pos.y);
    }
    this.actionWasDown = input.action;
    this.cancelWasDown = input.cancel;
    this.debugOverlay?.update();
  }

  private createHud(): void {
    this.hud = new NormalGameplayHUD(this);

    this.reviewHintText = this.add
      .text(GAME_WIDTH - EDGE_MARGIN, 126, '', {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#f0c95a',
        backgroundColor: '#062838cc',
        padding: { x: 14, y: 8 },
        align: 'right',
        wordWrap: { width: 470, useAdvancedWrap: true },
      })
      .setOrigin(1, 0)
      .setVisible(false)
      .setDepth(1100);
    this.updateHud(DIVER_START.x, DIVER_START.y);
  }

  /**
   * Opt-in visual QA routes. They are inert in normal play and let local
   * reviewers open a specific canvas-only screen without consuming a tank of
   * oxygen to swim there first (for example `?debug=1&screen=viewfinder2`).
   */
  private applyDebugScreenRequest(map: DiveMap): boolean {
    const requested = new URLSearchParams(window.location.search).get('screen');
    if (requested === 'dive') return true;
    if (requested === 'briefing') {
      this.time.delayedCall(80, () => this.showMissionBriefing());
      return true;
    }
    if (requested === 'recap') {
      this.paused = true;
      this.reportOpen = true;
      this.time.delayedCall(180, () => this.showChapter1Recap());
      return true;
    }
    if (['report', 'food-chain', 'food-lesson', 'fish-oxygen', 'do'].includes(requested ?? '')) {
      this.time.delayedCall(120, () => {
        this.completeChapter1();
        if (requested === 'report' && this.registry.get('__legacyComparison') === true) {
          this.time.delayedCall(80, () => this.showPastPresentComparison());
        }
        if (requested === 'food-chain') {
          this.time.delayedCall(80, () => {
            this.destroyLessonOverlay();
            this.setReportOverlayVisible(true);
          });
        }
        if (requested === 'food-lesson') {
          this.time.delayedCall(80, () => this.showFoodChainLesson());
        }
        if (requested === 'fish-oxygen') this.time.delayedCall(80, () => this.showDoQuestion());
        if (requested === 'do') {
          this.time.delayedCall(80, () => {
            this.setReportOverlayVisible(false);
            this.showDoBridge();
          });
        }
      });
      return true;
    }
    const subjectMatch = /^subject-viewfinder([123])$/.exec(requested ?? '');
    if (subjectMatch !== null) {
      const station = map.cameraStations[Number(subjectMatch[1]) - 1];
      if (station === undefined) return false;
      const speciesId = getRequiredSpeciesForStation(station.id);
      const subject = map.subjects.find((candidate) => candidate.speciesId === speciesId);
      if (speciesId === null || subject === undefined) return false;
      const taskIndex = getTaskIndexForStation(station.id);
      if (taskIndex >= 0) {
        this.fieldTaskIndex = taskIndex + 1;
        this.syncGuidedTarget();
      }
      this.diver.setPosition(subject.x - 48, subject.y);
      this.mapView?.update(subject.x - 48, subject.y);
      this.time.delayedCall(120, () => this.openSubjectViewfinder(station.id, speciesId));
      return true;
    }
    const match = /^viewfinder([123])$/.exec(requested ?? '');
    if (match === null) return false;
    const station = map.cameraStations[Number(match[1]) - 1];
    if (station === undefined) return false;
    const taskIndex = getTaskIndexForStation(station.id);
    if (taskIndex >= 0) {
      this.fieldTaskIndex = taskIndex;
      this.syncGuidedTarget();
    }
    this.diver.setPosition(station.x - 72, station.y);
    this.mapView?.update(station.x - 72, station.y);
    this.time.delayedCall(120, () => this.openViewfinder());
    return true;
  }

  private createVessel(): void {
    this.vesselRoot = this.add.container(VESSEL.x, VESSEL.y).setDepth(7);
    this.vesselRoot.add(this.add.ellipse(0, 5, 296, 12, 0x04121f, 0.22));
    if (this.textures.exists('chapter1-research-vessel')) {
      this.vesselRoot.add(
        this.add
          .image(0, 0, 'chapter1-research-vessel')
          .setCrop(39, 112, 1474, 724)
          .setDisplaySize(300, 147)
          .setPosition(0, -74)
          .setAlpha(0.98),
      );
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x102f43, 1);
      g.fillRoundedRect(-88, -20, 176, 36, 15);
      g.fillStyle(0x3fd0c9, 0.95);
      g.fillRoundedRect(-56, -47, 74, 30, 8);
      g.fillStyle(0xe6f7ff, 0.9);
      g.fillRect(-44, -39, 18, 12);
      g.fillRect(-20, -39, 18, 12);
      g.lineStyle(5, 0xf0c95a, 1);
      g.lineBetween(40, -20, 40, -76);
      g.lineBetween(40, -76, 70, -76);
      g.fillStyle(0xf0c95a, 1);
      g.fillCircle(70, -76, 6);
      this.vesselRoot.add(g);
    }
    this.vesselRoot.add(
      this.add
        .text(0, 10, i18n.t('dive.vessel'), {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: Palette.textLight,
          backgroundColor: '#04121fcc',
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5, 0),
    );
    // Keep the return target below the HUD. Its centre remains inside the
    // vessel interaction radius, so the highlighted docking area is truthful
    // while the vessel itself can stay in its natural surface position.
    const guideRing = this.add
      .ellipse(0, 0, 260, 100, 0xf0c95a, 0.045)
      .setStrokeStyle(3, 0xf0c95a, 0.58);
    const guideArrow = this.add
      .text(0, -64, '▲', {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#f0c95a',
      })
      .setOrigin(0.5);
    const guideLabel = this.add
      .text(0, 32, i18n.t('dive.guidanceTaskReturn'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#fff3a8',
        fontStyle: 'bold',
        backgroundColor: '#062838dd',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5);
    this.vesselReturnGuide = this.add
      .container(VESSEL.x, VESSEL.y + 128, [guideRing, guideArrow, guideLabel])
      .setDepth(6)
      .setVisible(false);
    this.tweens.add({
      targets: [guideRing, guideArrow, guideLabel],
      alpha: { from: 0.35, to: 0.9 },
      scale: { from: 0.96, to: 1.04 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private handleAction(x: number, y: number): void {
    if (this.mapView === null) return;
    const task = getDiveFieldTask(this.fieldTaskIndex);

    if (task?.kind === 'station') {
      if (this.mapView.getNearestPhotographableStation(x, y, task.stationId) !== null) {
        this.openViewfinder();
        return;
      }
    }

    if (task?.kind === 'subject') {
      const interaction = this.mapView.tryPhotographSubject(x, y, task.speciesId);
      if (interaction !== null) {
        const species = this.getSpeciesLabel(task.speciesId);
        this.cameras.main.flash(120, 255, 255, 255);
        this.playShutterSound();
        this.advanceFieldTask();
        this.showStatus(i18n.t('dive.guidanceSubjectComplete').replace('{species}', species));
        return;
      }
      if (this.mapView.hasNearbyPhotographableSubject(x, y)) {
        this.showStatus(
          i18n
            .t('dive.guidanceWrongSubject')
            .replace('{species}', this.getSpeciesLabel(task.speciesId)),
        );
        return;
      }
    }

    if (this.isNearVessel(x, y)) {
      if (this.isReadyToReturn()) this.completeChapter1();
      else this.showStatus(i18n.t('dive.returnIncomplete'));
      return;
    }

    this.showStatus(i18n.t('dive.observeHint'));
  }

  /** One-page mission handoff shown immediately after the opening sequence. */
  private showMissionBriefing(): void {
    this.briefingOpen = true;
    this.paused = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.8)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive();
    const panel = createResearchSurface(this, cx, cy, 1410, 620, {
      depth: 3001,
      fill: Palette.modal,
      border: Palette.accentSoft,
      borderAlpha: 0.64,
      radius: 30,
      shadow: true,
      goldRail: true,
    });
    const eyebrow = this.add
      .text(420, 250, i18n.t('dive.briefingEyebrow'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setDepth(3003);
    const title = this.add
      .text(cx, 330, i18n.t('dive.missionBriefTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '43px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(3003);
    const narrationHighlight = this.add
      .rectangle(cx, 475, 1180, 170, 0xf0c95a, 0.02)
      .setStrokeStyle(4, Palette.gold, 0.88)
      .setDepth(3002)
      .setVisible(false);
    const body = this.add
      .text(cx, 475, i18n.t('dive.missionBriefBody'), {
        fontFamily: 'sans-serif',
        fontSize: '30px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 10,
        wordWrap: { width: 1060, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3003);
    const progress = this.add
      .text(cx, 610, i18n.t('dive.missionBriefProgress'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(3003);
    const start = new ResearchButton(this, cx, 735, 430, 72, i18n.t('dive.startSurvey'), {
      tone: 'primary',
      fontSize: 25,
      depth: 3004,
    });
    start.onPress(() => {
      this.destroyOverlay();
      this.briefingOpen = false;
      this.paused = false;
      this.showStatus(i18n.t('dive.demoFirstStep'));
      if (!gameState.tutorialSeen) {
        gameState.tutorialSeen = true;
        saveService.save(gameState.toSave());
      }
    });
    const voiceButton = new ResearchButton(
      this,
      1440,
      735,
      300,
      64,
      i18n.t('report.aiVoiceReplay'),
      { tone: 'secondary', fontSize: 20, depth: 3004 },
    );
    this.overlayObjects = [
      dim,
      panel,
      eyebrow,
      title,
      narrationHighlight,
      body,
      progress,
      start.root,
      voiceButton.root,
    ];
    const playBriefingNarration = (automatic = false): void => {
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
      const accepted = this.playNarrationCue('dive-mission-brief', narrationHighlight, {
        automatic,
        hideHighlightWhenIdle: true,
        onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
        onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
      });
      if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
    };
    voiceButton.onPress(() => playBriefingNarration(false));
    playBriefingNarration(true);
  }

  /**
   * The diver's survey unit logs environmental context automatically. This
   * keeps the player focused on choosing photographic evidence rather than
   * swapping instruments for every observation.
   */
  private updateAutomaticSurveyUnit(x: number, y: number): void {
    if (this.mapView?.hasNearbyStation(x, y) !== true || this.doReadingTaken) return;

    this.doReadingTaken = true;
    if (!this.deviceNoticeShown) {
      this.deviceNoticeShown = true;
      this.showStatus(i18n.t('dive.deviceReadingSaved'));
    }
  }

  private updateHud(diverX: number, diverY: number): void {
    const task = getDiveFieldTask(this.fieldTaskIndex);
    const touchControls = this.inputManager.usesTouchControls();
    const showEnglishControls = i18n.getLocale() === 'en';
    let taskLabel = i18n.t('dive.guidanceTaskReturn');
    let actionKey = touchControls ? i18n.t('touch.joystickShort') : 'WASD';
    let actionEnglish = showEnglishControls ? 'MOVE' : '';
    let actionLabel = inputPrompt(this, 'dive.guidanceActionMoveDetailed');
    let touchActionLabel = i18n.t('touch.action');
    let targetTextureKey: string | null = null;
    let targetLabel: string | null = null;

    if (task?.kind === 'station') {
      const location = i18n.t(`dive.station${task.stationNumber}`);
      const nearby =
        this.mapView?.getNearestPhotographableStation(diverX, diverY, task.stationId) !== null;
      taskLabel = i18n
        .t(nearby ? 'dive.guidanceTaskPhotographStation' : 'dive.guidanceTaskTravelStation')
        .replace('{location}', location);
      actionKey = nearby
        ? touchControls
          ? i18n.t('touch.actionShort')
          : 'SPACE'
        : touchControls
          ? i18n.t('touch.joystickShort')
          : 'WASD';
      actionEnglish = showEnglishControls ? (nearby ? 'OPEN VIEWFINDER' : 'MOVE') : '';
      actionLabel = inputPrompt(
        this,
        nearby ? 'dive.guidanceActionOpenViewfinder' : 'dive.guidanceActionMoveDetailed',
      );
      touchActionLabel = nearby ? i18n.t('touch.viewfinder') : i18n.t('touch.action');
    } else if (task?.kind === 'subject') {
      const species = this.getSpeciesLabel(task.speciesId);
      const location = i18n.t(`dive.station${task.stationNumber}`);
      const nearby =
        this.mapView?.getNearestPhotographableSubject(diverX, diverY, task.speciesId) !== null;
      taskLabel = i18n
        .t(nearby ? 'dive.guidanceTaskPhotographSubject' : 'dive.guidanceTaskFindSubject')
        .replace('{location}', location)
        .replace('{species}', species);
      actionKey = nearby
        ? touchControls
          ? i18n.t('touch.actionShort')
          : 'SPACE'
        : touchControls
          ? i18n.t('touch.joystickShort')
          : 'WASD';
      actionEnglish = showEnglishControls ? (nearby ? 'TAKE PHOTO' : 'MOVE') : '';
      actionLabel = inputPrompt(
        this,
        nearby ? 'dive.guidanceActionPhotograph' : 'dive.guidanceActionMoveDetailed',
      );
      touchActionLabel = nearby ? i18n.t('touch.photo') : i18n.t('touch.action');
      targetTextureKey = this.getReportSpeciesTextureKey(task.speciesId);
      targetLabel = `${i18n.t('dive.guidanceTarget')}\n${species}`;
    } else if (this.isNearVessel(diverX, diverY)) {
      actionKey = touchControls ? i18n.t('touch.actionShort') : 'SPACE';
      actionEnglish = showEnglishControls ? 'FINISH' : '';
      actionLabel = inputPrompt(this, 'dive.guidanceActionFinish');
      touchActionLabel = i18n.t('touch.finish');
    }

    this.inputManager.setTouchActionLabel(touchActionLabel);

    this.hud.update({
      completedTaskCount: this.fieldTaskIndex,
      totalTaskCount: DIVE_FIELD_TASK_COUNT,
      taskLabel,
      actionKey,
      actionEnglish,
      actionLabel,
      touchControls,
      targetTextureKey,
      targetLabel,
    });
    this.vesselReturnGuide?.setVisible(task === null);
  }

  private isReadyToReturn(): boolean {
    return (
      this.fieldTaskIndex >= DIVE_FIELD_TASK_COUNT &&
      (this.mapView?.stationPhotoCount ?? 0) >= REQUIRED_STATION_PHOTOS &&
      REQUIRED_DIVE_SPECIES_IDS.every(
        (speciesId) => this.mapView?.hasPhotographedSpecies([speciesId]) === true,
      ) &&
      this.doReadingTaken
    );
  }

  private advanceFieldTask(): void {
    this.fieldTaskIndex = Math.min(this.fieldTaskIndex + 1, DIVE_FIELD_TASK_COUNT);
    this.syncGuidedTarget();
    // Refresh the persistent task card in the same frame as the completed
    // photo. Otherwise the player briefly keeps seeing the old station task
    // while the newly guided organism is already active in the world.
    const position = this.diver.getPosition();
    this.updateHud(position.x, position.y);
  }

  private syncGuidedTarget(): void {
    const task = getDiveFieldTask(this.fieldTaskIndex);
    if (task?.kind === 'station') {
      this.mapView?.setGuidedTarget({ kind: 'station', stationId: task.stationId });
      return;
    }
    if (task?.kind === 'subject') {
      this.mapView?.setGuidedTarget({ kind: 'subject', speciesId: task.speciesId });
      return;
    }
    this.mapView?.setGuidedTarget(null);
  }

  private isNearVessel(x: number, y: number): boolean {
    return Phaser.Math.Distance.Between(x, y, VESSEL.x, VESSEL.y) <= 150;
  }

  /** Legacy manual briefing retained only for compatibility; OpeningScene is automatic. */
  public showBriefing(): void {
    this.briefingOpen = true;
    this.paused = true;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelWidth = 1420;
    const panelHeight = 760;
    const top = cy - panelHeight / 2;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.76)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive();
    const panel = this.add
      .rectangle(cx, cy, panelWidth, panelHeight, 0x0a2a43, 0.98)
      .setStrokeStyle(3, Palette.accent)
      .setDepth(3001);
    const left = cx - panelWidth / 2 + 58;
    let page = 0;
    let pageObjects: Phaser.GameObjects.GameObject[] = [];

    const finish = (): void => {
      this.destroyOverlay();
      this.briefingOpen = false;
      this.paused = false;
      this.showStatus(i18n.t('dive.demoFirstStep'));
      if (!gameState.tutorialSeen) {
        gameState.tutorialSeen = true;
        saveService.save(gameState.toSave());
      }
    };

    const makeButton = (
      x: number,
      y: number,
      label: string,
      active = false,
    ): Phaser.GameObjects.Text =>
      this.add
        .text(x, y, label, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: Palette.textLight,
          backgroundColor: active ? '#1c7a74' : '#123c50',
          padding: { x: 26, y: 13 },
          fontStyle: active ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setDepth(3002)
        .setInteractive({ useHandCursor: true });

    const renderPage = (): void => {
      for (const object of pageObjects) object.destroy();
      pageObjects = [];

      const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        pageObjects.push(object);
        return object;
      };
      const eyebrow = add(
        this.add
          .text(
            left,
            top + 38,
            `${i18n.t('dive.briefingEyebrow')} · ${i18n.t('dive.openingPage')} ${page + 1}/3`,
            {
              fontFamily: 'sans-serif',
              fontSize: '21px',
              color: Palette.accentText,
              fontStyle: 'bold',
            },
          )
          .setDepth(3002),
      );
      void eyebrow;

      if (page === 0) {
        add(
          this.add
            .text(cx, top + 94, i18n.t('dive.briefingTitle'), {
              fontFamily: 'sans-serif',
              fontSize: '44px',
              color: Palette.textLight,
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: 1180, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(cx, top + 170, i18n.t('dive.briefingBody'), {
              fontFamily: 'sans-serif',
              fontSize: '25px',
              color: Palette.textLight,
              align: 'center',
              lineSpacing: 8,
              wordWrap: { width: 1120, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        const cardY = top + 410;
        const cardWidth = 500;
        const cardHeight = 300;
        const oldX = cx - 310;
        const todayX = cx + 310;
        add(
          this.add
            .rectangle(oldX, cardY, cardWidth, cardHeight, 0x123c50, 1)
            .setStrokeStyle(3, 0xf0c95a, 0.82)
            .setDepth(3001),
        );
        add(
          this.add
            .rectangle(todayX, cardY, cardWidth, cardHeight, 0x123c50, 1)
            .setStrokeStyle(3, 0x3fd0c9, 0.82)
            .setDepth(3001),
        );
        const oldPhotoKey = historicalPhotoKeyForStation('station-1');
        if (oldPhotoKey !== null) {
          const oldPhoto = this.addHistoricalPhoto(oldPhotoKey, oldX, cardY - 10, 430, 190, 3002);
          if (oldPhoto !== null) add(oldPhoto);
        }
        add(
          this.add
            .text(oldX, cardY - 122, i18n.t('dive.storyThen'), {
              fontFamily: 'sans-serif',
              fontSize: '23px',
              color: '#ffe58a',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
        add(
          this.add
            .text(oldX, cardY + 122, i18n.t('dive.storyThenBody'), {
              fontFamily: 'sans-serif',
              fontSize: '20px',
              color: Palette.textLight,
              align: 'center',
              wordWrap: { width: 430, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY - 122, i18n.t('dive.storyToday'), {
              fontFamily: 'sans-serif',
              fontSize: '23px',
              color: '#9cf7ef',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY - 15, '?', {
              fontFamily: 'sans-serif',
              fontSize: '108px',
              color: '#9cf7ef',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY + 116, i18n.t('dive.storyTodayBody'), {
              fontFamily: 'sans-serif',
              fontSize: '20px',
              color: Palette.textLight,
              align: 'center',
              wordWrap: { width: 430, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
        add(
          this.add
            .text(cx, top + 600, i18n.t('dive.briefingQuestion'), {
              fontFamily: 'sans-serif',
              fontSize: '22px',
              color: Palette.accentText,
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: 1120, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3003),
        );
      } else if (page === 1) {
        add(
          this.add
            .text(left, top + 90, i18n.t('dive.openingToolsTitle'), {
              fontFamily: 'sans-serif',
              fontSize: '40px',
              color: Palette.textLight,
              fontStyle: 'bold',
              wordWrap: { width: 560, useAdvancedWrap: true },
            })
            .setDepth(3002),
        );
        add(
          this.add
            .text(left, top + 220, i18n.t('dive.openingToolsBody'), {
              fontFamily: 'sans-serif',
              fontSize: '23px',
              color: Palette.textLight,
              lineSpacing: 12,
              wordWrap: { width: 560, useAdvancedWrap: true },
            })
            .setDepth(3002),
        );
        const cameraX = 1110;
        const deviceX = 1490;
        const cardY = top + 390;
        add(
          this.add
            .rectangle(cameraX, cardY, 300, 300, 0x123c50, 1)
            .setStrokeStyle(2, 0x3fd0c9, 0.55)
            .setDepth(3001),
        );
        add(
          this.add
            .text(cameraX, cardY - 94, '01', {
              fontFamily: 'sans-serif',
              fontSize: '40px',
              color: Palette.accentText,
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(cameraX, cardY - 35, i18n.t('dive.camera'), {
              fontFamily: 'sans-serif',
              fontSize: '24px',
              color: Palette.textLight,
              fontStyle: 'bold',
              align: 'center',
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(cameraX, cardY + 58, inputPrompt(this, 'dive.stationPhotoPrompt'), {
              fontFamily: 'sans-serif',
              fontSize: '17px',
              color: Palette.textMuted,
              align: 'center',
              lineSpacing: 8,
              wordWrap: { width: 250, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );

        add(
          this.add
            .rectangle(deviceX, cardY, 300, 300, 0x123c50, 1)
            .setStrokeStyle(2, 0x3fd0c9, 0.55)
            .setDepth(3001),
        );
        add(
          this.add
            .text(deviceX, cardY - 94, '02', {
              fontFamily: 'sans-serif',
              fontSize: '40px',
              color: Palette.accentText,
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(deviceX, cardY - 35, i18n.t('dive.deviceCardTitle'), {
              fontFamily: 'sans-serif',
              fontSize: '24px',
              color: Palette.textLight,
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: 260, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(deviceX, cardY + 58, i18n.t('dive.deviceCardBody'), {
              fontFamily: 'sans-serif',
              fontSize: '17px',
              color: Palette.textMuted,
              align: 'center',
              lineSpacing: 8,
              wordWrap: { width: 250, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );

        // A quiet pulse makes the invisible background recorder legible as a
        // real diver-worn instrument, without turning it into another button.
        const pulse = add(
          this.add
            .circle(deviceX, cardY + 8, 42, 0x3fd0c9, 0.08)
            .setStrokeStyle(2, 0x9cf7ef, 0.65)
            .setDepth(3002),
        );
        this.tweens.add({
          targets: pulse,
          scale: 1.65,
          alpha: 0,
          duration: 1800,
          repeat: -1,
          ease: 'Sine.easeOut',
        });
        add(this.add.circle(deviceX, cardY + 8, 13, 0x9cf7ef, 0.9).setDepth(3003));
      } else {
        add(
          this.add
            .text(left, top + 90, i18n.t('dive.openingEvidenceTitle'), {
              fontFamily: 'sans-serif',
              fontSize: '40px',
              color: Palette.textLight,
              fontStyle: 'bold',
              wordWrap: { width: 620, useAdvancedWrap: true },
            })
            .setDepth(3002),
        );
        add(
          this.add
            .text(left, top + 220, i18n.t('dive.openingEvidenceBody'), {
              fontFamily: 'sans-serif',
              fontSize: '23px',
              color: Palette.textLight,
              lineSpacing: 12,
              wordWrap: { width: 620, useAdvancedWrap: true },
            })
            .setDepth(3002),
        );
        add(
          this.add
            .rectangle(cx + 320, top + 360, 620, 310, 0x123c50, 1)
            .setStrokeStyle(2, 0x3fd0c9, 0.6)
            .setDepth(3001),
        );
        add(
          this.add
            .text(cx + 320, top + 240, i18n.t('dive.objectives'), {
              fontFamily: 'sans-serif',
              fontSize: '24px',
              color: Palette.accentText,
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(
              cx + 320,
              top + 372,
              `1  ${inputPrompt(this, 'dive.objectiveStationInstruction')}\n\n2  ${inputPrompt(this, 'dive.objectiveOrganismInstruction')}\n\n3  ${i18n.t('dive.objectiveDoInstruction')}`,
              {
                fontFamily: 'sans-serif',
                fontSize: '19px',
                color: Palette.textLight,
                lineSpacing: 8,
                wordWrap: { width: 540, useAdvancedWrap: true },
              },
            )
            .setOrigin(0.5)
            .setDepth(3002),
        );
        add(
          this.add
            .text(cx, top + 580, i18n.t('dive.openingEvidenceCaution'), {
              fontFamily: 'sans-serif',
              fontSize: '21px',
              color: Palette.accentText,
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: 1050, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002),
        );
      }

      const back = makeButton(left + 90, top + 668, i18n.t('dive.openingBack'));
      back.setVisible(page > 0);
      back.on(Phaser.Input.Events.POINTER_UP, () => {
        if (page > 0) {
          page -= 1;
          renderPage();
        }
      });
      add(back);

      const next = makeButton(
        left + 280,
        top + 668,
        page === 2 ? i18n.t('dive.startSurvey') : i18n.t('dive.openingNext'),
        true,
      );
      next.on(Phaser.Input.Events.POINTER_UP, () => {
        if (page === 2) finish();
        else {
          page += 1;
          renderPage();
        }
      });
      add(next);

      const skip = makeButton(cx + panelWidth / 2 - 118, top + 668, i18n.t('dive.openingSkip'));
      skip.on(Phaser.Input.Events.POINTER_UP, finish);
      add(skip);

      const note = add(
        this.add
          .text(cx, top + 714, i18n.t('dive.briefingNote'), {
            fontFamily: 'sans-serif',
            fontSize: '16px',
            color: Palette.textMuted,
            align: 'center',
            wordWrap: { width: 720, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(3002),
      );
      void note;
      this.overlayObjects = [dim, panel, ...pageObjects];
    };

    renderPage();
  }

  private completeChapter1(): void {
    if (this.reportOpen || this.mission === null) return;
    this.reportOpen = true;
    this.paused = true;
    gameState.markMissionComplete(this.mission.id);
    saveService.save(gameState.toSave());

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelWidth = 1740;
    const panelHeight = 830;
    const top = cy - panelHeight / 2;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.78)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive();
    const panel = createResearchSurface(this, cx, cy, panelWidth, panelHeight, {
      depth: 3001,
      goldRail: true,
    });
    const puzzleSpecies = [
      'blue-damselfish',
      'hardy-goby',
      'reef-grouper',
      'silver-reef-fish',
    ] as const;
    const zoneBySpecies: Readonly<Record<(typeof puzzleSpecies)[number], FoodWebZoneId>> = {
      'blue-damselfish': 'small-fish',
      'hardy-goby': 'small-fish',
      'silver-reef-fish': 'small-fish',
      'reef-grouper': 'predator',
    };
    let foodWebComplete = false;
    let continueButton: Phaser.GameObjects.Text | null = null;
    const unlockContinue = (): void => {
      foodWebComplete = true;
      continueButton
        ?.setText(i18n.t('report.followBreathingClue'))
        .setY(top + 670)
        .setBackgroundColor('#1c7a74')
        .setColor(Palette.textLight);
      if (continueButton !== null) this.pulseTextAction(continueButton);
    };
    this.foodWebPuzzle = new FoodWebPuzzle(this, {
      x: cx,
      y: top + 355,
      width: panelWidth - 80,
      height: 690,
      depth: 3002,
      cards: puzzleSpecies.map((speciesId) => {
        return {
          speciesId,
          label: this.getSpeciesLabel(speciesId),
          textureKey: this.getReportSpeciesTextureKey(speciesId),
          zone: zoneBySpecies[speciesId],
        };
      }),
      copy: {
        title: i18n.t('report.foodWebDragTitle'),
        hint: i18n.t('report.foodWebDragHint'),
        producer: i18n.t('report.foodWebBase'),
        smallFish: i18n.t('report.foodWebSmallFish'),
        predator: i18n.t('report.foodWebLargerFish'),
        seabed: i18n.t('report.foodWebSeabed'),
        tray: i18n.t('report.foodWebTray'),
        progress: i18n.t('report.foodWebProgress'),
        complete: i18n.t('report.foodWebComplete'),
        wrongZone: i18n.t('report.foodWebWrongZone'),
      },
      onComplete: unlockContinue,
    });

    this.foodWebNarrationHighlight = this.add
      .rectangle(650, top + 64, 1040, 116, 0xf0c95a, 0.02)
      .setStrokeStyle(4, Palette.gold, 0.88)
      .setDepth(3005)
      .setVisible(false);
    this.foodWebNarrationButton = new ResearchButton(
      this,
      1580,
      top + 760,
      300,
      64,
      i18n.t('report.aiVoiceReplay'),
      { tone: 'secondary', fontSize: 20, depth: 3006 },
    );

    const button = this.add
      .text(cx, top + 760, i18n.t('report.foodWebLocked'), {
        fontFamily: 'sans-serif',
        fontSize: '29px',
        color: Palette.textLight,
        backgroundColor: '#24404b',
        padding: { x: 44, y: 18 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3002)
      .setInteractive({ useHandCursor: true });
    this.overlayObjects = [
      dim,
      panel,
      button,
      this.foodWebNarrationHighlight,
      this.foodWebNarrationButton.root,
    ];
    continueButton = button;
    this.foodWebNarrationButton.onPress(() => this.playFoodWebNarration(false));
    button.on(Phaser.Input.Events.POINTER_UP, () => {
      if (narrationService.isPlaying()) return;
      if (!foodWebComplete) {
        button.setText(i18n.t('report.foodWebLocked'));
        return;
      }
      this.setReportOverlayVisible(false);
      this.showDoQuestion();
    });
    // The six-card activity is the assessment. First teach the one rule it
    // depends on in a short, hands-on three-card example, then reveal this
    // already-created puzzle underneath it.
    this.setReportOverlayVisible(false);
    this.showPastPresentComparison();
    this.sharpenVisibleText();
  }

  private showPastPresentComparison(): void {
    if (this.registry.get('__legacyComparison') === true) {
      this.showPastPresentComparisonLegacy();
      return;
    }
    const questions = [
      {
        question: 'report.compareQuestion',
        choices: ['report.compareLess', 'report.compareSame'],
        correct: 0,
      },
      {
        question: 'report.compareCauseQuestion',
        choices: ['report.compareNeedEvidence', 'report.compareProvesCause'],
        correct: 0,
      },
    ] as const;
    let page = 0;
    const viewedStations = new Set<string>();
    let galleryContinue: ResearchButton | null = null;
    let galleryProgress: Phaser.GameObjects.Text | null = null;

    const refreshGalleryGate = (): void => {
      const complete = viewedStations.size === 3;
      galleryProgress
        ?.setText(
          i18n.t('report.todayGalleryProgress').replace('{done}', String(viewedStations.size)),
        )
        .setColor(complete ? '#91e6a7' : '#f0c95a');
      galleryContinue?.setEnabled(complete).setTone(complete ? 'primary' : 'locked');
    };

    const render = (): void => {
      this.destroyLessonOverlay();
      const objects: Phaser.GameObjects.GameObject[] = [];
      const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        objects.push(object);
        return object;
      };
      add(
        this.add
          .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.92)
          .setOrigin(0)
          .setDepth(4100)
          .setInteractive(),
      );
      add(
        createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1580, 920, {
          depth: 4101,
          goldRail: true,
        }),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 128, i18n.t('report.todayGalleryTitle'), {
            fontFamily: 'sans-serif',
            fontSize: '46px',
            color: Palette.textLight,
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(4104),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 185, i18n.t('report.todayGallerySubtitle'), {
            fontFamily: 'sans-serif',
            fontSize: '23px',
            color: Palette.accentText,
            align: 'center',
            wordWrap: { width: 1260, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(4104),
      );

      ['station-1', 'station-2', 'station-3'].forEach((stationId, index) => {
        objects.push(
          ...this.createTodayPhotoCard(
            stationId,
            500 + index * 460,
            405,
            410,
            270,
            4102,
            `${index + 1} · ${i18n.t(`dive.station${index + 1}`)}`,
            viewedStations.has(stationId),
            () => {
              viewedStations.add(stationId);
              refreshGalleryGate();
            },
          ),
        );
      });

      const back = new ResearchButton(this, 310, 970, 250, 64, i18n.t('common.backStep'), {
        tone: 'secondary',
        depth: 4105,
      });
      add(back.root);
      back.onPress(() => {
        page = Math.max(0, page - 1);
        render();
      });

      if (page === 0) {
        const narrationHighlight = add(
          this.add
            .rectangle(GAME_WIDTH / 2, 670, 1280, 142, 0xf0c95a, 0.035)
            .setStrokeStyle(4, Palette.gold, 0.88)
            .setDepth(4103)
            .setVisible(false),
        );
        add(
          this.add
            .text(
              GAME_WIDTH / 2,
              640,
              `${i18n.t('common.stepLabel')} ${i18n.t('report.todayGalleryStep')}`,
              {
                fontFamily: 'sans-serif',
                fontSize: '25px',
                color: '#e6fbff',
                fontStyle: 'bold',
                align: 'center',
              },
            )
            .setOrigin(0.5)
            .setDepth(4104),
        );
        add(
          this.add
            .text(
              GAME_WIDTH / 2,
              700,
              `${i18n.t('common.tipLabel')} ${inputPrompt(this, 'report.todayGalleryTip')}`,
              {
                fontFamily: 'sans-serif',
                fontSize: '22px',
                color: Palette.textMuted,
                align: 'center',
                wordWrap: { width: 1160, useAdvancedWrap: true },
              },
            )
            .setOrigin(0.5)
            .setDepth(4104),
        );
        galleryProgress = add(
          this.add
            .text(GAME_WIDTH / 2, 755, '', {
              fontFamily: 'sans-serif',
              fontSize: '22px',
              color: '#f0c95a',
              fontStyle: 'bold',
              align: 'center',
            })
            .setOrigin(0.5)
            .setDepth(4104),
        );
        const next = new ResearchButton(
          this,
          GAME_WIDTH / 2,
          845,
          430,
          72,
          i18n.t('report.todayGalleryContinue'),
          { tone: 'primary', fontSize: 25, depth: 4105 },
        );
        galleryContinue = next;
        add(next.root);
        const voiceButton = new ResearchButton(
          this,
          1510,
          970,
          310,
          64,
          i18n.t('report.aiVoiceReplay'),
          { tone: 'secondary', fontSize: 20, depth: 4105 },
        );
        add(voiceButton.root);
        const playGalleryNarration = (automatic = false): void => {
          voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
          const accepted = this.playNarrationCue('report-today-gallery', narrationHighlight, {
            automatic,
            hideHighlightWhenIdle: true,
            onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
            onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
          });
          if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
        };
        voiceButton.onPress(() => playGalleryNarration(false));
        next.onPress(() => {
          if (viewedStations.size < 3) {
            galleryProgress?.setText(i18n.t('report.todayGalleryNeedAll')).setColor('#ffcf78');
            return;
          }
          page = 1;
          render();
        });
        refreshGalleryGate();
        playGalleryNarration(true);
      } else {
        const current = questions[page - 1] ?? questions[0];
        const questionCue: NarrationCueId = page === 1 ? 'report-compare-1' : 'report-compare-2';
        const narrationHighlight = add(
          this.add
            .rectangle(GAME_WIDTH / 2, 750, 1320, 360, 0xf0c95a, 0.018)
            .setStrokeStyle(4, Palette.gold, 0.82)
            .setDepth(4103)
            .setVisible(false),
        );
        add(
          this.add
            .text(
              GAME_WIDTH / 2,
              640,
              `${i18n.t('common.questionLabel')} ${i18n.t(current.question)}`,
              {
                fontFamily: 'sans-serif',
                fontSize: '34px',
                color: '#e9fbff',
                fontStyle: 'bold',
                align: 'center',
                wordWrap: { width: 1240, useAdvancedWrap: true },
              },
            )
            .setOrigin(0.5)
            .setDepth(4104),
        );
        add(
          this.add
            .text(520, 705, i18n.t('common.optionsLabel'), {
              fontFamily: 'sans-serif',
              fontSize: '29px',
              color: '#f0c95a',
              fontStyle: 'bold',
            })
            .setDepth(4104),
        );
        const feedback = add(
          this.add
            .text(GAME_WIDTH / 2, 915, '', {
              fontFamily: 'sans-serif',
              fontSize: '21px',
              color: '#91e6a7',
              align: 'center',
            })
            .setOrigin(0.5)
            .setDepth(4105),
        );
        const voiceButton = new ResearchButton(
          this,
          1510,
          970,
          310,
          64,
          i18n.t('report.aiVoiceReplay'),
          { tone: 'secondary', fontSize: 20, depth: 4105 },
        );
        add(voiceButton.root);
        const playQuestionNarration = (automatic = false): void => {
          voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
          const accepted = this.playNarrationCue(questionCue, narrationHighlight, {
            automatic,
            hideHighlightWhenIdle: true,
            onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
            onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
          });
          if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
        };
        voiceButton.onPress(() => playQuestionNarration(false));
        current.choices.forEach((choice, choiceIndex) => {
          const button = new ResearchButton(
            this,
            670 + choiceIndex * 580,
            800,
            530,
            110,
            `${choiceIndex === 0 ? 'A' : 'B'}. ${i18n.t(choice)}`,
            { tone: 'secondary', fontSize: 27, lineSpacing: 6, depth: 4105 },
          );
          add(button.root);
          button.onPress(() => {
            const correct = choiceIndex === current.correct;
            button.setTone(correct ? 'primary' : 'danger');
            feedback.setText(i18n.t(correct ? 'report.compareCorrect' : 'report.compareTryAgain'));
            this.playNarrationCue(
              correct ? 'feedback-correct-v2' : 'feedback-try-again',
              button.root,
              { hideHighlightWhenIdle: false },
            );
            if (!correct) return;
            this.time.delayedCall(760, () => {
              if (page >= questions.length) this.showFoodChainLesson();
              else {
                page += 1;
                render();
              }
            });
          });
        });
        playQuestionNarration(true);
      }
      this.lessonOverlayObjects = objects;
      this.sharpenVisibleText();
    };

    render();
  }

  private createTodayPhotoCard(
    stationId: string,
    x: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    title: string,
    alreadyViewed: boolean,
    onViewed: () => void,
  ): Phaser.GameObjects.GameObject[] {
    const todayObjects: Phaser.GameObjects.GameObject[] = [];
    const currentPhotoKey = currentPhotoKeyForStation(stationId);
    const currentPhoto =
      currentPhotoKey === null
        ? null
        : this.addHistoricalPhoto(currentPhotoKey, x, y, width - 18, height - 18, depth + 3);
    if (currentPhoto !== null) {
      todayObjects.push(currentPhoto);
    } else {
      todayObjects.push(
        ...this.createViewfinderEnvironment(
          stationId,
          x - width / 2,
          y - height / 2,
          width,
          height,
          depth,
          false,
        ),
      );
      const scale = 0.42;
      for (const spec of this.getViewfinderPhotos(stationId)) {
        if (!this.textures.exists(spec.key)) continue;
        const image = this.add
          .image(x + spec.offsetX * scale, y + spec.offsetY * scale, spec.key)
          .setDisplaySize(spec.width * scale, spec.height * scale)
          .setDepth(depth + 3);
        if (this.shouldFlipViewfinderSpecies(spec.speciesId)) image.setFlipX(true);
        todayObjects.push(image);
      }
    }
    const objects: Phaser.GameObjects.GameObject[] = [];
    const frame = createResearchSurface(this, x, y, width + 18, height + 18, {
      depth: depth - 1,
      fill: Palette.paper,
      border: Palette.accentSoft,
      borderAlpha: 0.72,
      radius: 18,
      shadow: true,
    });
    objects.push(frame, ...todayObjects);

    const historyKey = historicalPhotoKeyForStation(stationId);
    let historyImage: Phaser.GameObjects.Image | null = null;
    if (historyKey !== null && this.textures.exists(historyKey)) {
      historyImage = this.addHistoricalPhoto(historyKey, x, y, width - 18, height - 18, depth + 3);
      historyImage?.setVisible(false);
      if (historyImage !== null) objects.push(historyImage);
    }

    const eraBadge = this.add
      .text(x + width / 2 - 18, y - height / 2 + 18, i18n.t('report.photoToggleToday'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#1c7a74dd',
        padding: { x: 15, y: 8 },
      })
      .setOrigin(1, 0)
      .setDepth(depth + 5);
    const toggleHint = this.add
      .text(x, y + height / 2 - 16, inputPrompt(this, 'report.photoToggleHint'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#ffffff',
        backgroundColor: '#04121fcc',
        padding: { x: 15, y: 8 },
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 5);
    const hitArea = this.add
      .rectangle(x, y, width, height, 0xffffff, 0.001)
      .setDepth(depth + 6)
      .setInteractive({ useHandCursor: true });
    const viewedBadge = this.add
      .text(x - width / 2 + 18, y - height / 2 + 18, '✓', {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#07251f',
        backgroundColor: '#91e6a7',
        padding: { x: 9, y: 4 },
        fontStyle: 'bold',
      })
      .setDepth(depth + 7)
      .setVisible(alreadyViewed);
    let showingHistory = false;
    let viewed = alreadyViewed;
    hitArea.on(Phaser.Input.Events.POINTER_UP, () => {
      if (historyImage === null) return;
      if (!viewed) {
        viewed = true;
        viewedBadge.setVisible(true);
        onViewed();
      }
      showingHistory = !showingHistory;
      todayObjects.forEach((object) => {
        const visibleObject = object as Phaser.GameObjects.GameObject & {
          setVisible(value: boolean): Phaser.GameObjects.GameObject;
        };
        visibleObject.setVisible(!showingHistory);
      });
      historyImage?.setVisible(showingHistory);
      eraBadge
        .setText(i18n.t(showingHistory ? 'report.photoToggleHistory' : 'report.photoToggleToday'))
        .setBackgroundColor(showingHistory ? '#9a7425dd' : '#1c7a74dd');
    });

    objects.push(
      this.add
        .rectangle(x, y, width, height, 0xffffff, 0)
        .setStrokeStyle(3, 0x75dcd6, 0.75)
        .setDepth(depth + 4),
      this.add
        .text(x, y - height / 2 - 26, title, {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(depth + 4),
      eraBadge,
      toggleHint,
      viewedBadge,
      hitArea,
    );
    return objects;
  }

  private showPastPresentComparisonLegacy(): void {
    const questions = [
      {
        question: 'report.compareQuestion',
        choices: ['report.compareLess', 'report.compareSame'],
        correct: 0,
      },
      {
        question: 'report.compareCauseQuestion',
        choices: ['report.compareNeedEvidence', 'report.compareProvesCause'],
        correct: 0,
      },
    ] as const;
    let page = 0;
    let objects: Phaser.GameObjects.GameObject[] = [];

    const clear = (): void => {
      for (const object of objects) object.destroy();
      objects = [];
    };
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      objects.push(object);
      return object;
    };
    const drawFishGroup = (x: number, y: number, count: number, color: number): void => {
      const graphic = add(this.add.graphics().setDepth(4103));
      for (let index = 0; index < count; index += 1) {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const fishX = x + column * 39 - (Math.min(count, 3) - 1) * 19;
        const fishY = y + row * 30 - (count > 3 ? 13 : 0);
        graphic.fillStyle(color, 0.96);
        graphic.fillEllipse(fishX, fishY, 28, 14);
        graphic.fillTriangle(fishX - 13, fishY, fishX - 24, fishY - 9, fishX - 24, fishY + 9);
        graphic.fillStyle(0x071d2b, 1);
        graphic.fillCircle(fishX + 8, fishY - 2, 1.5);
      }
    };

    const render = (): void => {
      clear();
      const current = questions[page] ?? questions[0];
      add(
        this.add
          .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.9)
          .setOrigin(0)
          .setDepth(4100)
          .setInteractive(),
      );
      add(
        this.add
          .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1540, 900, 0x0a2a43, 0.995)
          .setStrokeStyle(4, Palette.accent)
          .setDepth(4101),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 155, i18n.t('report.compareTitle'), {
            fontFamily: 'sans-serif',
            fontSize: '46px',
            color: Palette.textLight,
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(4102),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 215, i18n.t('report.compareSubtitle'), {
            fontFamily: 'sans-serif',
            fontSize: '23px',
            color: Palette.accentText,
            align: 'center',
            wordWrap: { width: 1160, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(4102),
      );

      [
        { key: 'dive.station1', oldCount: 6, newCount: 2 },
        { key: 'dive.station2', oldCount: 5, newCount: 2 },
        { key: 'dive.station3', oldCount: 4, newCount: 1 },
      ].forEach((station, index) => {
        const x = 520 + index * 440;
        add(
          this.add
            .rectangle(x, 430, 390, 300, 0x10384a, 1)
            .setStrokeStyle(2, index === 0 ? 0xf0c95a : 0x62b7bd, 0.72)
            .setDepth(4101),
        );
        add(
          this.add
            .text(x, 320, `${index + 1} · ${i18n.t(station.key)}`, {
              fontFamily: 'sans-serif',
              fontSize: '23px',
              color: Palette.textLight,
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(4102),
        );
        add(
          this.add
            .text(x - 104, 372, i18n.t('report.compareHistory'), {
              fontFamily: 'sans-serif',
              fontSize: '17px',
              color: '#f0c95a',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(4102),
        );
        add(
          this.add
            .text(x + 104, 372, i18n.t('report.compareToday'), {
              fontFamily: 'sans-serif',
              fontSize: '17px',
              color: '#9cf7ef',
              fontStyle: 'bold',
            })
            .setOrigin(0.5)
            .setDepth(4102),
        );
        drawFishGroup(x - 104, 444, station.oldCount, 0xf0c95a);
        drawFishGroup(x + 104, 444, station.newCount, 0x67d8d1);
        add(
          this.add
            .text(
              x,
              535,
              i18n.t(index === 2 ? 'report.compareSeabedNote' : 'report.compareFishNote'),
              {
                fontFamily: 'sans-serif',
                fontSize: '18px',
                color: Palette.textMuted,
                align: 'center',
                wordWrap: { width: 330, useAdvancedWrap: true },
              },
            )
            .setOrigin(0.5)
            .setDepth(4102),
        );
      });

      add(
        this.add
          .text(GAME_WIDTH / 2, 650, i18n.t(current.question), {
            fontFamily: 'sans-serif',
            fontSize: '34px',
            color: '#e9fbff',
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 1180, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(4102),
      );
      const feedback = add(
        this.add
          .text(GAME_WIDTH / 2, 900, '', {
            fontFamily: 'sans-serif',
            fontSize: '21px',
            color: '#91e6a7',
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(4103),
      );
      current.choices.forEach((choice, choiceIndex) => {
        const button = add(
          this.add
            .text(700 + choiceIndex * 520, 785, i18n.t(choice), {
              fontFamily: 'sans-serif',
              fontSize: '27px',
              color: Palette.textLight,
              backgroundColor: '#123c50',
              padding: { x: 32, y: 20 },
              align: 'center',
              lineSpacing: 6,
              wordWrap: { width: 440, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(4103)
            .setInteractive({ useHandCursor: true }),
        );
        button.on(Phaser.Input.Events.POINTER_UP, () => {
          const correct = choiceIndex === current.correct;
          button.setBackgroundColor(correct ? '#1c7a74' : '#73423e');
          feedback.setText(i18n.t(correct ? 'report.compareCorrect' : 'report.compareTryAgain'));
          if (!correct) return;
          this.time.delayedCall(520, () => {
            if (page === questions.length - 1) {
              clear();
              this.showFoodChainLesson();
            } else {
              page += 1;
              render();
            }
          });
        });
      });
      this.sharpenVisibleText();
    };

    render();
  }

  private showFoodChainLesson(): void {
    this.destroyLessonOverlay();
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      objects.push(object);
      return object;
    };
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.98)
        .setOrigin(0)
        .setDepth(4100)
        .setInteractive(),
    );
    add(
      createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1400, 820, {
        depth: 4101,
        goldRail: true,
      }),
    );
    const narrationHighlight = add(
      this.add
        .rectangle(GAME_WIDTH / 2, 282, 1320, 165, 0xf0c95a, 0.02)
        .setStrokeStyle(4, Palette.gold, 0.88)
        .setDepth(4101.5)
        .setVisible(false),
    );
    add(
      this.add
        .text(GAME_WIDTH / 2, 175, i18n.t('report.foodLessonTitle'), {
          fontFamily: 'sans-serif',
          fontSize: '48px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(4102),
    );
    add(
      this.add
        .text(GAME_WIDTH / 2, 250, i18n.t('report.foodLessonDefinition'), {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#d8f5f4',
          align: 'center',
          lineSpacing: 8,
          wordWrap: { width: 1300, useAdvancedWrap: false },
        })
        .setOrigin(0.5)
        .setDepth(4102),
    );

    add(
      this.add
        .text(GAME_WIDTH / 2, 315, i18n.t('report.foodLessonTask'), {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: '#f0c95a',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(4102),
    );

    const slotXs = [570, 960, 1350] as const;
    slotXs.forEach((x, index) => {
      add(
        createResearchSurface(this, x, 455, 280, 150, {
          depth: 4102,
          fill: Palette.cardSoft,
          border: Palette.accentSoft,
          borderAlpha: 0.42,
          radius: 18,
          shadow: false,
        }),
      );
      add(
        this.add
          .text(x, 455, `${index + 1}`, {
            fontFamily: 'monospace',
            fontSize: '42px',
            color: '#527f8e',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(4103),
      );
    });
    [765, 1155].forEach((x) => {
      add(
        this.add
          .text(x, 520, '→', {
            fontFamily: 'sans-serif',
            fontSize: '70px',
            color: '#f0c95a',
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setY(455)
          .setDepth(4103),
      );
    });

    const feedback = add(
      this.add
        .text(GAME_WIDTH / 2, 785, i18n.t('report.foodLessonTapHint'), {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: Palette.textMuted,
          align: 'center',
          wordWrap: { width: 1050, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(4102),
    );
    let step = 0;
    const foodChainProgress = (done: number): string =>
      i18n.t('report.foodLessonProgress').replace('{done}', String(done)).replace('{total}', '3');
    const button = new ResearchButton(this, GAME_WIDTH / 2, 875, 430, 70, foodChainProgress(0), {
      tone: 'locked',
      fontSize: 26,
      depth: 4103,
    });
    add(button.root);
    button.onPress(() => {
      if (step < 3) {
        feedback.setColor('#f2a679').setText(i18n.t('report.foodLessonStepHint'));
        return;
      }
      this.destroyLessonOverlay();
      this.setReportOverlayVisible(true);
      this.sharpenVisibleText();
    });

    const cards = [
      {
        expected: 2,
        label: i18n.t('report.foodWebLargerFish'),
        color: 0x5a4a2c,
        x: 570,
        textureKey: this.getReportSpeciesTextureKey('reef-grouper'),
      },
      {
        expected: 0,
        label: i18n.t('report.foodWebBase'),
        color: 0x1b6753,
        x: 960,
        textureKey: 'chapter1-seagrass-short',
      },
      {
        expected: 1,
        label: i18n.t('report.foodWebSmallFish'),
        color: 0x15506a,
        x: 1350,
        textureKey: this.getReportSpeciesTextureKey('blue-damselfish'),
      },
    ] as const;
    cards.forEach((card) => {
      const cardRoot = add(this.add.container(card.x, 665).setDepth(4104).setSize(280, 138));
      const homeX = card.x;
      const homeY = 665;
      const cardBack = createResearchSurface(this, 0, 0, 280, 138, {
        fill: card.color,
        border: 0x9cf7ef,
        borderAlpha: 0.72,
        radius: 18,
        shadow: true,
      });
      const label = this.add
        .text(0, 45, card.label, {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: '#ffffff',
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 230, useAdvancedWrap: true },
        })
        .setOrigin(0.5);
      const children: Phaser.GameObjects.GameObject[] = [cardBack];
      if (card.textureKey !== null && this.textures.exists(card.textureKey)) {
        const source = this.textures.get(card.textureKey).getSourceImage();
        const imageScale = Math.min(164 / source.width, 78 / source.height);
        children.push(
          this.add
            .image(0, -28, card.textureKey)
            .setDisplaySize(source.width * imageScale, source.height * imageScale),
        );
      }
      children.push(label);
      cardRoot.add(children).setInteractive({ useHandCursor: true });
      this.input.setDraggable(cardRoot);
      cardRoot.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, () => {
        if (!cardRoot.input?.enabled) return;
        cardRoot.setDepth(4120).setScale(1.04);
        feedback.setColor(Palette.textMuted).setText(i18n.t('report.foodLessonDropHint'));
      });
      cardRoot.on(
        Phaser.Input.Events.GAMEOBJECT_DRAG,
        (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          if (!cardRoot.input?.enabled) return;
          cardRoot.setPosition(dragX, dragY);
        },
      );
      cardRoot.on(Phaser.Input.Events.GAMEOBJECT_DRAG_END, () => {
        if (!cardRoot.input?.enabled) return;
        const expectedSlotX = slotXs[step] ?? -9999;
        const isOverActiveSlot =
          Math.abs(cardRoot.x - expectedSlotX) <= 150 && Math.abs(cardRoot.y - 455) <= 95;
        if (card.expected !== step || !isOverActiveSlot) {
          feedback.setColor('#f2a679').setText(i18n.t('report.foodLessonWrong'));
          cardRoot.setDepth(4104).setScale(1);
          this.tweens.add({
            targets: cardRoot,
            x: homeX,
            y: homeY,
            duration: 220,
            ease: 'Back.easeOut',
          });
          return;
        }
        this.input.setDraggable(cardRoot, false);
        cardRoot.disableInteractive();
        cardRoot.setDepth(4104).setScale(1);
        this.tweens.add({
          targets: cardRoot,
          x: slotXs[step],
          y: 455,
          duration: 260,
          ease: 'Back.easeOut',
        });
        step += 1;
        if (step < 3) {
          feedback.setColor('#91e6a7').setText(i18n.t('report.foodLessonCorrectNext'));
          button.setText(foodChainProgress(step));
          return;
        }
        feedback.setColor('#91e6a7').setText(i18n.t('report.foodLessonWeb'));
        button.setText(i18n.t('report.foodLessonStart')).setTone('primary');
      });
    });
    const voiceButton = new ResearchButton(
      this,
      1510,
      875,
      310,
      64,
      i18n.t('report.aiVoiceReplay'),
      { tone: 'secondary', fontSize: 20, depth: 4105 },
    );
    add(voiceButton.root);
    const playFoodLessonNarration = (automatic = false): void => {
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
      const accepted = this.playNarrationCue('report-food-lesson', narrationHighlight, {
        automatic,
        hideHighlightWhenIdle: true,
        onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
        onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
      });
      if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
    };
    voiceButton.onPress(() => playFoodLessonNarration(false));
    this.lessonOverlayObjects = objects;
    playFoodLessonNarration(true);
    this.sharpenVisibleText();
  }

  private showChapter1Recap(): void {
    this.destroyLessonOverlay();
    const questions: ReadonlyArray<{
      question: string;
      choices: readonly [string, string];
      correct: number;
      correctFeedback?: string;
    }> = [
      {
        question: 'report.recap.q1',
        choices: ['report.recap.q1a', 'report.recap.q1b'],
        correct: 1,
      },
      {
        question: 'report.recap.q2',
        choices: ['report.recap.q2a', 'report.recap.q2b'],
        correct: 1,
      },
      {
        question: 'report.recap.q3',
        choices: ['report.recap.q3a', 'report.recap.q3b'],
        correct: 0,
      },
      {
        question: 'report.recap.q4',
        choices: ['report.recap.q4a', 'report.recap.q4b'],
        correct: 0,
        correctFeedback: 'report.recapFoodWebOutcome',
      },
    ];
    let index = 0;
    let transitioning = false;
    let pageObjects: Phaser.GameObjects.GameObject[] = [];

    const render = (): void => {
      transitioning = false;
      narrationService.stop();
      for (const object of pageObjects) object.destroy();
      pageObjects = [];
      const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        pageObjects.push(object);
        return object;
      };
      const current = questions[index] ?? questions[0];
      if (current === undefined) return;
      const questionCue = [
        'report-recap-1',
        'report-recap-2',
        'report-recap-3',
        'report-recap-4-v2',
      ] as const;
      const activeQuestionCue = questionCue[index] ?? 'report-recap-1';
      add(
        this.add
          .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.82)
          .setOrigin(0)
          .setDepth(3000)
          .setInteractive(),
      );
      add(
        this.add
          .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1480, 720, 0x0a2a43, 0.99)
          .setStrokeStyle(3, Palette.accent)
          .setDepth(3001),
      );
      const narrationHighlight = add(
        this.add
          .rectangle(GAME_WIDTH / 2, 500, 1390, 360, 0xf0c95a, 0.02)
          .setStrokeStyle(4, Palette.gold, 0.82)
          .setDepth(3001.5)
          .setVisible(false),
      );
      add(
        this.add
          .text(
            GAME_WIDTH / 2,
            240,
            `${i18n.t('report.recapTitle')}  ${index + 1}/${questions.length}`,
            {
              fontFamily: 'sans-serif',
              fontSize: '42px',
              color: Palette.textLight,
              fontStyle: 'bold',
            },
          )
          .setOrigin(0.5)
          .setDepth(3002),
      );
      add(
        this.add
          .text(
            GAME_WIDTH / 2,
            350,
            `${i18n.t('common.questionLabel')} ${i18n.t(current.question)}`,
            {
              fontFamily: 'sans-serif',
              fontSize: '34px',
              color: '#dff9fb',
              align: 'center',
              wordWrap: { width: 1380, useAdvancedWrap: true },
              lineSpacing: 8,
            },
          )
          .setOrigin(0.5)
          .setDepth(3002),
      );
      add(
        this.add
          .text(300, 435, i18n.t('common.optionsLabel'), {
            fontFamily: 'sans-serif',
            fontSize: '29px',
            color: '#f0c95a',
            fontStyle: 'bold',
          })
          .setDepth(3002),
      );
      const feedback = add(
        this.add
          .text(GAME_WIDTH / 2, 690, '', {
            fontFamily: 'sans-serif',
            fontSize: '24px',
            color: '#91e6a7',
            align: 'center',
            wordWrap: { width: 1080, useAdvancedWrap: true },
            padding: { x: 16, y: 9 },
          })
          .setOrigin(0.5)
          .setDepth(3002),
      );
      const continueButton = new ResearchButton(
        this,
        1270,
        835,
        360,
        66,
        i18n.t('report.continueChapter2'),
        { tone: 'primary', fontSize: 24, depth: 3004 },
      );
      continueButton.root.setVisible(false).setActive(false);
      continueButton.onPress(() => {
        if (!transitioning || index < questions.length - 1) return;
        this.enterChapter2();
      });
      add(continueButton.root);
      const voiceButton = new ResearchButton(
        this,
        780,
        835,
        300,
        66,
        i18n.t('report.aiVoiceReplay'),
        { tone: 'secondary', fontSize: 20, depth: 3004 },
      );
      add(voiceButton.root);
      const playQuestionNarration = (automatic = false): void => {
        voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
        const accepted = this.playNarrationCue(activeQuestionCue, narrationHighlight, {
          automatic,
          hideHighlightWhenIdle: true,
          onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
          onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
        });
        if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
      };
      voiceButton.onPress(() => playQuestionNarration(false));
      const choiceButtons: ResearchButton[] = [];
      current.choices.forEach((choice, choiceIndex) => {
        const button = new ResearchButton(
          this,
          610 + choiceIndex * 700,
          565,
          620,
          140,
          `${choiceIndex === 0 ? 'A' : 'B'}. ${i18n.t(choice)}`,
          { tone: 'secondary', fontSize: 28, lineSpacing: 8, depth: 3002 },
        );
        choiceButtons.push(button);
        add(button.root);
        button.onPress(() => {
          if (transitioning) return;
          const correct = choiceIndex === current.correct;
          button.setTone(correct ? 'primary' : 'danger');
          const feedbackKey =
            correct && current.correctFeedback !== undefined
              ? current.correctFeedback
              : correct
                ? 'report.recapCorrect'
                : 'report.recapTryAgain';
          feedback
            .setColor(correct ? '#d8fffb' : '#fff3b0')
            .setBackgroundColor(correct ? '#0f5f59' : '#6b332e')
            .setText(i18n.t(feedbackKey));
          this.playNarrationCue(
            correct ? 'feedback-correct-v2' : 'feedback-try-again',
            button.root,
            {
              hideHighlightWhenIdle: false,
            },
          );
          if (!correct) {
            this.tweens.add({
              targets: button.root,
              x: { from: button.root.x - 10, to: button.root.x + 10 },
              duration: 70,
              yoyo: true,
              repeat: 2,
              onComplete: () => {
                if (button.root.active && !transitioning) button.setTone('secondary');
              },
            });
            return;
          }
          transitioning = true;
          for (const choiceButton of choiceButtons) choiceButton.setEnabled(false);
          if (index >= questions.length - 1) {
            continueButton.root.setVisible(true).setActive(true);
            return;
          }
          this.time.delayedCall(760, () => {
            index += 1;
            render();
          });
        });
      });
      const back = add(
        this.add
          .text(400, 835, i18n.t('common.backStep'), {
            fontFamily: 'sans-serif',
            fontSize: '22px',
            color: Palette.textLight,
            backgroundColor: '#123c50',
            padding: { x: 28, y: 14 },
          })
          .setOrigin(0.5)
          .setDepth(3003)
          .setInteractive({ useHandCursor: true }),
      );
      back.on(Phaser.Input.Events.POINTER_UP, () => {
        if (transitioning) return;
        if (index === 0) this.showDoBridge();
        else {
          index -= 1;
          render();
        }
      });
      this.lessonOverlayObjects = pageObjects;
      playQuestionNarration(true);
      this.sharpenVisibleText();
    };
    render();
  }

  private showDoQuestion(): void {
    this.destroyLessonOverlay();
    this.setReportOverlayVisible(false);
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      objects.push(object);
      return object;
    };
    add(
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.99)
        .setOrigin(0)
        .setDepth(3000)
        .setInteractive(),
    );
    add(
      createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1320, 790, {
        depth: 3001,
        goldRail: true,
      }),
    );
    add(
      this.add
        .text(GAME_WIDTH / 2, 205, i18n.t('report.doQuestionTitle'), {
          fontFamily: 'sans-serif',
          fontSize: '48px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3002),
    );
    add(
      this.add
        .text(GAME_WIDTH / 2, 285, i18n.t('report.doQuestionObserve'), {
          fontFamily: 'sans-serif',
          fontSize: '29px',
          color: '#d8f5f4',
          align: 'center',
          wordWrap: { width: 1050, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(3002),
    );

    const fishFrameKeys = this.getCreatureDisplayFrameKeys('blue-damselfish');
    const fishTextureKey = fishFrameKeys[0] ?? null;
    if (fishTextureKey !== null && this.textures.exists(fishTextureKey)) {
      const fishImage = this.addHistoricalPhoto(
        fishTextureKey,
        GAME_WIDTH / 2,
        465,
        430,
        235,
        3003,
      );
      if (fishImage !== null) {
        // The complete frame sequence supplies continuous body and fin motion.
        fishImage.setFlipX(true);
        add(fishImage);
        const framePlan = getCreatureFramePlan('blue-damselfish');
        if (fishFrameKeys.length > 1 && framePlan !== null) {
          let frameIndex = 0;
          this.lessonOverlayTimers.push(
            this.time.addEvent({
              delay: framePlan.frameDurationMs,
              loop: true,
              callback: () => {
                frameIndex = (frameIndex + 1) % fishFrameKeys.length;
                const frameKey = fishFrameKeys[frameIndex];
                if (frameKey !== undefined && fishImage.active) fishImage.setTexture(frameKey);
              },
            }),
          );
        }
      }
    } else {
      const fish = add(this.add.graphics().setDepth(3003));
      fish.fillStyle(0x67d8d1, 1).fillEllipse(GAME_WIDTH / 2, 465, 210, 100);
      fish.fillTriangle(
        GAME_WIDTH / 2 - 100,
        465,
        GAME_WIDTH / 2 - 165,
        420,
        GAME_WIDTH / 2 - 165,
        510,
      );
    }
    const feedback = add(
      this.add
        .text(GAME_WIDTH / 2, 835, '', {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#91e6a7',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(3004),
    );
    const narrationHighlight = add(
      this.add
        .rectangle(GAME_WIDTH / 2, 700, 1100, 220, 0xf0c95a, 0.025)
        .setStrokeStyle(4, Palette.gold, 0.82)
        .setDepth(3003)
        .setVisible(false),
    );
    add(
      this.add
        .text(
          GAME_WIDTH / 2,
          615,
          `${i18n.t('common.questionLabel')} ${i18n.t('report.doQuestionPrompt')}`,
          {
            fontFamily: 'sans-serif',
            fontSize: '30px',
            color: '#e9fbff',
            fontStyle: 'bold',
            align: 'center',
          },
        )
        .setOrigin(0.5)
        .setDepth(3004),
    );
    add(
      this.add
        .text(490, 675, i18n.t('common.optionsLabel'), {
          fontFamily: 'sans-serif',
          fontSize: '29px',
          color: '#f0c95a',
          fontStyle: 'bold',
        })
        .setOrigin(0, 1)
        .setDepth(3004),
    );
    [
      { key: 'report.doQuestionGills', correct: true },
      { key: 'report.doQuestionSurface', correct: false },
    ].forEach((choice, index) => {
      const button = new ResearchButton(
        this,
        700 + index * 520,
        742,
        440,
        94,
        `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`,
        { tone: 'secondary', fontSize: 28, lineSpacing: 6, depth: 3004 },
      );
      add(button.root);
      button.onPress(() => {
        button.setTone(choice.correct ? 'primary' : 'danger');
        feedback.setText(
          i18n.t(choice.correct ? 'report.doQuestionCorrect' : 'report.doQuestionTryAgain'),
        );
        this.playNarrationCue(
          choice.correct ? 'feedback-correct-v2' : 'feedback-try-again',
          button.root,
          { hideHighlightWhenIdle: false },
        );
        if (choice.correct) this.time.delayedCall(760, () => this.showDoBridge());
      });
    });
    const back = new ResearchButton(this, 470, 850, 260, 64, i18n.t('common.backStep'), {
      tone: 'secondary',
      fontSize: 22,
      depth: 3004,
    });
    add(back.root);
    back.onPress(() => {
      this.destroyLessonOverlay();
      this.setReportOverlayVisible(true);
      this.sharpenVisibleText();
    });
    const voiceButton = new ResearchButton(
      this,
      1360,
      850,
      340,
      64,
      i18n.t('report.aiVoiceReplay'),
      { tone: 'secondary', fontSize: 20, depth: 3004 },
    );
    add(voiceButton.root);
    const playQuestionNarration = (automatic = false): void => {
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
      const accepted = this.playNarrationCue('report-fish-gills-question-v3', narrationHighlight, {
        automatic,
        hideHighlightWhenIdle: true,
        onComplete: () => voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
        onError: () => voiceButton.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
      });
      if (!accepted) voiceButton.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
    };
    voiceButton.onPress(() => playQuestionNarration(false));
    this.lessonOverlayObjects = objects;
    playQuestionNarration(true);
    this.sharpenVisibleText();
  }

  private showDoBridge(): void {
    this.destroyLessonOverlay();
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.99)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive();
    const panel = createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1320, 760, {
      depth: 3001,
      goldRail: true,
    });
    const title = this.add
      .text(GAME_WIDTH / 2, 220, i18n.t('report.doBridgeTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const definition = this.add
      .text(GAME_WIDTH / 2, 310, i18n.t('report.doBridgeDefinition'), {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#d8f5f4',
        align: 'center',
        lineSpacing: 8,
        wordWrap: { width: 1060, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const conceptCards: Phaser.GameObjects.GameObject[] = [];
    const conceptData = [
      { x: 600, iconKey: 'report.doBridgeTankIcon', key: 'report.doBridgeTank', color: 0x15506a },
      { x: 960, iconKey: 'report.doBridgeWaterIcon', key: 'report.doBridgeWater', color: 0x1b6753 },
      { x: 1320, iconKey: 'report.doBridgeLowIcon', key: 'report.doBridgeLow', color: 0x6a4930 },
    ] as const;
    conceptData.forEach((concept) => {
      const card = createResearchSurface(this, concept.x, 465, 310, 164, {
        depth: 3001,
        fill: concept.color,
        border: Palette.accentSoft,
        borderAlpha: 0.55,
        radius: 18,
        shadow: false,
      });
      const icon = this.add
        .text(concept.x, 430, i18n.t(concept.iconKey), {
          fontFamily: 'monospace',
          fontSize: '28px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3002);
      const label = this.add
        .text(concept.x, 492, i18n.t(concept.key), {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: '#e9fbff',
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 4,
          wordWrap: { width: 268, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(3002);
      conceptCards.push(card, icon, label);
    });
    const problem = this.add
      .text(GAME_WIDTH / 2, 590, i18n.t('report.doBridgeProblem'), {
        fontFamily: 'sans-serif',
        fontSize: '25px',
        color: '#ffd873',
        align: 'center',
        backgroundColor: '#3c351faa',
        padding: { x: 26, y: 14 },
        wordWrap: { width: 1080, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const solution = this.add
      .text(GAME_WIDTH / 2, 690, i18n.t('report.doBridgeSolution'), {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#bfffee',
        align: 'center',
        backgroundColor: '#123c50aa',
        padding: { x: 30, y: 18 },
        wordWrap: { width: 1000, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const narrationHighlight = this.add
      .rectangle(GAME_WIDTH / 2, 495, 1180, 500, 0xf0c95a, 0.015)
      .setStrokeStyle(4, Palette.gold, 0.9)
      .setDepth(3001.5)
      .setVisible(false);
    const button = new ResearchButton(this, 1280, 825, 360, 64, i18n.t('report.startRecap'), {
      tone: 'primary',
      fontSize: 24,
      depth: 3003,
    });
    button.onPress(() => this.showChapter1Recap());
    const voiceButton = new ResearchButton(
      this,
      860,
      825,
      300,
      64,
      i18n.t('report.doBridgeVoiceReplay'),
      { tone: 'secondary', fontSize: 22, depth: 3003 },
    );
    const playRequiredNarration = (automatic = false): void => {
      if (narrationService.isPlaying()) return;
      voiceButton.setText(i18n.t('report.doBridgeVoicePlaying')).setEnabled(false);
      const started = this.playNarrationCue('report-do-bridge', narrationHighlight, {
        automatic,
        hideHighlightWhenIdle: true,
        onComplete: () => {
          voiceButton.setText(i18n.t('report.doBridgeVoiceReplay')).setEnabled(true);
        },
        onError: () => {
          voiceButton.setText(i18n.t('report.doBridgeVoiceRetry')).setEnabled(true);
        },
      });
      if (!started) {
        voiceButton.setText(i18n.t('report.doBridgeVoiceUnavailable')).setEnabled(true);
      }
    };
    voiceButton.onPress(() => playRequiredNarration(false));
    const back = new ResearchButton(this, 440, 825, 250, 64, i18n.t('common.backStep'), {
      tone: 'secondary',
      fontSize: 22,
      depth: 3003,
    });
    back.onPress(() => this.showDoQuestion());
    this.lessonOverlayObjects = [
      dim,
      panel,
      title,
      definition,
      ...conceptCards,
      problem,
      solution,
      narrationHighlight,
      button.root,
      voiceButton.root,
      back.root,
    ];
    if (!this.doBridgeNarrationPlayed) {
      this.doBridgeNarrationPlayed = true;
      playRequiredNarration(true);
    }
    this.sharpenVisibleText();
  }

  private enterChapter2(): void {
    gameState.selectedChapter = 2;
    this.scene.start(SceneKeys.Chapter2Lab);
  }

  private getSpeciesLabel(speciesId: string): string {
    const species = gameState.getData().species.find((entry) => entry.id === speciesId);
    if (species === undefined) return speciesId;
    return i18n.getLocale() === 'en' ? species.nameEn : species.nameZh;
  }

  private getReportSpeciesTextureKey(speciesId: string): string | null {
    const frameKeys = this.getCreatureDisplayFrameKeys(speciesId);
    if (frameKeys.length > 0) return frameKeys[0] ?? null;
    const staticKey = `chapter1-subject-${speciesId}`;
    return this.textures.exists(staticKey) ? staticKey : null;
  }

  private openTutorial(isFirstTime: boolean): void {
    if (this.briefingOpen || this.reportOpen) return;
    this.paused = true;
    new TutorialOverlay(this, () => {
      this.paused = false;
      if (isFirstTime && !gameState.tutorialSeen) {
        gameState.tutorialSeen = true;
        saveService.save(gameState.toSave());
      }
    });
  }

  private showSafeReturn(_missionId: string): void {
    if (this.safeReturnShown) return;
    this.safeReturnShown = true;
    this.paused = true;
    const panel = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 820, 300, 0x0a2a43, 0.98)
      .setStrokeStyle(3, 0xf0c95a)
      .setDepth(3000);
    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 48, i18n.t('dive.safeReturn'), {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: Palette.textLight,
        align: 'center',
        lineSpacing: 10,
        wordWrap: { width: 650, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3001);
    const retry = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 82, i18n.t('dive.retry'), {
        fontFamily: 'sans-serif',
        fontSize: '25px',
        color: Palette.textLight,
        backgroundColor: '#1c7a74',
        padding: { x: 28, y: 14 },
      })
      .setOrigin(0.5)
      .setDepth(3001)
      .setInteractive({ useHandCursor: true });
    this.overlayObjects = [panel, text, retry];
    retry.once(Phaser.Input.Events.POINTER_UP, () => this.scene.restart());
  }

  private showObservationCard(payload: GameEventMap['subject:discovered']): void {
    this.clearObservationReviewHint();
    this.paused = true;
    const copy = this.getEcologyCardCopy(payload.speciesId);
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const panelWidth = 980;
    const panelHeight = 540;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.76)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive();
    const panel = this.add
      .rectangle(cx, cy, panelWidth, panelHeight, 0x0a2a43, 0.99)
      .setStrokeStyle(3, Palette.accent)
      .setDepth(3001);
    const eyebrow = this.add
      .text(
        cx - panelWidth / 2 + 44,
        cy - panelHeight / 2 + 34,
        i18n.t('dive.observationEyebrow'),
        {
          fontFamily: 'sans-serif',
          fontSize: '19px',
          color: Palette.accentText,
          fontStyle: 'bold',
        },
      )
      .setDepth(3002);
    const title = this.add
      .text(cx - panelWidth / 2 + 44, cy - panelHeight / 2 + 70, payload.label, {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setDepth(3002);
    const progress = this.add
      .text(
        cx + panelWidth / 2 - 44,
        cy - panelHeight / 2 + 38,
        `${i18n.t('dive.observationProgress')}: ${this.observedSpecies.size}/${gameState.getData().species.length}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '17px',
          color: Palette.textMuted,
          align: 'right',
        },
      )
      .setOrigin(1, 0)
      .setDepth(3002);
    const body = this.add
      .text(
        cx - panelWidth / 2 + 44,
        cy - panelHeight / 2 + 132,
        `${i18n.t('dive.observationRole')}: ${copy.role}\n${i18n.t('dive.observationHabitat')}: ${payload.depthZone}\n${i18n.t('dive.observationBehavior')}: ${copy.behavior}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: Palette.textLight,
          lineSpacing: 12,
          wordWrap: { width: 420, useAdvancedWrap: true },
        },
      )
      .setDepth(3002);
    const chainBox = this.add
      .rectangle(cx + 230, cy - 12, 430, 150, 0x123c50, 1)
      .setStrokeStyle(2, 0x3fd0c9, 0.6)
      .setDepth(3001);
    const chainTitle = this.add
      .text(cx + 230, cy - 62, i18n.t('dive.observationFoodChain'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const chainLabels = copy.chain.split(/\s*\u2192\s*/);
    const chainUnlocks = [true, true, this.observedSpecies.size >= 2];
    const lockedLabel = i18n.t('dive.observationLockedNode');
    const chainNodes = chainLabels.map((label, index) => {
      const shownLabel = chainUnlocks[index] ? label : lockedLabel;
      const node = this.add
        .rectangle(
          cx + 95 + index * 135,
          cy - 18,
          112,
          56,
          !chainUnlocks[index] ? 0x18384a : index === 1 ? 0x1c7a74 : 0x19536a,
          1,
        )
        .setStrokeStyle(2, 0x9cf7ef, 0.58)
        .setDepth(3002)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(node.x, node.y, shownLabel, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: Palette.textLight,
          align: 'center',
          wordWrap: { width: 94, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(3003);
      return { node, text };
    });
    const chainArrows = [0, 1].map((index) =>
      this.add
        .text(cx + 162 + index * 135, cy - 18, '→', {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: Palette.accentText,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3003),
    );
    const chainDetail = this.add
      .text(cx + 230, cy + 36, '', {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: Palette.textMuted,
        align: 'center',
        wordWrap: { width: 390, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3003);
    const showChainNode = (index: number): void => {
      if (!chainUnlocks[index]) {
        chainDetail.setText(i18n.t('dive.observationLockedHint'));
      } else {
        chainDetail.setText(
          `${chainLabels[index]}：${this.getChainNodeDetail(index, payload.label)}`,
        );
      }
      chainNodes.forEach((entry, nodeIndex) =>
        entry.node.setFillStyle(
          !chainUnlocks[nodeIndex]
            ? 0x18384a
            : nodeIndex === index
              ? 0x2a8d85
              : nodeIndex === 1
                ? 0x1c7a74
                : 0x19536a,
          1,
        ),
      );
    };
    chainNodes.forEach((entry, index) =>
      entry.node.on(Phaser.Input.Events.POINTER_UP, () => showChainNode(index)),
    );
    showChainNode(1);
    const chainObjects: Phaser.GameObjects.GameObject[] = [
      ...chainNodes.flatMap((entry) => [entry.node, entry.text]),
      ...chainArrows,
      chainDetail,
    ];
    const note = this.add
      .text(cx, cy + 148, i18n.t('dive.observationCaution'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: Palette.textMuted,
        align: 'center',
        wordWrap: { width: 800, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const button = this.add
      .text(cx, cy + 220, i18n.t('dive.observationContinue'), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: Palette.textLight,
        backgroundColor: '#1c7a74',
        padding: { x: 28, y: 13 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3002)
      .setInteractive({ useHandCursor: true });
    this.overlayObjects = [
      dim,
      panel,
      eyebrow,
      title,
      progress,
      body,
      chainBox,
      chainTitle,
      note,
      button,
      ...chainObjects,
    ];
    button.once(Phaser.Input.Events.POINTER_UP, () => {
      this.destroyOverlay();
      this.paused = false;
    });
  }

  private requestObservationReview(payload: GameEventMap['subject:discovered']): void {
    this.pendingObservationReview = payload;
    this.reviewHintText
      .setText(payload.label + ' · ' + i18n.t('dive.observationReviewHint'))
      .setVisible(true);
  }

  private clearObservationReviewHint(): void {
    this.pendingObservationReview = null;
    if (this.reviewHintText !== undefined) this.reviewHintText.setVisible(false).setText('');
  }

  private getEcologyCardCopy(speciesId: string): { role: string; behavior: string; chain: string } {
    const english = i18n.getLocale() === 'en';
    const copy: Record<
      string,
      {
        en: { role: string; behavior: string; chain: string };
        zh: { role: string; behavior: string; chain: string };
      }
    > = {
      'blue-damselfish': {
        en: {
          role: 'small mobile reef fish',
          behavior: 'rests in the water column, then startles and moves away',
          chain: 'algae / seagrass → small fish → larger reef fish',
        },
        zh: {
          role: '中層小型礁魚',
          behavior: '平時緩慢游動，受驚後會快速離開',
          chain: '藻類／海草 → 小型魚 → 大型礁魚',
        },
      },
      'reef-grouper': {
        en: {
          role: 'habitat-associated predator',
          behavior: 'stays near structure and moves with short bursts',
          chain: 'small fish → grouper → larger predators',
        },
        zh: {
          role: '依附棲地的掠食者',
          behavior: '靠近結構物停留，以短促動作移動',
          chain: '小型魚 → 石斑魚 → 更大型掠食者',
        },
      },
      'hardy-goby': {
        en: {
          role: 'small bottom fish',
          behavior: 'keeps close to the seabed and shelter',
          chain: 'algae / detritus → bottom fish → larger fish',
        },
        zh: {
          role: '底部小型魚',
          behavior: '靠近海床與掩蔽物活動',
          chain: '藻類／碎屑 → 底棲小魚 → 大型魚',
        },
      },
      'silver-reef-fish': {
        en: {
          role: 'mobile midwater fish',
          behavior: 'moves through open water and may leave the frame',
          chain: 'plankton → 中層魚 → 大型魚',
        },
        zh: {
          role: '中層活動魚類',
          behavior: '穿越開闊水域，可能游出觀測畫面',
          chain: '浮游生物 → 中層魚 → 大型魚',
        },
      },
      'sea-cucumber': {
        en: {
          role: 'slow seabed recycler',
          behavior: 'moves slowly across the bottom',
          chain: 'organic matter → seabed organisms → nutrient recycling',
        },
        zh: {
          role: '緩慢活動的底棲分解者',
          behavior: '在海床上緩慢移動',
          chain: '有機碎屑 → 底棲生物 → 養分循環',
        },
      },
      'tube-sponge': {
        en: {
          role: 'stationary filter feeder',
          behavior: 'stays attached to the seabed structure',
          chain: 'plankton → filter feeders → reef habitat',
        },
        zh: {
          role: '固定的濾食生物',
          behavior: '附著在海床結構上，不會主動游動',
          chain: '浮游生物 → 濾食生物 → 礁區棲地',
        },
      },
    };
    const selected = copy[speciesId] ?? {
      en: {
        role: 'observed marine organism',
        behavior: 'its behavior needs repeated observations',
        chain: 'habitat → observed organism → wider food chain',
      },
      zh: {
        role: '被觀察到的海洋生物',
        behavior: '需要透過多次觀察了解行為',
        chain: '棲地 → 觀察到的生物 → 更大的食物鏈',
      },
    };
    return english ? selected.en : selected.zh;
  }

  private getChainNodeDetail(index: number, label: string): string {
    const english = i18n.getLocale() === 'en';
    if (index === 0)
      return english
        ? 'energy or organic matter enters the local food chain here'
        : '能量或有機物從這個環節進入當地食物鏈';
    if (index === 1)
      return english
        ? `${label} is the organism observed in this field note`
        : `${label} 是這次現場筆記觀察到的生物`;
    return english
      ? 'a possible consumer link; repeated observations are still needed'
      : '可能的消費者關係，仍需要多次觀察確認';
  }

  private playShutterSound(): void {
    const AudioContextConstructor = window.AudioContext;
    if (AudioContextConstructor === undefined) return;

    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(920, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(260, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.1);
    window.setTimeout(() => {
      void context.close();
    }, 150);
  }

  private showStatus(message: string): void {
    this.hud.notify(message);
  }

  private updateOxygenGuidance(): void {
    const ratio = this.oxygen.maxValue > 0 ? this.oxygen.value / this.oxygen.maxValue : 0;
    const level = ratio <= 0.2 ? 3 : ratio <= 0.4 ? 2 : ratio <= 0.7 ? 1 : 0;
    if (level <= this.oxygenNoticeLevel) return;

    this.oxygenNoticeLevel = level;
    const messageKey =
      level === 3
        ? 'dive.oxygenNotice20'
        : level === 2
          ? 'dive.oxygenNotice40'
          : 'dive.oxygenNotice70';
    this.showStatus(i18n.t(messageKey));
  }

  private openViewfinder(): void {
    if (this.mapView === null) return;
    const task = getDiveFieldTask(this.fieldTaskIndex);
    if (task?.kind !== 'station') {
      this.showStatus(i18n.t('dive.guidanceFollowCurrentTask'));
      return;
    }
    const position = this.diver.getPosition();
    const target = this.mapView.getNearestPhotographableStation(
      position.x,
      position.y,
      task.stationId,
    );
    if (target === null) {
      this.showStatus(i18n.t('dive.viewfinderNoTarget'));
      return;
    }

    this.viewfinderOpen = true;
    this.viewfinderTarget = { kind: 'station', ...target };
    // SPACE opens the camera and is also the shutter. Mark this press as
    // consumed so holding the key cannot take an accidental photo one frame
    // after the viewfinder appears.
    this.actionWasDown = true;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const frameWidth = 1420;
    const frameHeight = 740;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.88)
      .setOrigin(0)
      .setDepth(2800);
    const frame = this.add
      .rectangle(cx, cy, frameWidth, frameHeight, 0x061923, 0.98)
      .setStrokeStyle(3, Palette.accent, 0.9)
      .setDepth(2801);
    const corners = this.add.graphics().setDepth(2803);
    corners.lineStyle(5, 0xe6f7ff, 0.92);
    const left = cx - frameWidth / 2;
    const right = cx + frameWidth / 2;
    const top = cy - frameHeight / 2;
    const bottom = cy + frameHeight / 2;
    const cornerLength = 54;
    corners.beginPath();
    corners.moveTo(left, top + cornerLength);
    corners.lineTo(left, top);
    corners.lineTo(left + cornerLength, top);
    corners.moveTo(right - cornerLength, top);
    corners.lineTo(right, top);
    corners.lineTo(right, top + cornerLength);
    corners.moveTo(left, bottom - cornerLength);
    corners.lineTo(left, bottom);
    corners.lineTo(left + cornerLength, bottom);
    corners.moveTo(right - cornerLength, bottom);
    corners.lineTo(right, bottom);
    corners.lineTo(right, bottom - cornerLength);
    corners.strokePath();

    const headerBar = this.add
      .rectangle(cx, top + 45, frameWidth - 14, 70, 0x0b2b3b, 0.98)
      .setStrokeStyle(1, 0x3fd0c9, 0.42)
      .setDepth(2802);
    const headerRule = this.add.graphics().setDepth(2803);
    headerRule.lineStyle(2, 0x3fd0c9, 0.55);
    headerRule.lineBetween(left + 24, top + 80, right - 24, top + 80);
    const title = this.add
      .text(cx, top + 43, `${i18n.t('dive.viewfinderTitle')} · ${target.displayName}`, {
        fontFamily: 'sans-serif',
        fontSize: '31px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const captureTag = this.add
      .text(left + 34, top + 34, 'CAPTURE / 01', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(2804);
    const liveTag = this.add
      .text(right - 34, top + 34, '● LIVE', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#91e6a7',
        fontStyle: 'bold',
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(2804);
    const targetSpeciesId = this.getViewfinderTargetSpeciesId(target.id);
    const targetSpeciesLabel = this.getSpeciesLabel(targetSpeciesId);
    const targetSpeciesTextureKey = this.getReportSpeciesTextureKey(targetSpeciesId);
    const referenceX = left + 176;
    const referenceCard = this.add
      .rectangle(referenceX, top + 350, 270, 510, 0x123c50, 0.98)
      .setStrokeStyle(2, 0x3fd0c9, 0.7)
      .setDepth(2802);
    const currentTargetTitle = this.add
      .text(referenceX, top + 110, i18n.t('dive.viewfinderCurrentTarget'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#fff3a8',
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const currentTargetImage =
      targetSpeciesTextureKey === null
        ? null
        : this.addHistoricalPhoto(targetSpeciesTextureKey, referenceX, top + 187, 200, 108, 2804);
    const currentTargetName = this.add
      .text(referenceX, top + 253, targetSpeciesLabel, {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 230, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const referenceDivider = this.add.graphics().setDepth(2803);
    referenceDivider.lineStyle(2, 0x3fd0c9, 0.32);
    referenceDivider.lineBetween(referenceX - 108, top + 286, referenceX + 108, top + 286);
    const referenceBadge = this.add
      .text(referenceX, top + 318, i18n.t('dive.viewfinderHistoricalImage'), {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const referenceTitle = this.add
      .text(referenceX, top + 352, i18n.t('dive.viewfinderReference'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: Palette.textLight,
        align: 'center',
        wordWrap: { width: 230, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const photo = this.getHistoricalPhotoForStation(target.id);
    const referenceImage =
      photo === null
        ? null
        : this.addHistoricalPhoto(photo.key, referenceX, top + 446, 225, 146, 2803);

    // The previous viewfinder only dimmed the map. Build a dedicated preview
    // so the player can immediately see the scene being compared.
    const previewLeft = left + 330;
    const previewTop = top + 82;
    const previewWidth = 1015;
    const previewHeight = 555;
    const previewX = previewLeft + previewWidth / 2;
    const previewY = previewTop + previewHeight / 2;
    const previewFrame = this.add
      .rectangle(previewX, previewY, previewWidth, previewHeight, 0x0c3a4c, 0.98)
      .setStrokeStyle(2, 0x3fd0c9, 0.82)
      .setDepth(2802);
    const previewEnvironment = this.createViewfinderEnvironment(
      target.id,
      previewLeft + 4,
      previewTop + 4,
      previewWidth - 8,
      previewHeight - 8,
      2803,
    );
    const liveBadge = this.add
      .text(previewLeft + 24, previewTop + 20, i18n.t('dive.viewfinderLive'), {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#d8fffb',
        backgroundColor: '#0b6c68dd',
        padding: { x: 10, y: 6 },
        fontStyle: 'bold',
      })
      .setDepth(2806);
    const locationBadge = this.add
      .text(previewLeft + previewWidth - 24, previewTop + 20, target.displayName, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#d8fffb',
        backgroundColor: '#0b3441dd',
        padding: { x: 10, y: 6 },
        fontStyle: 'bold',
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(2806);
    const liveHint = this.add
      .text(previewLeft + 24, previewTop + 70, i18n.t('dive.viewfinderCompareHint'), {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#e6f7ffdd',
        fontStyle: 'bold',
        wordWrap: { width: previewWidth - 48, useAdvancedWrap: false },
      })
      .setDepth(2806);
    const targetX = previewX + 58;
    // The inner-bay comparison is deliberately aimed at the seabed. The sea
    // cucumber is a benthic subject, so it must not use the same vertical
    // drift as the mid-water fish.
    const isSeabedStation = target.id.endsWith('3');
    const targetY = isSeabedStation ? previewTop + previewHeight - 104 : previewY - 20;
    this.viewfinderTargetLabelOffsetY = isSeabedStation ? -108 : 112;
    const previewPhotos = this.getViewfinderPhotos(target.id).flatMap((spec) => {
      const image = this.addHistoricalPhoto(
        spec.key,
        targetX + spec.offsetX,
        targetY + spec.offsetY,
        spec.width,
        spec.height,
        2806,
      );
      if (image === null) return [];
      image.setDepth(2806);
      const initialX = targetX + spec.offsetX;
      const initialY = targetY + spec.offsetY;
      const imageBaseX = image.x;
      const imageBaseY = image.y;
      const grounded = spec.grounded === true;
      const frameKeys = this.getCreatureDisplayFrameKeys(spec.speciesId);
      const framePlan = getCreatureFramePlan(spec.speciesId);
      // Every fish keeps one stable facing direction while its supplied body-
      // motion frames play. Positional drift is deliberately secondary, so
      // the animal no longer looks like a rigid cutout sliding sideways.
      image.setFlipX(this.shouldFlipViewfinderSpecies(spec.speciesId));
      return [
        {
          image,
          speciesId: spec.speciesId,
          x: initialX,
          y: initialY,
          originX: initialX,
          originY: initialY,
          imageBaseX,
          imageBaseY,
          floatTime: Phaser.Math.FloatBetween(0, Math.PI * 2),
          floatPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
          floatSpeed: Phaser.Math.FloatBetween(0.65, 1.05),
          floatWidth: grounded
            ? 0
            : spec.target === true
              ? Phaser.Math.FloatBetween(28, 40)
              : Phaser.Math.FloatBetween(12, 24),
          floatHeight: grounded
            ? 0
            : spec.target === true
              ? Phaser.Math.FloatBetween(3, 8)
              : Phaser.Math.FloatBetween(6, 14),
          swayAngle: grounded ? 0 : Phaser.Math.FloatBetween(1.5, 3.5),
          grounded,
          isTarget: spec.target === true,
          frameKeys,
          frameDurationMs: framePlan?.frameDurationMs ?? 0,
          frameElapsedMs: Phaser.Math.Between(0, Math.max(1, framePlan?.frameDurationMs ?? 1)),
          frameIndex: 0,
        },
      ];
    });
    const crosshair = this.add
      .circle(targetX, targetY, 72, 0x3fd0c9, 0.03)
      .setStrokeStyle(3, 0x9cf7ef, 0.9)
      .setDepth(2807);
    const crosshairLines = this.add.graphics().setDepth(2807);
    crosshairLines.lineStyle(2, 0x9cf7ef, 0.75);
    crosshairLines.lineBetween(targetX - 112, targetY, targetX - 40, targetY);
    crosshairLines.lineBetween(targetX + 40, targetY, targetX + 112, targetY);
    crosshairLines.lineBetween(targetX, targetY - 112, targetX, targetY - 40);
    crosshairLines.lineBetween(targetX, targetY + 40, targetX, targetY + 112);
    const missionBanner = this.add
      .text(previewX, previewTop + 22, i18n.t('dive.viewfinderMissionStation'), {
        fontFamily: 'sans-serif',
        fontSize: '23px',
        color: '#fff3b0',
        backgroundColor: '#4a391bdd',
        padding: { x: 14, y: 7 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(2808);
    const targetLabel = this.add
      .text(
        targetX,
        targetY + this.viewfinderTargetLabelOffsetY,
        i18n.t('dive.viewfinderReferenceSubject').replace('{species}', targetSpeciesLabel),
        {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#d8fffb',
          backgroundColor: '#062432cc',
          padding: { x: 10, y: 6 },
          align: 'center',
        },
      )
      .setOrigin(0.5)
      .setDepth(2807);

    const quality = this.getViewfinderQuality(target.distance);
    const qualityText = this.add
      .text(cx, bottom - 48, i18n.t(quality.qualityKey), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: quality.color,
        align: 'center',
        wordWrap: { width: 760, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const controlY = bottom + 34;
    const controlLegend = this.createViewfinderControlLegend(controlY);
    const status = this.add
      .text(right - 32, top + 61, `${Math.round(target.distance)} px`, {
        fontFamily: 'sans-serif',
        fontSize: '14px',
        color: Palette.textMuted,
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(2804);

    this.viewfinderAimX = 0;
    this.viewfinderAimY = 0;
    this.viewfinderAimOrigin = { x: targetX, y: targetY };
    this.viewfinderFocusPhotos = previewPhotos;
    const initialQuality = this.getViewfinderQuality(this.getCurrentViewfinderDistance());
    qualityText.setText(i18n.t(initialQuality.qualityKey)).setColor(initialQuality.color);
    this.viewfinderAimBounds = {
      left: previewLeft + 92,
      right: previewLeft + previewWidth - 92,
      top: previewTop + 92,
      bottom: previewTop + previewHeight - 92,
    };
    this.viewfinderCrosshair = crosshair;
    this.viewfinderCrosshairLines = crosshairLines;
    this.viewfinderTargetLabel = targetLabel;
    this.viewfinderQualityText = qualityText;

    this.viewfinderObjects = [
      dim,
      frame,
      corners,
      headerBar,
      headerRule,
      title,
      captureTag,
      liveTag,
      referenceCard,
      currentTargetTitle,
      currentTargetName,
      referenceDivider,
      referenceBadge,
      referenceTitle,
      previewFrame,
      ...previewEnvironment,
      liveBadge,
      locationBadge,
      liveHint,
      missionBanner,
      crosshair,
      crosshairLines,
      targetLabel,
      qualityText,
      ...controlLegend,
      status,
    ];
    if (currentTargetImage !== null) this.viewfinderObjects.push(currentTargetImage);
    if (referenceImage !== null) this.viewfinderObjects.push(referenceImage);
    for (const previewPhoto of previewPhotos) this.viewfinderObjects.push(previewPhoto.image);
    this.sharpenVisibleText();
  }

  /** Camera mode for the organism step, with the requested animal kept visible. */
  public openSubjectViewfinder(stationId: string, speciesId: string): void {
    if (this.mapView === null) return;
    const position = this.diver.getPosition();
    const target = this.mapView.getNearestPhotographableSubject(position.x, position.y, speciesId);
    const textureKey = this.getReportSpeciesTextureKey(speciesId);
    if (target === null || textureKey === null) {
      this.showStatus(i18n.t('dive.subjectViewfinderNoTarget'));
      return;
    }

    this.viewfinderOpen = true;
    this.viewfinderTarget = {
      kind: 'subject',
      id: speciesId,
      stationId,
      speciesId,
      displayName: target.label,
      distance: target.distance,
    };
    this.actionWasDown = true;

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const frameWidth = 1420;
    const frameHeight = 740;
    const left = cx - frameWidth / 2;
    const right = cx + frameWidth / 2;
    const top = cy - frameHeight / 2;
    const bottom = cy + frameHeight / 2;
    const dim = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.9)
      .setOrigin(0)
      .setDepth(2800);
    const frame = this.add
      .rectangle(cx, cy, frameWidth, frameHeight, 0x061923, 0.99)
      .setStrokeStyle(3, Palette.accent, 0.9)
      .setDepth(2801);
    const headerBar = this.add
      .rectangle(cx, top + 45, frameWidth - 14, 70, 0x0b2b3b, 0.98)
      .setStrokeStyle(1, 0x3fd0c9, 0.42)
      .setDepth(2802);
    const captureTag = this.add
      .text(left + 34, top + 34, 'CAPTURE / ORGANISM', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(2804);
    const title = this.add
      .text(cx, top + 43, i18n.t('dive.organismViewfinderTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '31px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const liveTag = this.add
      .text(right - 34, top + 34, '● LIVE', {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#91e6a7',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0)
      .setDepth(2804);

    const targetCardX = left + 170;
    const targetCard = this.add
      .rectangle(targetCardX, top + 354, 282, 500, 0x123c50, 0.98)
      .setStrokeStyle(2, 0xf0c95a, 0.74)
      .setDepth(2802);
    const targetCardEyebrow = this.add
      .text(targetCardX, top + 126, i18n.t('dive.guidanceTarget'), {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const targetCardImage = this.addHistoricalPhoto(
      textureKey,
      targetCardX,
      top + 250,
      220,
      150,
      2804,
    );
    const targetCardName = this.add
      .text(targetCardX, top + 356, target.label, {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 230, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const targetCardHint = this.add
      .text(targetCardX, top + 452, i18n.t('dive.organismViewfinderTargetHint'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#d8fffb',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 230, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);

    const previewLeft = left + 330;
    const previewTop = top + 82;
    const previewWidth = 1015;
    const previewHeight = 555;
    const previewX = previewLeft + previewWidth / 2;
    const previewY = previewTop + previewHeight / 2;
    const previewFrame = this.add
      .rectangle(previewX, previewY, previewWidth, previewHeight, 0x0c3a4c, 0.98)
      .setStrokeStyle(2, 0x3fd0c9, 0.82)
      .setDepth(2802);
    const previewEnvironment = this.createViewfinderEnvironment(
      stationId,
      previewLeft + 4,
      previewTop + 4,
      previewWidth - 8,
      previewHeight - 8,
      2803,
    );
    const missionBanner = this.add
      .text(previewX, previewTop + 22, i18n.t('dive.organismViewfinderMission'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#fff3b0',
        backgroundColor: '#4a391bdd',
        padding: { x: 14, y: 7 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setDepth(2808);

    const grounded = speciesId === 'sea-cucumber' || speciesId === 'tube-sponge';
    const targetX = previewX;
    const targetY = grounded ? previewTop + previewHeight - 116 : previewY + 8;
    const previewTarget = this.addHistoricalPhoto(
      textureKey,
      targetX,
      targetY,
      grounded ? 330 : 360,
      grounded ? 184 : 225,
      2806,
    );
    if (previewTarget === null) {
      this.closeViewfinder();
      this.showStatus(i18n.t('dive.subjectViewfinderNoTarget'));
      return;
    }
    const targetFrameKeys = this.getCreatureDisplayFrameKeys(speciesId);
    const targetFramePlan = getCreatureFramePlan(speciesId);
    previewTarget.setFlipX(this.shouldFlipViewfinderSpecies(speciesId));

    // Keep the rest of the station alive in the organism close-up as well.
    // Background fish use their own frame sequences instead of becoming
    // static scenery while the target alone moves.
    const ambientPreviewPhotos = this.getViewfinderPhotos(stationId).flatMap((spec) => {
      if (spec.speciesId === speciesId || spec.grounded === true) return [];
      const imageX = previewX + spec.offsetX * 0.9;
      const imageY = previewY + spec.offsetY * 0.9;
      const image = this.addHistoricalPhoto(
        spec.key,
        imageX,
        imageY,
        spec.width,
        spec.height,
        2805,
      );
      if (image === null) return [];
      const frameKeys = this.getCreatureDisplayFrameKeys(spec.speciesId);
      const framePlan = getCreatureFramePlan(spec.speciesId);
      image.setFlipX(this.shouldFlipViewfinderSpecies(spec.speciesId)).setAlpha(0.9);
      return [
        {
          image,
          speciesId: spec.speciesId,
          x: imageX,
          y: imageY,
          originX: imageX,
          originY: imageY,
          imageBaseX: image.x,
          imageBaseY: image.y,
          floatTime: Phaser.Math.FloatBetween(0, Math.PI * 2),
          floatPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
          floatSpeed: Phaser.Math.FloatBetween(0.68, 0.92),
          floatWidth: Phaser.Math.FloatBetween(10, 22),
          floatHeight: Phaser.Math.FloatBetween(4, 10),
          swayAngle: Phaser.Math.FloatBetween(1.2, 2.6),
          grounded: false,
          isTarget: false,
          frameKeys,
          frameDurationMs: framePlan?.frameDurationMs ?? 0,
          frameElapsedMs: Phaser.Math.Between(0, Math.max(1, framePlan?.frameDurationMs ?? 1)),
          frameIndex: 0,
        },
      ];
    });
    const crosshair = this.add
      .circle(targetX, targetY, 82, 0x3fd0c9, 0.03)
      .setStrokeStyle(3, 0x9cf7ef, 0.9)
      .setDepth(2807);
    const crosshairLines = this.add.graphics().setDepth(2807);
    crosshairLines.lineStyle(2, 0x9cf7ef, 0.75);
    crosshairLines.lineBetween(targetX - 126, targetY, targetX - 48, targetY);
    crosshairLines.lineBetween(targetX + 48, targetY, targetX + 126, targetY);
    crosshairLines.lineBetween(targetX, targetY - 126, targetX, targetY - 48);
    crosshairLines.lineBetween(targetX, targetY + 48, targetX, targetY + 126);
    this.viewfinderTargetLabelOffsetY = grounded ? -108 : 118;
    const targetLabel = this.add
      .text(
        targetX,
        targetY + this.viewfinderTargetLabelOffsetY,
        `${i18n.t('dive.guidanceTarget')}\n${target.label}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '22px',
          color: '#fff3b0',
          backgroundColor: '#4a391bdd',
          padding: { x: 12, y: 7 },
          align: 'center',
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setDepth(2808);
    const qualityText = this.add
      .text(cx, bottom - 48, inputPrompt(this, 'dive.organismViewfinderReady'), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#91e6a7',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(2804);

    const controlY = bottom + 34;
    const controlLegend = this.createViewfinderControlLegend(controlY);

    this.viewfinderAimX = 0;
    this.viewfinderAimY = 0;
    this.viewfinderAimOrigin = { x: targetX, y: targetY };
    this.viewfinderAimBounds = {
      left: previewLeft + 92,
      right: previewLeft + previewWidth - 92,
      top: previewTop + 92,
      bottom: previewTop + previewHeight - 92,
    };
    this.viewfinderFocusPhotos = [
      {
        image: previewTarget,
        speciesId,
        x: targetX,
        y: targetY,
        originX: targetX,
        originY: targetY,
        imageBaseX: previewTarget.x,
        imageBaseY: previewTarget.y,
        floatTime: Phaser.Math.FloatBetween(0, Math.PI * 2),
        floatPhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        floatSpeed: 0.72,
        floatWidth: grounded ? 0 : 18,
        floatHeight: grounded ? 0 : 7,
        swayAngle: grounded ? 0 : 2,
        grounded,
        isTarget: true,
        frameKeys: targetFrameKeys,
        frameDurationMs: targetFramePlan?.frameDurationMs ?? 0,
        frameElapsedMs: Phaser.Math.Between(0, Math.max(1, targetFramePlan?.frameDurationMs ?? 1)),
        frameIndex: 0,
      },
      ...ambientPreviewPhotos,
    ];
    this.viewfinderCrosshair = crosshair;
    this.viewfinderCrosshairLines = crosshairLines;
    this.viewfinderTargetLabel = targetLabel;
    this.viewfinderQualityText = qualityText;
    this.viewfinderObjects = [
      dim,
      frame,
      headerBar,
      captureTag,
      title,
      liveTag,
      targetCard,
      targetCardEyebrow,
      targetCardName,
      targetCardHint,
      previewFrame,
      ...previewEnvironment,
      missionBanner,
      ...ambientPreviewPhotos.map((photo) => photo.image),
      previewTarget,
      crosshair,
      crosshairLines,
      targetLabel,
      qualityText,
      ...controlLegend,
    ];
    if (targetCardImage !== null) this.viewfinderObjects.push(targetCardImage);
    this.sharpenVisibleText();
  }

  private createViewfinderControlLegend(y: number): Phaser.GameObjects.GameObject[] {
    const cx = GAME_WIDTH / 2;
    if (this.inputManager.usesTouchControls()) {
      return [
        this.add
          .text(cx, y, inputPrompt(this, 'dive.viewfinderControls'), {
            fontFamily: 'sans-serif',
            fontSize: '21px',
            color: Palette.textLight,
            fontStyle: 'bold',
            align: 'center',
            wordWrap: { width: 1120, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(2804),
      ];
    }

    const aimKeycaps = this.createViewfinderMovementKeycaps(cx - 570, y);
    const aimControl = this.add
      .text(cx - 310, y, i18n.t('dive.viewfinderAimControl'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(2804);
    const shutterKeycap = this.createViewfinderKeycap(cx + 5, y, 'SPACE');
    const shutterControl = this.add
      .text(cx + 76, y, i18n.t('dive.viewfinderShutterControl'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: '#fff3a8',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(2804);
    const exitKeycap = this.createViewfinderKeycap(cx + 390, y, 'ESC');
    const exitControl = this.add
      .text(cx + 468, y, i18n.t('dive.viewfinderExitControl'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(2804);
    return [...aimKeycaps, aimControl, shutterKeycap, shutterControl, exitKeycap, exitControl];
  }

  private createViewfinderKeycap(x: number, y: number, label: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#17313b',
        backgroundColor: '#f0c95a',
        padding: { x: 13, y: 10 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(2804);
  }

  private createViewfinderMovementKeycaps(left: number, y: number): Phaser.GameObjects.Text[] {
    return ['W ↑', 'A ←', 'S ↓', 'D →'].map((label, index) =>
      this.createViewfinderKeycap(left + index * 64, y, label),
    );
  }

  private captureViewfinder(): void {
    if (this.mapView === null || this.viewfinderTarget === null) return;
    if (!this.isViewfinderTargetAligned()) {
      this.viewfinderQualityText?.setText(i18n.t('dive.viewfinderAimRequired')).setColor('#ffb09d');
      if (this.viewfinderCrosshair !== null) {
        this.tweens.add({
          targets: this.viewfinderCrosshair,
          scale: 1.14,
          duration: 120,
          yoyo: true,
          repeat: 1,
        });
      }
      return;
    }
    const task = getDiveFieldTask(this.fieldTaskIndex);
    if (this.viewfinderTarget.kind === 'subject') {
      if (task?.kind !== 'subject' || task.speciesId !== this.viewfinderTarget.speciesId) {
        this.closeViewfinder();
        this.showStatus(i18n.t('dive.guidanceFollowCurrentTask'));
        return;
      }
      const interaction = this.mapView.tryPhotographSubject(
        this.diver.getPosition().x,
        this.diver.getPosition().y,
        task.speciesId,
      );
      if (interaction === null) {
        this.closeViewfinder();
        this.showStatus(i18n.t('dive.subjectViewfinderNoTarget'));
        return;
      }
      const species = this.getSpeciesLabel(task.speciesId);
      this.closeViewfinder();
      this.cameras.main.flash(140, 255, 255, 255);
      this.playShutterSound();
      this.advanceFieldTask();
      this.showStatus(i18n.t('dive.guidanceSubjectComplete').replace('{species}', species));
      return;
    }
    if (task?.kind !== 'station' || task.stationId !== this.viewfinderTarget.id) {
      this.closeViewfinder();
      this.showStatus(i18n.t('dive.guidanceFollowCurrentTask'));
      return;
    }
    const quality = this.getViewfinderQuality(this.getCurrentViewfinderDistance());
    const stationId = this.mapView.tryPhotographStation(
      this.diver.getPosition().x,
      this.diver.getPosition().y,
      task.stationId,
    );
    if (stationId === null) {
      this.closeViewfinder();
      this.showStatus(i18n.t('dive.viewfinderNoTarget'));
      return;
    }

    this.closeViewfinder();
    this.cameras.main.flash(140, 255, 255, 255);
    this.playShutterSound();
    const location = i18n.t(`dive.station${task.stationNumber}`);
    this.advanceFieldTask();
    const nextTask = getDiveFieldTask(this.fieldTaskIndex);
    const nextInstruction =
      nextTask?.kind === 'subject'
        ? i18n
            .t(
              this.inputManager.usesTouchControls()
                ? 'dive.viewfinderStationSavedNextSubject.touch'
                : 'dive.viewfinderStationSavedNextSubject',
            )
            .replace('{species}', this.getSpeciesLabel(nextTask.speciesId))
        : '';
    this.showStatus(
      `${i18n.t(quality.captureKey)} ${i18n
        .t('dive.guidanceStationComplete')
        .replace(
          '{location}',
          location,
        )}${nextInstruction.length > 0 ? `\n${nextInstruction}` : ''}`,
    );
  }

  private closeViewfinder(): void {
    for (const object of this.viewfinderObjects) object.destroy();
    this.viewfinderObjects = [];
    this.viewfinderFocusPhotos = [];
    this.viewfinderCrosshair = null;
    this.viewfinderCrosshairLines = null;
    this.viewfinderTargetLabel = null;
    this.viewfinderQualityText = null;
    this.viewfinderTargetLabelOffsetY = 112;
    this.viewfinderOpen = false;
    this.viewfinderTarget = null;
    this.actionWasDown = false;
    this.cancelWasDown = false;
  }

  private updateViewfinderAim(input: { x: number; y: number }, delta: number): void {
    if (
      this.viewfinderTarget === null ||
      this.viewfinderCrosshair === null ||
      this.viewfinderCrosshairLines === null ||
      this.viewfinderTargetLabel === null
    )
      return;

    const speed = Math.min(delta, 32) * 0.34;
    this.viewfinderAimX = Phaser.Math.Clamp(
      this.viewfinderAimX + input.x * speed,
      this.viewfinderAimBounds.left - this.viewfinderAimOrigin.x,
      this.viewfinderAimBounds.right - this.viewfinderAimOrigin.x,
    );
    this.viewfinderAimY = Phaser.Math.Clamp(
      this.viewfinderAimY + input.y * speed,
      this.viewfinderAimBounds.top - this.viewfinderAimOrigin.y,
      this.viewfinderAimBounds.bottom - this.viewfinderAimOrigin.y,
    );
    const focusX = this.viewfinderAimOrigin.x + this.viewfinderAimX;
    const focusY = this.viewfinderAimOrigin.y + this.viewfinderAimY;

    this.viewfinderCrosshair.setPosition(focusX, focusY);
    this.viewfinderCrosshairLines.setPosition(this.viewfinderAimX, this.viewfinderAimY);
    this.viewfinderTargetLabel.setPosition(focusX, focusY + this.viewfinderTargetLabelOffsetY);

    if (this.viewfinderQualityText !== null) {
      const quality = this.getViewfinderQuality(this.getCurrentViewfinderDistance());
      this.viewfinderQualityText.setText(i18n.t(quality.qualityKey)).setColor(quality.color);
    }
  }

  private getCurrentViewfinderDistance(): number {
    if (this.viewfinderTarget === null) return 999;
    const focusX = this.viewfinderAimOrigin.x + this.viewfinderAimX;
    const focusY = this.viewfinderAimOrigin.y + this.viewfinderAimY;
    const referenceSubject = this.viewfinderFocusPhotos.find((photo) => photo.isTarget);
    if (referenceSubject === undefined) return this.viewfinderTarget.distance + 240;
    const centerDistance = Phaser.Math.Distance.Between(
      focusX,
      focusY,
      referenceSubject.x,
      referenceSubject.y,
    );
    const referenceRadius =
      Math.max(referenceSubject.image.displayWidth, referenceSubject.image.displayHeight) / 2;
    // This subject is a framing reference within the fixed-station comparison
    // photo. Recording the organism remains a separate action outside the
    // viewfinder.
    const subjectError = Math.max(0, centerDistance - referenceRadius * 0.35);
    return this.viewfinderTarget.distance + subjectError * 1.8;
  }

  private isViewfinderTargetAligned(): boolean {
    const referenceSubject = this.viewfinderFocusPhotos.find((photo) => photo.isTarget);
    if (referenceSubject === undefined) return false;
    const focusX = this.viewfinderAimOrigin.x + this.viewfinderAimX;
    const focusY = this.viewfinderAimOrigin.y + this.viewfinderAimY;
    const referenceRadius =
      Math.max(referenceSubject.image.displayWidth, referenceSubject.image.displayHeight) / 2;
    // The reticle must visibly overlap the subject, not merely be somewhere
    // near a large sprite's bounding box.
    const allowedOffset = Math.max(34, Math.min(46, referenceRadius * 0.32));
    return (
      Phaser.Math.Distance.Between(focusX, focusY, referenceSubject.x, referenceSubject.y) <=
      allowedOffset
    );
  }

  private updateViewfinderFish(delta: number): void {
    for (const fish of this.viewfinderFocusPhotos) {
      if (fish.frameKeys.length > 1 && fish.frameDurationMs > 0) {
        fish.frameElapsedMs += delta;
        const nextFrame =
          Math.floor(fish.frameElapsedMs / fish.frameDurationMs) % fish.frameKeys.length;
        if (nextFrame !== fish.frameIndex) {
          fish.frameIndex = nextFrame;
          const nextTextureKey = fish.frameKeys[nextFrame];
          if (nextTextureKey !== undefined) fish.image.setTexture(nextTextureKey);
        }
      }
      fish.floatTime += (delta / 1000) * fish.floatSpeed;
      fish.x = fish.originX + Math.sin(fish.floatTime + fish.floatPhase) * fish.floatWidth;
      fish.y = fish.grounded
        ? fish.originY
        : fish.originY + Math.sin(fish.floatTime * 0.82 + fish.floatPhase) * fish.floatHeight;
      // Keep the visual center and the aim point together while the preview
      // fish drift gently, so the quality calculation follows the artwork.
      fish.image.setPosition(
        fish.imageBaseX + fish.x - fish.originX,
        fish.imageBaseY + fish.y - fish.originY,
      );
      fish.image.setAngle(
        fish.grounded ? 0 : Math.sin(fish.floatTime * 0.88 + fish.floatPhase) * fish.swayAngle,
      );
    }
  }

  private createViewfinderEnvironment(
    stationId: string,
    left: number,
    top: number,
    width: number,
    height: number,
    depth: number,
    showContextLabel = true,
  ): Phaser.GameObjects.GameObject[] {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const right = left + width;
    const bottom = top + height;

    if (stationId.endsWith('1')) {
      if (this.textures.exists('chapter1-distant-reef-background')) {
        objects.push(
          this.add
            .image(left + width / 2, top + height / 2, 'chapter1-distant-reef-background')
            .setDisplaySize(width, height)
            .setAlpha(0.92)
            .setDepth(depth),
        );
      }
      const bay = this.add.graphics().setDepth(depth + 1);
      bay.fillStyle(0x0a5268, 0.14);
      bay.fillRect(left, top, width, height);
      bay.fillStyle(0xb2a879, 0.44);
      bay.beginPath();
      bay.moveTo(left, bottom - 96);
      bay.lineTo(left + width * 0.34, bottom - 126);
      bay.lineTo(left + width * 0.68, bottom - 104);
      bay.lineTo(right, bottom - 140);
      bay.lineTo(right, bottom);
      bay.lineTo(left, bottom);
      bay.closePath();
      bay.fillPath();
      bay.fillStyle(0x223f47, 0.88);
      bay.fillEllipse(left + 118, bottom - 84, 170, 66);
      bay.fillEllipse(right - 130, bottom - 102, 220, 78);
      bay.lineStyle(7, 0x267b66, 0.78);
      for (const grassX of [left + 238, left + 300, right - 320]) {
        bay.lineBetween(grassX, bottom - 45, grassX - 10, bottom - 125);
        bay.lineBetween(grassX + 18, bottom - 46, grassX + 28, bottom - 108);
        bay.lineBetween(grassX + 34, bottom - 44, grassX + 18, bottom - 142);
      }
      objects.push(bay);
    } else if (stationId.endsWith('2')) {
      // The raft-edge station looks into the net-cage water column. There is
      // deliberately no visible seabed in this frame.
      const cage = this.add.graphics().setDepth(depth);
      cage.fillGradientStyle(0x1a7682, 0x155d70, 0x062b3e, 0x041b2a, 1);
      cage.fillRect(left, top, width, height);
      cage.fillStyle(0x020b12, 0.35);
      cage.fillRect(left, top, width, 82);
      cage.fillStyle(0x765338, 0.96);
      cage.fillRoundedRect(left + 80, top + 24, width - 160, 34, 8);
      cage.fillStyle(0xd99036, 0.92);
      cage.fillRoundedRect(left + 104, top + 57, width - 208, 16, 8);

      const netLeft = left + width * 0.52;
      const netRight = right - 46;
      const netTop = top + 74;
      const netBottom = bottom - 32;
      cage.fillStyle(0x092838, 0.22);
      cage.fillTriangle(netLeft, netTop, netRight, netTop, netRight - 52, netBottom);
      cage.fillTriangle(netLeft, netTop, netRight - 52, netBottom, netLeft + 42, netBottom);
      cage.lineStyle(3, 0xa7d7d3, 0.48);
      cage.lineBetween(netLeft, netTop, netLeft + 42, netBottom);
      cage.lineBetween(netRight, netTop, netRight - 52, netBottom);
      cage.lineBetween(netLeft + 42, netBottom, netRight - 52, netBottom);
      for (let x = netLeft + 28; x < netRight; x += 42) {
        const lowerX = Phaser.Math.Linear(
          netLeft + 42,
          netRight - 52,
          (x - netLeft) / (netRight - netLeft),
        );
        cage.lineBetween(x, netTop, lowerX, netBottom);
      }
      for (let y = netTop + 34; y < netBottom; y += 38) {
        const inset = (y - netTop) * 0.075;
        cage.lineBetween(netLeft + inset, y, netRight - inset, y);
      }
      cage.fillStyle(0xc6e7e1, 0.28);
      for (let i = 0; i < 38; i += 1) {
        cage.fillCircle(
          left + ((i * 127) % Math.floor(width)),
          top + 90 + ((i * 67) % Math.floor(height - 120)),
          1.5 + (i % 3),
        );
      }
      objects.push(cage);
    } else {
      if (this.textures.exists('chapter1-distant-reef-background')) {
        objects.push(
          this.add
            .image(left + width / 2, top + height / 2, 'chapter1-distant-reef-background')
            .setDisplaySize(width, height)
            .setTint(0x9bc7b3)
            .setAlpha(0.74)
            .setDepth(depth),
        );
      }
      const innerBay = this.add.graphics().setDepth(depth + 1);
      innerBay.fillStyle(0x557f71, 0.18);
      innerBay.fillRect(left, top, width, height);
      innerBay.fillStyle(0xb9ab72, 0.78);
      innerBay.beginPath();
      innerBay.moveTo(left, bottom - 205);
      for (let x = left; x <= right; x += 82) {
        innerBay.lineTo(x, bottom - 198 + Math.sin(x * 0.021) * 11);
      }
      innerBay.lineTo(right, bottom);
      innerBay.lineTo(left, bottom);
      innerBay.closePath();
      innerBay.fillPath();
      innerBay.lineStyle(3, 0xe4dca8, 0.5);
      innerBay.lineBetween(left, bottom - 194, right, bottom - 194);
      innerBay.fillStyle(0x41594c, 0.88);
      innerBay.fillEllipse(left + 190, bottom - 120, 176, 56);
      innerBay.fillEllipse(right - 190, bottom - 86, 206, 62);
      innerBay.lineStyle(8, 0x24755f, 0.9);
      for (const grassX of [left + 96, left + 342, right - 295, right - 82]) {
        innerBay.lineBetween(grassX, bottom - 18, grassX - 18, bottom - 132);
        innerBay.lineBetween(grassX + 20, bottom - 18, grassX + 36, bottom - 152);
        innerBay.lineBetween(grassX + 42, bottom - 18, grassX + 22, bottom - 112);
      }
      objects.push(innerBay);
    }

    const contextLabel = stationId.endsWith('1')
      ? i18n.getLocale() === 'en'
        ? 'BAY ENTRANCE · OPEN WATER'
        : '灣口 · 開闊水體'
      : stationId.endsWith('2')
        ? i18n.getLocale() === 'en'
          ? 'RAFT EDGE · NET-CAGE WATER'
          : '魚排邊 · 網箱水體'
        : i18n.getLocale() === 'en'
          ? 'INNER BAY · SHALLOW SEABED'
          : '內灣 · 淺海床';
    if (showContextLabel) {
      objects.push(
        this.add
          .text(right - 20, top + 18, contextLabel, {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#d8fffb',
            backgroundColor: '#062432b8',
            padding: { x: 9, y: 5 },
          })
          .setOrigin(1, 0)
          .setDepth(depth + 3),
      );
    }
    return objects;
  }

  private getViewfinderTargetSpeciesId(stationId: string): string {
    return getRequiredSpeciesForStation(stationId) ?? 'sea-cucumber';
  }

  private getCreatureDisplayFrameKeys(speciesId: string): readonly string[] {
    const framePlan = getCreatureFramePlan(speciesId);
    if (framePlan === null) return [];
    const needsEdgeCleanup =
      speciesId === 'blue-damselfish' ||
      speciesId === 'silver-reef-fish' ||
      speciesId === 'tube-sponge';
    const preparedFrameKeys = framePlan.indices.flatMap((index) => {
      const sourceKey = `chapter1-subject-${speciesId}-frame-${String(index).padStart(2, '0')}`;
      if (!this.textures.exists(sourceKey)) return [];
      if (!needsEdgeCleanup) return [sourceKey];
      const outputKey = `${sourceKey}-edge-transparent`;
      return ensureEdgeTransparentTexture(this, sourceKey, outputKey) &&
        this.textures.exists(outputKey)
        ? [outputKey]
        : [];
    });
    return ensureNormalizedTextureSequence(this, preparedFrameKeys, `${speciesId}-stable-body`);
  }

  private shouldFlipViewfinderSpecies(speciesId: string): boolean {
    // The replacement blue fish, grouper and goby frames face left. Mirror
    // those once so every live-preview fish swims toward the right. The new
    // silver frames already face right.
    return (
      speciesId === 'blue-damselfish' || speciesId === 'reef-grouper' || speciesId === 'hardy-goby'
    );
  }

  private getViewfinderPhotos(stationId: string): ViewfinderPhotoSpec[] {
    const textureFor = (speciesId: string): { speciesId: string; key: string } => ({
      speciesId,
      key: this.getReportSpeciesTextureKey(speciesId) ?? `chapter1-subject-${speciesId}`,
    });
    const blue = textureFor('blue-damselfish');
    const grouper = textureFor('reef-grouper');
    const goby = textureFor('hardy-goby');
    const silver = textureFor('silver-reef-fish');
    const cucumber = textureFor('sea-cucumber');

    if (stationId.endsWith('1')) {
      return [
        { ...blue, offsetX: 0, offsetY: 0, width: 278, height: 154, target: true },
        { ...silver, offsetX: -250, offsetY: 68, width: 182, height: 98 },
        { ...goby, offsetX: 312, offsetY: 90, width: 150, height: 76 },
      ];
    }
    if (stationId.endsWith('2')) {
      return [
        { ...grouper, offsetX: 0, offsetY: 0, width: 286, height: 158, target: true },
        { ...goby, offsetX: -250, offsetY: -82, width: 164, height: 84 },
        { ...silver, offsetX: 232, offsetY: -116, width: 154, height: 82 },
      ];
    }
    return [
      {
        ...cucumber,
        offsetX: 0,
        offsetY: 0,
        width: 212,
        height: 108,
        target: true,
        grounded: true,
      },
      { ...silver, offsetX: -272, offsetY: -184, width: 176, height: 94 },
    ];
  }

  private getViewfinderQuality(distance: number): {
    qualityKey: string;
    captureKey: string;
    color: string;
  } {
    if (distance <= 150) {
      return {
        qualityKey: 'dive.viewfinderQualityExcellent',
        captureKey: 'dive.viewfinderCaptureExcellent',
        color: '#91e6a7',
      };
    }
    if (distance <= 210) {
      return {
        qualityKey: 'dive.viewfinderQualityGood',
        captureKey: 'dive.viewfinderCaptureGood',
        color: '#f0c95a',
      };
    }
    return {
      qualityKey: 'dive.viewfinderQualityFair',
      captureKey: 'dive.viewfinderCaptureFair',
      color: '#f2a679',
    };
  }

  private getHistoricalPhotoForStation(stationId: string): { key: string } | null {
    const key = historicalPhotoKeyForStation(stationId);
    return key === null ? null : { key };
  }

  private sharpenVisibleText(): void {
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    for (const object of this.children.list) {
      if (object instanceof Phaser.GameObjects.Text) object.setResolution(resolution);
    }
  }

  private addHistoricalPhoto(
    key: string,
    x: number,
    y: number,
    maxWidth: number,
    maxHeight: number,
    depth: number,
  ): Phaser.GameObjects.Image | null {
    if (!this.textures.exists(key)) return null;
    const source = this.textures.get(key).getSourceImage();
    const scale = Math.min(maxWidth / source.width, maxHeight / source.height);
    return this.add
      .image(x, y, key)
      .setDisplaySize(source.width * scale, source.height * scale)
      .setDepth(depth);
  }

  private pulseTextAction(button: Phaser.GameObjects.Text): void {
    if (button.getData('cta-pulse') === true) return;
    button.setData('cta-pulse', true);
    this.tweens.add({
      targets: button,
      alpha: { from: 0.72, to: 1 },
      duration: 620,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private playNarrationCue(
    cue: NarrationCueId,
    highlightTarget: Phaser.GameObjects.GameObject,
    options: {
      readonly automatic?: boolean;
      readonly hideHighlightWhenIdle?: boolean;
      readonly onComplete?: () => void;
      readonly onError?: () => void;
    } = {},
  ): boolean {
    const target = highlightTarget as Phaser.GameObjects.GameObject & {
      setAlpha(value: number): Phaser.GameObjects.GameObject;
      setVisible(value: boolean): Phaser.GameObjects.GameObject;
    };
    const stopPulse = (): void => {
      this.tweens.killTweensOf(target);
      target.setAlpha(1);
      if (options.hideHighlightWhenIdle === true) target.setVisible(false);
    };
    const accepted = narrationService.play(cue, {
      automatic: options.automatic,
      onStart: () => {
        target.setVisible(true);
        target.setAlpha(0.42);
        this.tweens.add({
          targets: target,
          alpha: { from: 0.42, to: 1 },
          duration: 560,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      },
      onComplete: () => {
        stopPulse();
        options.onComplete?.();
      },
      onError: () => {
        stopPulse();
        options.onError?.();
      },
      onStop: () => {
        stopPulse();
        options.onError?.();
      },
    });
    if (!accepted) stopPulse();
    return accepted;
  }

  private destroyOverlay(): void {
    this.destroyLessonOverlay();
    this.foodWebPuzzle?.destroy();
    this.foodWebPuzzle = null;
    for (const object of this.overlayObjects) object.destroy();
    this.overlayObjects = [];
    this.foodWebNarrationHighlight = null;
    this.foodWebNarrationButton = null;
  }

  private destroyLessonOverlay(): void {
    for (const timer of this.lessonOverlayTimers) timer.remove(false);
    this.lessonOverlayTimers = [];
    narrationService.stop();
    for (const object of this.lessonOverlayObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.lessonOverlayObjects = [];
  }

  private setReportOverlayVisible(visible: boolean): void {
    if (!visible) narrationService.stop();
    for (const object of this.overlayObjects) {
      const visibleObject = object as Phaser.GameObjects.GameObject & {
        setVisible(value: boolean): Phaser.GameObjects.GameObject;
      };
      visibleObject.setVisible(visible).setActive(visible);
    }
    this.foodWebPuzzle?.setVisible(visible);
    this.foodWebNarrationHighlight?.setVisible(false);
    if (visible) this.playFoodWebNarration(true);
  }

  private playFoodWebNarration(automatic: boolean): void {
    const highlight = this.foodWebNarrationHighlight;
    const button = this.foodWebNarrationButton;
    if (highlight === null || button === null) return;
    button.setText(i18n.t('report.aiVoicePlaying')).setEnabled(false);
    const accepted = this.playNarrationCue('report-food-chain-v2', highlight, {
      automatic,
      hideHighlightWhenIdle: true,
      onComplete: () => button.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true),
      onError: () => button.setText(i18n.t('report.aiVoiceRetry')).setEnabled(true),
    });
    if (!accepted) button.setText(i18n.t('report.aiVoiceReplay')).setEnabled(true);
  }

  private selectMission(): Mission | null {
    const missions = gameState.getData().missions;
    return (
      missions.find((mission) => mission.chapter === gameState.selectedChapter) ??
      missions[0] ??
      null
    );
  }

  private selectDiveMap(mission: Mission | null): DiveMap | null {
    if (mission === null) return null;
    return (
      gameState.getData().diveMaps.find((map) => map.locationId === mission.locationId) ?? null
    );
  }

  private cleanup(): void {
    narrationService.stop();
    eventBus.off('oxygen:depleted', this.onDepleted);
    eventBus.off('station:discovered', this.onStationDiscovered);
    eventBus.off('subject:discovered', this.onSubjectDiscovered);
    eventBus.off('subject:infoRequested', this.onSubjectInfoRequested);
    this.input.keyboard?.off('keydown-ESC', this.onEscape, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDirectDragStart);
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onDirectDragMove);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onDirectDragEnd);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onDirectDragEnd);
    this.viewfinderKey?.destroy();
    this.observationReviewKey?.destroy();
    this.closeViewfinder();
    this.destroyOverlay();
    this.inputManager.destroy();
    this.diver.destroy();
    this.mapView?.destroy();
    this.atmosphere.destroy();
  }
}
