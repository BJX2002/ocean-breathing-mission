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
import { saveService } from '../services/SaveService';
import { historicalPhotoKeyForStation } from './OpeningModel';
import type { HudInteraction } from '../ui/HudModel';
import type { DiveMap, Mission } from '../types';

const EDGE_MARGIN = 70;
const VESSEL = { x: 650, y: WATER_SURFACE_Y };
const DIVER_START = { x: VESSEL.x, y: WATER_SURFACE_Y + 170 };
const REQUIRED_STATION_PHOTOS = 3;
const REQUIRED_ORGANISM_RECORDS = 3;
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
  private viewfinderTarget: { id: string; displayName: string; distance: number } | null = null;
  private viewfinderObjects: Phaser.GameObjects.GameObject[] = [];
  private viewfinderFocusPhotos: Array<{
    image: Phaser.GameObjects.Image;
    x: number;
    y: number;
    originX: number;
    originY: number;
    imageBaseX: number;
    imageBaseY: number;
    floatTime: number;
    floatPhase: number;
    floatSpeed: number;
    floatWidth: number;
    floatHeight: number;
    swayAngle: number;
    grounded: boolean;
    isTarget: boolean;
  }> = [];
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
  private doReadingTaken = false;
  private deviceNoticeShown = false;
  private mission: Mission | null = null;
  private hud!: NormalGameplayHUD;
  private reviewHintText!: Phaser.GameObjects.Text;
  private vesselRoot!: Phaser.GameObjects.Container;
  private overlayObjects: Phaser.GameObjects.GameObject[] = [];
  private lessonOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private foodWebPuzzle: FoodWebPuzzle | null = null;

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
    this.scene.start(SceneKeys.Menu);
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
    this.observedSpecies.clear();
    this.pendingObservationReview = null;
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
    }

    this.diver = new Diver(this, DIVER_START.x, DIVER_START.y);
    const budget =
      this.mission !== null && this.mission.oxygenBudget > 0 ? this.mission.oxygenBudget : 100;
    this.oxygen = new OxygenSystem(this.mission?.id ?? 'unknown', budget);

    this.inputManager = new InputManager(this);
    this.viewfinderKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E) ?? null;
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
    if (gameState.selectedChapter === 1 && !debugScreenRequested) this.showBriefing();
    this.sharpenVisibleText();
  }

  override update(_time: number, delta: number): void {
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
    if (this.viewfinderKey !== null && Phaser.Input.Keyboard.JustDown(this.viewfinderKey)) {
      if (!this.paused && !this.reportOpen) {
        if (this.viewfinderOpen) this.closeViewfinder();
        else this.openViewfinder();
      }
      return;
    }
    if (this.paused || this.reportOpen) return;

    const input = this.inputManager.getState();
    if (this.viewfinderOpen) {
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
      return;
    }

    if (!this.oxygen.isDepleted) {
      this.diver.update(delta, input, this.bounds);
      this.oxygen.update(delta, this.diver.isMoving);
      this.updateOxygenGuidance();
      const pos = this.diver.getPosition();
      this.mapView?.update(pos.x, pos.y);
      this.updateAutomaticSurveyUnit(pos.x, pos.y);
      this.updatePrompt(pos.x, pos.y);

      if (input.action && !this.actionWasDown) this.handleAction(pos.x, pos.y);
      this.updateHud(pos.x, pos.y);
    }
    this.actionWasDown = input.action;
    this.debugOverlay?.update();
  }

  private createHud(): void {
    this.hud = new NormalGameplayHUD(this);

    this.reviewHintText = this.add
      .text(GAME_WIDTH - EDGE_MARGIN, 126, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#f0c95a',
        backgroundColor: '#062838cc',
        padding: { x: 10, y: 6 },
        align: 'right',
        wordWrap: { width: 420, useAdvancedWrap: true },
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
    if (['report', 'food-chain', 'fish-oxygen', 'do'].includes(requested ?? '')) {
      this.time.delayedCall(120, () => {
        this.completeChapter1();
        if (requested === 'food-chain') this.time.delayedCall(80, () => this.showFoodChainLesson());
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
    const match = /^viewfinder([123])$/.exec(requested ?? '');
    if (match === null) return false;
    const station = map.cameraStations[Number(match[1]) - 1];
    if (station === undefined) return false;
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
  }

  private handleAction(x: number, y: number): void {
    if (this.mapView === null) return;

    if (this.mapView.getNearestPhotographableStation(x, y) !== null) {
      this.showStatus(i18n.t('dive.stationPhotoPrompt'));
      return;
    }

    const interaction = this.mapView.tryPhotographSubject(x, y);
    if (interaction !== null) {
      this.showStatus(`${i18n.t('dive.organismPhotoSaved')} ${this.mapView.recordedSubjectCount}`);
      return;
    }

    if (this.isNearVessel(x, y)) {
      if (this.isReadyToReturn()) this.completeChapter1();
      else this.showStatus(i18n.t('dive.returnIncomplete'));
      return;
    }

    this.showStatus(i18n.t('dive.observeHint'));
  }

  private updatePrompt(x: number, y: number): void {
    const stationTarget = this.mapView?.getNearestPhotographableStation(x, y);
    const stationInteraction: HudInteraction | null =
      stationTarget === null
        ? null
        : { kind: 'station', key: 'E', label: i18n.t('dive.hudEnterCamera') };
    const subjectInteraction: HudInteraction | null =
      this.mapView?.hasNearbyPhotographableSubject(x, y) === true
        ? { kind: 'subject', key: 'SPACE', label: i18n.t('dive.hudPhotograph') }
        : null;
    const vesselInteraction: HudInteraction | null = this.isNearVessel(x, y)
      ? {
          kind: 'vessel',
          key: 'SPACE',
          label: i18n.t(
            this.isReadyToReturn() ? 'dive.hudReturnReady' : 'dive.hudReturnIncomplete',
          ),
        }
      : null;
    this.hud.setInteraction(stationInteraction, subjectInteraction, vesselInteraction);
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
    const stationPhotos = this.mapView?.stationPhotoCount ?? 0;
    const organismRecords = this.mapView?.recordedSubjectCount ?? 0;
    this.hud.update({
      stationProgress: this.mapView?.getStationProgress(diverX, diverY) ?? [],
      stationPhotoCount: stationPhotos,
      stationPhotoGoal: REQUIRED_STATION_PHOTOS,
      organismCount: organismRecords,
      organismGoal: REQUIRED_ORGANISM_RECORDS,
    });
  }

  private isReadyToReturn(): boolean {
    return (
      (this.mapView?.stationPhotoCount ?? 0) >= REQUIRED_STATION_PHOTOS &&
      (this.mapView?.recordedSubjectCount ?? 0) >= REQUIRED_ORGANISM_RECORDS &&
      this.doReadingTaken
    );
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
              fontFamily: 'sans-serif', fontSize: '23px', color: '#ffe58a', fontStyle: 'bold',
            })
            .setOrigin(0.5).setDepth(3003),
        );
        add(
          this.add
            .text(oldX, cardY + 122, i18n.t('dive.storyThenBody'), {
              fontFamily: 'sans-serif', fontSize: '20px', color: Palette.textLight,
              align: 'center', wordWrap: { width: 430, useAdvancedWrap: true },
            })
            .setOrigin(0.5).setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY - 122, i18n.t('dive.storyToday'), {
              fontFamily: 'sans-serif', fontSize: '23px', color: '#9cf7ef', fontStyle: 'bold',
            })
            .setOrigin(0.5).setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY - 15, '?', {
              fontFamily: 'sans-serif', fontSize: '108px', color: '#9cf7ef', fontStyle: 'bold',
            })
            .setOrigin(0.5).setDepth(3003),
        );
        add(
          this.add
            .text(todayX, cardY + 116, i18n.t('dive.storyTodayBody'), {
              fontFamily: 'sans-serif', fontSize: '20px', color: Palette.textLight,
              align: 'center', wordWrap: { width: 430, useAdvancedWrap: true },
            })
            .setOrigin(0.5).setDepth(3003),
        );
        add(
          this.add
            .text(cx, top + 600, i18n.t('dive.briefingQuestion'), {
              fontFamily: 'sans-serif', fontSize: '22px', color: Palette.accentText,
              fontStyle: 'bold', align: 'center', wordWrap: { width: 1120, useAdvancedWrap: true },
            })
            .setOrigin(0.5).setDepth(3003),
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
            .text(cameraX, cardY + 58, i18n.t('dive.stationPhotoPrompt'), {
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
              `1  ${i18n.t('dive.objectiveStationInstruction')}\n\n2  ${i18n.t('dive.objectiveOrganismInstruction')}\n\n3  ${i18n.t('dive.objectiveDoInstruction')}`,
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
    const panelWidth = 1540;
    const panelHeight = 900;
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
    const title = this.add
      .text(cx, top + 42, i18n.t('report.title'), {
        fontFamily: 'sans-serif',
        fontSize: '42px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const subtitle = this.add
      .text(cx, top + 91, i18n.t('report.subtitle'), {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: Palette.accentText,
        align: 'center',
        wordWrap: { width: panelWidth - 160, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);

    const evidenceItems = [
      i18n.t('report.stationEvidence'),
      i18n.t('report.organismEvidence'),
      i18n.t('report.photoEvidence'),
      i18n.t('report.doEvidence'),
    ];
    const evidenceObjects: Phaser.GameObjects.GameObject[] = [];
    const evidenceWidth = 340;
    evidenceItems.forEach((label, index) => {
      const evidenceX = cx - 540 + index * 360;
      const card = this.add
        .rectangle(evidenceX, top + 142, evidenceWidth, 58, 0x123c50, 1)
        .setStrokeStyle(2, 0x91e6a7, 0.55)
        .setDepth(3002);
      const check = this.add
        .text(evidenceX - evidenceWidth / 2 + 18, top + 142, '✓', {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#91e6a7',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0.5)
        .setDepth(3003);
      const text = this.add
        .text(evidenceX + 8, top + 142, label, {
          fontFamily: 'sans-serif',
          fontSize: '15px',
          color: Palette.textLight,
          align: 'center',
          wordWrap: { width: evidenceWidth - 58, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(3003);
      evidenceObjects.push(card, check, text);
    });

    const puzzleSpecies = [
      'blue-damselfish',
      'hardy-goby',
      'reef-grouper',
      'silver-reef-fish',
      'sea-cucumber',
      'tube-sponge',
    ] as const;
    const zoneBySpecies: Readonly<Record<(typeof puzzleSpecies)[number], FoodWebZoneId>> = {
      'blue-damselfish': 'small-fish',
      'hardy-goby': 'small-fish',
      'silver-reef-fish': 'small-fish',
      'reef-grouper': 'predator',
      'sea-cucumber': 'seabed',
      'tube-sponge': 'seabed',
    };
    let foodWebComplete = false;
    let continueButton: Phaser.GameObjects.Text | null = null;
    const unlockContinue = (): void => {
      foodWebComplete = true;
      continueButton
        ?.setText(i18n.t('report.followBreathingClue'))
        .setBackgroundColor('#1c7a74')
        .setColor(Palette.textLight);
    };
    this.foodWebPuzzle = new FoodWebPuzzle(this, {
      x: cx,
      y: top + 438,
      width: panelWidth - 92,
      height: 500,
      depth: 3002,
      cards: puzzleSpecies.map((speciesId) => {
        const state = this.getFoodWebNodeState([speciesId], false);
        return {
          speciesId,
          label: this.getSpeciesLabel(speciesId),
          textureKey: this.getReportSpeciesTextureKey(speciesId),
          status: state.label,
          statusColor: state.color,
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
        tapSelect: i18n.t('report.foodWebTapSelect'),
        tapPlace: i18n.t('report.foodWebTapPlace'),
      },
      onComplete: unlockContinue,
    });

    const callout = this.add
      .rectangle(cx, top + 735, panelWidth - 116, 54, 0x0e3347, 1)
      .setStrokeStyle(2, 0x3fd0c9, 0.55)
      .setDepth(3001);
    const calloutText = this.add
      .text(cx, top + 735, i18n.t('report.callout'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: Palette.textLight,
        align: 'center',
        wordWrap: { width: panelWidth - 220, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3002);
    const note = this.add
      .text(
        cx,
        top + 789,
        `${i18n.t('report.qualified')} · ${i18n.t('report.nextStep')}\n${i18n.t('report.note')}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: Palette.textMuted,
          align: 'center',
          wordWrap: { width: panelWidth - 220, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5)
      .setDepth(3002);
    const button = this.add
      .text(cx, top + 850, i18n.t('report.foodWebLocked'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: Palette.textLight,
        backgroundColor: '#24404b',
        padding: { x: 30, y: 13 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3002)
      .setInteractive({ useHandCursor: true });
    const backButton = this.add
      .text(cx - 600, top + 850, i18n.t('common.backStep'), {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: Palette.textLight,
        backgroundColor: '#123c50',
        padding: { x: 26, y: 13 },
      })
      .setOrigin(0.5)
      .setDepth(3003)
      .setInteractive({ useHandCursor: true });
    this.overlayObjects = [
      dim,
      panel,
      title,
      subtitle,
      ...evidenceObjects,
      callout,
      calloutText,
      note,
      button,
      backButton,
    ];
    continueButton = button;
    button.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!foodWebComplete) {
        button.setText(i18n.t('report.foodWebLocked'));
        return;
      }
      this.setReportOverlayVisible(false);
      this.showDoQuestion();
    });
    backButton.on(Phaser.Input.Events.POINTER_UP, () => this.showFoodChainLesson());
    this.sharpenVisibleText();
    this.showPastPresentComparison();
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
        add(
          this.add
            .text(GAME_WIDTH / 2, 640, `${i18n.t('common.stepLabel')} ${i18n.t('report.todayGalleryStep')}`, {
              fontFamily: 'sans-serif',
              fontSize: '25px',
              color: '#e6fbff',
              fontStyle: 'bold',
              align: 'center',
            })
            .setOrigin(0.5)
            .setDepth(4104),
        );
        add(
          this.add
            .text(GAME_WIDTH / 2, 700, `${i18n.t('common.tipLabel')} ${i18n.t('report.todayGalleryTip')}`, {
              fontFamily: 'sans-serif',
              fontSize: '22px',
              color: Palette.textMuted,
              align: 'center',
              wordWrap: { width: 1160, useAdvancedWrap: true },
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
        add(next.root);
        next.onPress(() => {
          page = 1;
          render();
        });
      } else {
        const current = questions[page - 1] ?? questions[0];
        add(
          this.add
            .text(GAME_WIDTH / 2, 640, `${i18n.t('common.questionLabel')} ${i18n.t(current.question)}`, {
              fontFamily: 'sans-serif',
              fontSize: '27px',
              color: '#e9fbff',
              fontStyle: 'bold',
              align: 'center',
              wordWrap: { width: 1240, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(4104),
        );
        add(
          this.add
            .text(520, 705, i18n.t('common.optionsLabel'), {
              fontFamily: 'sans-serif',
              fontSize: '22px',
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
        current.choices.forEach((choice, choiceIndex) => {
          const button = new ResearchButton(
            this,
            690 + choiceIndex * 560,
            800,
            490,
            78,
            `${choiceIndex === 0 ? 'A' : 'B'}. ${i18n.t(choice)}`,
            { tone: 'secondary', fontSize: 23, depth: 4105 },
          );
          add(button.root);
          button.onPress(() => {
            const correct = choiceIndex === current.correct;
            button.setTone(correct ? 'primary' : 'danger');
            feedback.setText(i18n.t(correct ? 'report.compareCorrect' : 'report.compareTryAgain'));
            if (!correct) return;
            this.time.delayedCall(520, () => {
              if (page >= questions.length) this.showFoodChainLesson();
              else {
                page += 1;
                render();
              }
            });
          });
        });
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
  ): Phaser.GameObjects.GameObject[] {
    const todayObjects = this.createViewfinderEnvironment(
      stationId,
      x - width / 2,
      y - height / 2,
      width,
      height,
      depth,
    );
    const scale = 0.42;
    for (const spec of this.getViewfinderPhotos(stationId)) {
      if (!this.textures.exists(spec.key)) continue;
      const image = this.add
        .image(x + spec.offsetX * scale, y + spec.offsetY * scale, spec.key)
        .setDisplaySize(spec.width * scale, spec.height * scale)
        .setDepth(depth + 3);
      if (this.shouldFlipViewfinderPhoto(spec.key)) image.setFlipX(true);
      todayObjects.push(image);
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
        fontSize: '16px',
        color: '#ffffff',
        fontStyle: 'bold',
        backgroundColor: '#1c7a74dd',
        padding: { x: 13, y: 7 },
      })
      .setOrigin(1, 0)
      .setDepth(depth + 5);
    const toggleHint = this.add
      .text(x, y + height / 2 - 16, i18n.t('report.photoToggleHint'), {
        fontFamily: 'sans-serif',
        fontSize: '15px',
        color: '#ffffff',
        backgroundColor: '#04121fcc',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 5);
    const hitArea = this.add
      .rectangle(x, y, width, height, 0xffffff, 0.001)
      .setDepth(depth + 6)
      .setInteractive({ useHandCursor: true });
    let showingHistory = false;
    hitArea.on(Phaser.Input.Events.POINTER_UP, () => {
      if (historyImage === null) return;
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
            .text(x, 535, i18n.t(index === 2 ? 'report.compareSeabedNote' : 'report.compareFishNote'), {
              fontFamily: 'sans-serif',
              fontSize: '18px',
              color: Palette.textMuted,
              align: 'center',
              wordWrap: { width: 330, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(4102),
        );
      });

      add(
        this.add
          .text(GAME_WIDTH / 2, 650, i18n.t(current.question), {
            fontFamily: 'sans-serif',
            fontSize: '30px',
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
              fontSize: '23px',
              color: Palette.textLight,
              backgroundColor: '#123c50',
              padding: { x: 30, y: 17 },
              align: 'center',
              wordWrap: { width: 420, useAdvancedWrap: true },
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
          wordWrap: { width: 1040, useAdvancedWrap: true },
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
      i18n
        .t('report.foodLessonProgress')
        .replace('{done}', String(done))
        .replace('{total}', '3');
    const button = new ResearchButton(
      this,
      GAME_WIDTH / 2,
      875,
      430,
      70,
      foodChainProgress(0),
      { tone: 'locked', fontSize: 26, depth: 4103 },
    );
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
        textureKey: 'chapter1-subject-reef-grouper',
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
        textureKey: 'chapter1-subject-blue-damselfish',
      },
    ] as const;
    cards.forEach((card) => {
      const cardRoot = add(this.add.container(card.x, 665).setDepth(4104).setSize(280, 138));
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
      if (this.textures.exists(card.textureKey)) {
        const source = this.textures.get(card.textureKey).getSourceImage();
        const imageScale = Math.min(128 / source.width, 64 / source.height);
        children.push(
          this.add
            .image(0, -26, card.textureKey)
            .setDisplaySize(source.width * imageScale, source.height * imageScale),
        );
      }
      children.push(label);
      cardRoot.add(children).setInteractive({ useHandCursor: true });
      cardRoot.on(Phaser.Input.Events.POINTER_UP, () => {
        if (!cardRoot.input?.enabled) return;
        if (card.expected !== step) {
          feedback.setColor('#f2a679').setText(i18n.t('report.foodLessonWrong'));
          this.tweens.add({ targets: cardRoot, x: cardRoot.x + 8, duration: 65, yoyo: true, repeat: 2 });
          return;
        }
        cardRoot.disableInteractive();
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
    const back = new ResearchButton(this, 430, 875, 260, 64, i18n.t('common.backStep'), {
      tone: 'secondary',
      fontSize: 22,
      depth: 4105,
    });
    add(back.root);
    back.onPress(() => this.showPastPresentComparison());
    this.lessonOverlayObjects = objects;
    this.sharpenVisibleText();
  }

  private showChapter1Recap(): void {
    this.destroyLessonOverlay();
    const questions = [
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
    ] as const;
    let index = 0;
    let pageObjects: Phaser.GameObjects.GameObject[] = [];

    const render = (): void => {
      for (const object of pageObjects) object.destroy();
      pageObjects = [];
      const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
        pageObjects.push(object);
        return object;
      };
      const current = questions[index] ?? questions[0];
      add(
        this.add
          .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.82)
          .setOrigin(0)
          .setDepth(3000)
          .setInteractive(),
      );
      add(
        this.add
          .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1220, 720, 0x0a2a43, 0.99)
          .setStrokeStyle(3, Palette.accent)
          .setDepth(3001),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 240, `${i18n.t('report.recapTitle')}  ${index + 1}/3`, {
            fontFamily: 'sans-serif',
            fontSize: '42px',
            color: Palette.textLight,
            fontStyle: 'bold',
          })
          .setOrigin(0.5)
          .setDepth(3002),
      );
      add(
        this.add
          .text(GAME_WIDTH / 2, 350, `${i18n.t('common.questionLabel')} ${i18n.t(current.question)}`, {
            fontFamily: 'sans-serif',
            fontSize: '32px',
            color: '#dff9fb',
            align: 'center',
            wordWrap: { width: 980, useAdvancedWrap: true },
            lineSpacing: 8,
          })
          .setOrigin(0.5)
          .setDepth(3002),
      );
      add(
        this.add
          .text(570, 435, i18n.t('common.optionsLabel'), {
            fontFamily: 'sans-serif',
            fontSize: '22px',
            color: '#f0c95a',
            fontStyle: 'bold',
          })
          .setDepth(3002),
      );
      const feedback = add(
        this.add
          .text(GAME_WIDTH / 2, 720, '', {
            fontFamily: 'sans-serif',
            fontSize: '23px',
            color: '#91e6a7',
            align: 'center',
            wordWrap: { width: 900, useAdvancedWrap: true },
          })
          .setOrigin(0.5)
          .setDepth(3002),
      );
      current.choices.forEach((choice, choiceIndex) => {
        const button = add(
          this.add
            .text(GAME_WIDTH / 2, 510 + choiceIndex * 104, `${choiceIndex === 0 ? 'A' : 'B'}. ${i18n.t(choice)}`, {
              fontFamily: 'sans-serif',
              fontSize: '25px',
              color: Palette.textLight,
              backgroundColor: '#123c50',
              padding: { x: 32, y: 17 },
              align: 'center',
              wordWrap: { width: 840, useAdvancedWrap: true },
            })
            .setOrigin(0.5)
            .setDepth(3002)
            .setInteractive({ useHandCursor: true }),
        );
        button.on(Phaser.Input.Events.POINTER_UP, () => {
          const correct = choiceIndex === current.correct;
          button.setBackgroundColor(correct ? '#1c7a74' : '#73423e');
          feedback.setText(i18n.t(correct ? 'report.recapCorrect' : 'report.recapTryAgain'));
          if (!correct) return;
          this.time.delayedCall(650, () => {
            if (index >= questions.length - 1) this.enterChapter2();
            else {
              index += 1;
              render();
            }
          });
        });
      });
      const back = add(
        this.add
          .text(480, 810, i18n.t('common.backStep'), {
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
        if (index === 0) this.showDoBridge();
        else {
          index -= 1;
          render();
        }
      });
      this.lessonOverlayObjects = pageObjects;
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

    let fishVisual: Phaser.GameObjects.GameObject | null = null;
    if (this.textures.exists('chapter1-subject-blue-damselfish')) {
      const source = this.textures.get('chapter1-subject-blue-damselfish').getSourceImage();
      const scale = Math.min(280 / source.width, 150 / source.height);
      fishVisual = add(
        this.add
          .image(1030, 465, 'chapter1-subject-blue-damselfish')
          .setDisplaySize(source.width * scale, source.height * scale)
          .setDepth(3003),
      );
    } else {
      const fish = add(this.add.graphics().setDepth(3003));
      fish.fillStyle(0x67d8d1, 1).fillEllipse(1030, 465, 210, 100);
      fish.fillTriangle(930, 465, 865, 420, 865, 510);
      fishVisual = fish;
    }
    if (fishVisual !== null) {
      this.tweens.add({
        targets: fishVisual,
        y: '+=8',
        angle: { from: -1.2, to: 1.2 },
        duration: 1250,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    const gill = add(
      this.add
        .ellipse(1092, 466, 18, 62, 0xf0c95a, 0.08)
        .setStrokeStyle(4, 0xf0c95a, 0.95)
        .setDepth(3004),
    );
    this.tweens.add({
      targets: gill,
      scaleX: { from: 0.45, to: 1.2 },
      alpha: { from: 0.45, to: 1 },
      duration: 680,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
    const scaleMarker = add(
      this.add
        .ellipse(1015, 465, 86, 58, 0x3fd0c9, 0.04)
        .setStrokeStyle(3, 0x8ce8df, 0.82)
        .setDepth(3004),
    );
    const anatomyArrows = add(this.add.graphics().setDepth(3004));
    anatomyArrows.lineStyle(3, 0xf0c95a, 0.9);
    anatomyArrows.lineBetween(1160, 420, 1106, 452);
    anatomyArrows.fillStyle(0xf0c95a, 0.95);
    anatomyArrows.fillTriangle(1092, 461, 1108, 446, 1112, 458);
    anatomyArrows.lineStyle(3, 0x8ce8df, 0.84);
    anatomyArrows.lineBetween(935, 420, 986, 449);
    anatomyArrows.fillStyle(0x8ce8df, 0.92);
    anatomyArrows.fillTriangle(1001, 458, 982, 456, 990, 442);
    add(
      this.add
        .text(1165, 396, i18n.t('report.doQuestionGills'), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#f0c95a',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3004),
    );
    add(
      this.add
        .text(925, 396, i18n.t('report.doQuestionSurface'), {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: '#8ce8df',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3004),
    );
    const bubbleStarts = [520, 600, 680, 760] as const;
    bubbleStarts.forEach((x, index) => {
      const bubble = this.add
        .circle(0, 0, 10 + index * 2, 0x9cf7ef, 0.2)
        .setStrokeStyle(2, 0x9cf7ef, 0.9);
      const label = this.add
        .text(0, 0, 'O₂', {
            fontFamily: 'monospace',
            fontSize: '12px',
            color: '#d8fffb',
            fontStyle: 'bold',
          })
        .setOrigin(0.5);
      const bubbleRoot = add(
        this.add
          .container(x, 465 + (index % 2) * 34, [bubble, label])
          .setDepth(3003),
      );
      this.tweens.add({
        targets: bubbleRoot,
        x: 1080,
        alpha: { from: 1, to: 0.2 },
        duration: 1500 + index * 180,
        repeat: -1,
        delay: index * 220,
      });
    });
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
    add(
      this.add
        .text(GAME_WIDTH / 2, 615, `${i18n.t('common.questionLabel')} ${i18n.t('report.doQuestionPrompt')}`, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#e9fbff',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(3004),
    );
    add(
      this.add
        .text(490, 660, i18n.t('common.optionsLabel'), {
          fontFamily: 'sans-serif',
          fontSize: '21px',
          color: '#f0c95a',
          fontStyle: 'bold',
        })
        .setDepth(3004),
    );
    [
      { key: 'report.doQuestionGills', correct: true },
      { key: 'report.doQuestionSurface', correct: false },
    ].forEach((choice, index) => {
      const button = new ResearchButton(
        this,
        700 + index * 520,
        735,
        430,
        78,
        `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`,
        { tone: 'secondary', fontSize: 25, depth: 3004 },
      );
      add(button.root);
      button.onPress(() => {
        button.setTone(choice.correct ? 'primary' : 'danger');
        if (choice.correct) {
          gill.setStrokeStyle(5, Palette.success, 1);
        } else {
          scaleMarker.setStrokeStyle(4, Palette.danger, 1);
        }
        feedback.setText(i18n.t(choice.correct ? 'report.doQuestionCorrect' : 'report.doQuestionTryAgain'));
        if (choice.correct) this.time.delayedCall(620, () => this.showDoBridge());
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
    this.lessonOverlayObjects = objects;
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
    const button = new ResearchButton(
      this,
      GAME_WIDTH / 2,
      825,
      430,
      72,
      i18n.t('report.startRecap'),
      { tone: 'primary', fontSize: 27, depth: 3002 },
    );
    button.onPress(() => this.showChapter1Recap());
    const back = new ResearchButton(this, 470, 825, 260, 64, i18n.t('common.backStep'), {
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
      button.root,
      back.root,
    ];
    this.sharpenVisibleText();
  }

  private enterChapter2(): void {
    gameState.selectedChapter = 2;
    this.scene.start(SceneKeys.Chapter2Lab);
  }

  private getFoodWebNodeState(
    speciesIds: readonly string[],
    isContextNode: boolean,
  ): { label: string; color: string; fill: number; stroke: number } {
    if (isContextNode) {
      return {
        label: i18n.t('report.foodWebContext'),
        color: '#9cf7ef',
        fill: 0x19536a,
        stroke: 0x9cf7ef,
      };
    }
    if (this.mapView?.hasPhotographedSpecies(speciesIds) === true) {
      return {
        label: i18n.t('report.foodWebPhotographed'),
        color: '#91e6a7',
        fill: 0x1c7a74,
        stroke: 0x91e6a7,
      };
    }
    if (speciesIds.some((speciesId) => this.observedSpecies.has(speciesId))) {
      return {
        label: i18n.t('report.foodWebDetected'),
        color: '#f0c95a',
        fill: 0x5b4b25,
        stroke: 0xf0c95a,
      };
    }
    return {
      label: i18n.t('report.foodWebNotObserved'),
      color: Palette.textMuted,
      fill: 0x071923,
      stroke: 0x3fd0c9,
    };
  }

  private getSpeciesLabel(speciesId: string): string {
    const species = gameState.getData().species.find((entry) => entry.id === speciesId);
    if (species === undefined) return speciesId;
    return i18n.getLocale() === 'en' ? species.nameEn : species.nameZh;
  }

  private getReportSpeciesTextureKey(speciesId: string): string | null {
    const staticKey = `chapter1-subject-${speciesId}`;
    if (this.textures.exists(staticKey)) return staticKey;
    const frameKey = `chapter1-subject-${speciesId}-frame-00`;
    const transparentFrameKey = `${frameKey}-transparent`;
    if (speciesId === 'tube-sponge') {
      return this.textures.exists(transparentFrameKey) ? transparentFrameKey : null;
    }
    if (this.textures.exists(transparentFrameKey)) return transparentFrameKey;
    return this.textures.exists(frameKey) ? frameKey : null;
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
        chain: 'habitat → observed organism → wider food web',
      },
      zh: {
        role: '被觀察到的海洋生物',
        behavior: '需要透過多次觀察了解行為',
        chain: '棲地 → 觀察到的生物 → 更大的食物網',
      },
    };
    return english ? selected.en : selected.zh;
  }

  private getChainNodeDetail(index: number, label: string): string {
    const english = i18n.getLocale() === 'en';
    if (index === 0)
      return english
        ? 'energy or organic matter enters the local food web here'
        : '能量或有機物從這個環節進入當地食物網';
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
    const position = this.diver.getPosition();
    const target = this.mapView.getNearestPhotographableStation(position.x, position.y);
    if (target === null) {
      this.showStatus(i18n.t('dive.viewfinderNoTarget'));
      return;
    }

    this.viewfinderOpen = true;
    this.viewfinderTarget = target;
    this.actionWasDown = false;

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
        fontSize: '26px',
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
    const referenceX = left + 176;
    const referenceCard = this.add
      .rectangle(referenceX, top + 202, 270, 270, 0x123c50, 0.98)
      .setStrokeStyle(2, 0x3fd0c9, 0.7)
      .setDepth(2802);
    const referenceBadge = this.add
      .text(left + 42, top + 107, 'ARCHIVE / 01', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setDepth(2804);
    const referenceTitle = this.add
      .text(referenceX, top + 84, i18n.t('dive.viewfinderReference'), {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: Palette.accentText,
        align: 'center',
        wordWrap: { width: 230, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const photo = this.getHistoricalPhotoForStation(target.id);
    const referenceImage =
      photo === null
        ? null
        : this.addHistoricalPhoto(photo.key, referenceX, top + 202, 225, 146, 2803);

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
        fontSize: '16px',
        color: '#d8fffb',
        backgroundColor: '#0b6c68dd',
        padding: { x: 10, y: 6 },
        fontStyle: 'bold',
      })
      .setDepth(2806);
    const liveHint = this.add
      .text(previewLeft + 24, previewTop + 68, i18n.t('dive.viewfinderCompareHint'), {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#e6f7ffdd',
        wordWrap: { width: 360, useAdvancedWrap: true },
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
      // Use one clean, fixed frame per species. Keep each supplied frame in
      // its correct fixed orientation and animate only a gentle drift, so
      // there is no sprite swapping or turn-around flicker.
      image.setFlipX(this.shouldFlipViewfinderPhoto(spec.key));
      return [
        {
          image,
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
    const targetSpeciesId = this.getViewfinderTargetSpeciesId(target.id);
    const targetLabel = this.add
      .text(
        targetX,
        targetY + this.viewfinderTargetLabelOffsetY,
        `${i18n.t('dive.viewfinderTarget')}\n${this.getSpeciesLabel(targetSpeciesId)}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '17px',
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
      .text(cx, bottom - 96, i18n.t(quality.qualityKey), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: quality.color,
        align: 'center',
        wordWrap: { width: 760, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const controls = this.add
      .text(cx, bottom + 34, i18n.t('dive.viewfinderControls'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: Palette.textMuted,
        align: 'center',
        wordWrap: { width: 900, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(2804);
    const status = this.add
      .text(right - 32, top + 32, `${Math.round(target.distance)} px`, {
        fontFamily: 'sans-serif',
        fontSize: '18px',
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
      referenceBadge,
      referenceTitle,
      previewFrame,
      ...previewEnvironment,
      liveBadge,
      liveHint,
      crosshair,
      crosshairLines,
      targetLabel,
      qualityText,
      controls,
      status,
    ];
    if (referenceImage !== null) this.viewfinderObjects.push(referenceImage);
    for (const previewPhoto of previewPhotos) this.viewfinderObjects.push(previewPhoto.image);
    this.sharpenVisibleText();
  }

  private captureViewfinder(): void {
    if (this.mapView === null || this.viewfinderTarget === null) return;
    const quality = this.getViewfinderQuality(this.getCurrentViewfinderDistance());
    const stationId = this.mapView.tryPhotographStation(
      this.diver.getPosition().x,
      this.diver.getPosition().y,
    );
    if (stationId === null) {
      this.closeViewfinder();
      this.showStatus(i18n.t('dive.viewfinderNoTarget'));
      return;
    }

    this.closeViewfinder();
    this.cameras.main.flash(140, 255, 255, 255);
    this.playShutterSound();
    this.showStatus(
      `${i18n.t(quality.captureKey)} ${this.mapView.stationPhotoCount}/${REQUIRED_STATION_PHOTOS}`,
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
    const targetFish = this.viewfinderFocusPhotos.find((fish) => fish.isTarget);
    if (targetFish === undefined) return this.viewfinderTarget.distance + 240;
    const centerDistance = Phaser.Math.Distance.Between(focusX, focusY, targetFish.x, targetFish.y);
    const fishRadius = Math.max(targetFish.image.displayWidth, targetFish.image.displayHeight) / 2;
    // A target is only well framed when the crosshair is actually centered
    // on it; touching the edge of the reticle is no longer enough.
    const subjectError = Math.max(0, centerDistance - fishRadius * 0.35);
    return this.viewfinderTarget.distance + subjectError * 1.8;
  }

  private updateViewfinderFish(delta: number): void {
    for (const fish of this.viewfinderFocusPhotos) {
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
    return objects;
  }

  private getViewfinderTargetSpeciesId(stationId: string): string {
    if (stationId.endsWith('1')) return 'blue-damselfish';
    if (stationId.endsWith('2')) return 'reef-grouper';
    return 'sea-cucumber';
  }

  private shouldFlipViewfinderPhoto(key: string): boolean {
    // Blue damselfish already faces right in the supplied sheet. The other
    // selected frames face left, so mirror those once and never during play.
    return key !== 'chapter1-subject-blue-damselfish';
  }

  private getViewfinderPhotos(stationId: string): Array<{
    key: string;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
    target?: boolean;
    grounded?: boolean;
  }> {
    const blue = { key: 'chapter1-subject-blue-damselfish' };
    const grouper = { key: 'chapter1-subject-reef-grouper' };
    const goby = { key: 'chapter1-subject-hardy-goby' };
    const silver = { key: 'chapter1-subject-silver-reef-fish' };
    const cucumber = { key: 'chapter1-subject-sea-cucumber-frame-00' };

    if (stationId.endsWith('1')) {
      return [
        { ...blue, offsetX: 0, offsetY: 0, width: 205, height: 112, target: true },
        { ...silver, offsetX: -250, offsetY: 68, width: 142, height: 76 },
        { ...goby, offsetX: 312, offsetY: 90, width: 116, height: 58 },
      ];
    }
    if (stationId.endsWith('2')) {
      return [
        { ...grouper, offsetX: 0, offsetY: 0, width: 216, height: 118, target: true },
        { ...goby, offsetX: -250, offsetY: -82, width: 132, height: 66 },
        { ...silver, offsetX: 232, offsetY: -116, width: 118, height: 64 },
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
      { ...silver, offsetX: -272, offsetY: -184, width: 138, height: 74 },
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

  private destroyOverlay(): void {
    this.destroyLessonOverlay();
    this.foodWebPuzzle?.destroy();
    this.foodWebPuzzle = null;
    for (const object of this.overlayObjects) object.destroy();
    this.overlayObjects = [];
  }

  private destroyLessonOverlay(): void {
    for (const object of this.lessonOverlayObjects) {
      this.tweens.killTweensOf(object);
      object.destroy();
    }
    this.lessonOverlayObjects = [];
  }

  private setReportOverlayVisible(visible: boolean): void {
    for (const object of this.overlayObjects) {
      const visibleObject = object as Phaser.GameObjects.GameObject & {
        setVisible(value: boolean): Phaser.GameObjects.GameObject;
      };
      visibleObject.setVisible(visible).setActive(visible);
    }
    this.foodWebPuzzle?.setVisible(visible);
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
    eventBus.off('oxygen:depleted', this.onDepleted);
    eventBus.off('station:discovered', this.onStationDiscovered);
    eventBus.off('subject:discovered', this.onSubjectDiscovered);
    eventBus.off('subject:infoRequested', this.onSubjectInfoRequested);
    this.input.keyboard?.off('keydown-ESC', this.onEscape, this);
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
