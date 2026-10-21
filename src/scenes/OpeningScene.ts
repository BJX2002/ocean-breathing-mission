import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette, SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { i18n } from '../i18n/LocaleService';
import { gameState } from '../state/GameState';
import { experiencePreferences } from '../state/ExperiencePreferences';
import { ensureEdgeTransparentTexture } from '../graphics/TextureFactory';
import { CHAPTER1_ART_MANIFEST } from '../graphics/assetManifest';
import { queueSceneArt } from '../graphics/SceneArtLoader';
import { usesTouchControls } from '../input/ControlScheme';
import { narrationService, type NarrationCueId } from '../services/NarrationService';
import { createResearchSurface } from '../ui/ResearchUi';
import {
  getOpeningVideoFile,
  historicalPhotoKeyForStation,
  resolveOpeningVoice,
  type OpeningStage,
  type OpeningVoice,
} from './OpeningModel';

const PHOTO_KEYS = ['cs-1', 'cs-2', 'cs-3'] as const;

interface OpeningSceneData {
  readonly startWithNarration?: boolean;
}

interface PhotoHotspot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly reactionKey: string;
  readonly recordKey: string;
  readonly guideTitleKey: string;
  readonly guideBodyKey: string;
  readonly guideTextureKey: string;
}

const PHOTO_HOTSPOTS: readonly (readonly PhotoHotspot[])[] = [
  [
    {
      id: 'summary',
      x: 0.59,
      y: 0.58,
      reactionKey: 'opening.hotspot.s1.summary.reaction',
      recordKey: 'opening.hotspot.s1.summary.record',
      guideTitleKey: 'opening.guide.s1.title',
      guideBodyKey: 'opening.guide.s1.body',
      guideTextureKey: 'chapter1-subject-blue-damselfish-frame-00',
    },
  ],
  [
    {
      id: 'summary',
      x: 0.58,
      y: 0.52,
      reactionKey: 'opening.hotspot.s2.summary.reaction',
      recordKey: 'opening.hotspot.s2.summary.record',
      guideTitleKey: 'opening.guide.s2.title',
      guideBodyKey: 'opening.guide.s2.body',
      guideTextureKey: 'chapter1-subject-reef-grouper',
    },
  ],
  [
    {
      id: 'summary',
      // Place the clue on the prominent right-hand sea cucumber instead of
      // the empty patch of seabed between the two foreground animals.
      x: 0.7,
      y: 0.82,
      reactionKey: 'opening.hotspot.s3.summary.reaction',
      recordKey: 'opening.hotspot.s3.summary.record',
      guideTitleKey: 'opening.guide.s3.title',
      guideBodyKey: 'opening.guide.s3.body',
      guideTextureKey: 'chapter1-subject-sea-cucumber-frame-00',
    },
  ],
] as const;

/** Chapter 1 narrative gate: OP01 → historical photos → OP02 → dive. */
export class OpeningScene extends Phaser.Scene {
  private stage: OpeningStage = 'op01';
  private voice: OpeningVoice = 'can';
  private video: Phaser.GameObjects.Video | null = null;
  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private videoStatus: Phaser.GameObjects.Text | null = null;
  private playButton: Phaser.GameObjects.Text | null = null;
  private videoPoster: Phaser.GameObjects.Image | null = null;
  private narrationEnabled = false;
  private startWithNarration = false;
  private mutedFallbackAttempted = false;
  private photoIndex = 0;
  private photoImage: Phaser.GameObjects.Image | null = null;
  private photoBack: Phaser.GameObjects.Container | null = null;
  private photoInspectRoot: Phaser.GameObjects.Container | null = null;
  private photoViewportHit: Phaser.GameObjects.Rectangle | null = null;
  private photoBaseScale = 1;
  private photoZoom = 1;
  private photoYaw = 0;
  private photoPitch = 0;
  private photoLastPointer = { x: 0, y: 0 };
  private photoDragging = false;
  private photoHotspotObjects: Array<Phaser.GameObjects.Container | Phaser.GameObjects.Arc> = [];
  private photoHotspotFound = new Set<string>();
  private photoHotspotProgressText: Phaser.GameObjects.Text | null = null;
  private photoHotspotReactionText: Phaser.GameObjects.Text | null = null;
  private photoHotspotRecordText: Phaser.GameObjects.Text | null = null;
  private photoGuideTitleText: Phaser.GameObjects.Text | null = null;
  private photoGuideImage: Phaser.GameObjects.Image | null = null;

  constructor() {
    super(SceneKeys.Opening);
  }

  init(data?: OpeningSceneData): void {
    this.startWithNarration = data?.startWithNarration === true;
  }

  preload(): void {
    queueSceneArt(this, CHAPTER1_ART_MANIFEST);
    narrationService.preload(['opening-photo-review', 'opening-photo-conclusion']);
  }

  create(): void {
    narrationService.resetAutomaticStarts();
    const requestedScreen = new URLSearchParams(window.location.search).get('screen');
    const diveDebugScreens = [
      'dive',
      'briefing',
      'recap',
      'report',
      'food-chain',
      'food-lesson',
      'fish-oxygen',
      'do',
      'viewfinder1',
      'viewfinder2',
      'viewfinder3',
      'subject-viewfinder1',
      'subject-viewfinder2',
      'subject-viewfinder3',
    ];
    if (gameState.debugMode && diveDebugScreens.includes(requestedScreen ?? '')) {
      this.scene.start(SceneKeys.Dive);
      return;
    }
    this.stage =
      gameState.debugMode && requestedScreen === 'archive'
        ? 'photoReview'
        : gameState.debugMode && requestedScreen === 'photo-conclusion'
          ? 'photoConclusion'
          : 'op01';
    this.voice = experiencePreferences.getVoice();
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Opening });
    this.input.keyboard?.on('keydown-ESC', this.onEscape, this);
    this.input.keyboard?.on('keydown-ENTER', this.onPlayKey, this);
    this.input.keyboard?.on('keydown-SPACE', this.onPlayKey, this);
    this.input.keyboard?.on('keydown-LEFT', this.onPhotoPrevious, this);
    this.input.keyboard?.on('keydown-RIGHT', this.onPhotoNext, this);
    this.input.keyboard?.on('keydown-UP', this.onPhotoPanUp, this);
    this.input.keyboard?.on('keydown-DOWN', this.onPhotoPanDown, this);
    this.input.keyboard?.on('keydown-A', this.onPhotoPrevious, this);
    this.input.keyboard?.on('keydown-D', this.onPhotoNext, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.renderStage();
  }

  private renderStage(): void {
    narrationService.stop();
    this.clearUi();
    this.destroyVideo();
    if (this.stage === 'photoReview') {
      this.renderPhotoReview();
      this.sharpenText();
      return;
    }
    if (this.stage === 'photoConclusion') {
      this.renderPhotoConclusion();
      this.sharpenText();
      return;
    }
    this.renderVideoStage(this.stage);
    this.sharpenText();
  }

  private renderVideoStage(stage: 'op01' | 'op02'): void {
    this.narrationEnabled = false;
    this.mutedFallbackAttempted = false;
    // Browser delivery clips are H.264/AAC. If the browser lacks that baseline
    // support, immediately keep the story moving through the static opening.
    if (!this.canPlayOpeningVideo()) {
      this.renderVideoFallback(stage);
      return;
    }
    this.uiObjects.push(
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020a12, 1).setOrigin(0).setDepth(-10),
    );
    const posterKey = stage === 'op01' ? 'chapter1-cover' : 'chapter1-distant-reef-background';
    if (this.textures.exists(posterKey)) {
      this.videoPoster = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, posterKey)
        .setDisplaySize(GAME_WIDTH - 144, GAME_HEIGHT - 160)
        .setAlpha(0.74)
        .setDepth(-2);
      this.uiObjects.push(this.videoPoster);
    }
    this.uiObjects.push(
      this.add
        .text(72, 52, 'CHAPTER 01  /  OPENING', {
          fontFamily: 'sans-serif',
          fontSize: '20px',
          color: Palette.accentText,
          fontStyle: 'bold',
        })
        .setDepth(10),
    );
    this.uiObjects.push(
      this.add
        .text(GAME_WIDTH - 72, 52, stage === 'op01' ? '01 / 02' : '02 / 02', {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: Palette.textMuted,
        })
        .setOrigin(1, 0)
        .setDepth(10),
    );

    const video = this.add.video(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    video
      .setDepth(0)
      .setDisplaySize(GAME_WIDTH - 144, GAME_HEIGHT - 160)
      .setAlpha(0)
      .setInteractive({ useHandCursor: false });
    this.video = video;
    this.videoStatus = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 94, i18n.t('opening.videoLoading'), {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: Palette.textMuted,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.uiObjects.push(this.videoStatus);

    this.playButton = this.addButton(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 72,
      i18n.t('opening.videoPlay'),
      true,
    );
    this.playButton.on(Phaser.Input.Events.POINTER_UP, () => this.tryPlayVideo(true));

    video.on(Phaser.Input.Events.POINTER_UP, () => this.tryPlayVideo(true));
    const preferNarration = this.startWithNarration;
    this.startWithNarration = false;
    video.once('created', () => {
      video.setDisplaySize(GAME_WIDTH - 144, GAME_HEIGHT - 160);
      // `created` is emitted from the first decoded video frame and is the
      // reliable point at which the Phaser texture can replace the poster.
      // The HTML `playing` event can fire before Phaser attaches its listener,
      // leaving an invisible-but-playing video behind the static poster.
      this.showVideoPlayingState();
    });
    // Do not hide the poster merely because the audio track has started.
    // HEVC-in-MP4 can emit play/playing in Chromium while producing no video
    // frames. Only `created` proves Phaser received a drawable first frame.
    video.once('complete', () => this.handleVideoComplete(stage));
    video.once('error', () => this.renderVideoFallback(stage));
    video.on('locked', () => this.handleVideoLocked());
    const videoUrl = new URL(
      getOpeningVideoFile(
        stage,
        resolveOpeningVoice(this.voice),
        usesTouchControls(this) ? 'tablet' : 'desktop',
      ),
      document.baseURI,
    ).toString();
    // Keep the AAC track attached. Passing true here tells Phaser to create a
    // video element with no audio, which is why earlier builds could show a
    // picture but never produce narration even after a user click.
    video.loadURL(videoUrl, false);
    // `created` is emitted only after the first playable frame in Phaser, so
    // waiting for it before calling play creates a deadlock and leaves the
    // poster on screen forever. Begin the attempt as soon as the URL is set.
    this.tryPlayVideo(preferNarration);

    this.uiObjects.push(
      this.add
        .text(GAME_WIDTH - 72, GAME_HEIGHT - 72, this.getVoiceLabel(), {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: Palette.textMuted,
        })
        .setOrigin(1, 0.5)
        .setDepth(10),
    );

    const skipButton = this.addButton(72, GAME_HEIGHT - 72, i18n.t('opening.skip'), false);
    skipButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (stage === 'op01') {
        this.photoIndex = 0;
        this.stage = 'photoReview';
        this.renderStage();
      } else {
        this.goToDive();
      }
    });
  }

  private canPlayOpeningVideo(): boolean {
    try {
      const probe = document.createElement('video');
      return probe.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== '';
    } catch {
      return false;
    }
  }

  /**
   * A codec-safe opening card. It preserves the intended narrative order and
   * keeps the archive interactive when the browser cannot decode the clips.
   */
  private renderVideoFallback(stage: 'op01' | 'op02'): void {
    this.destroyVideo();
    this.clearUi();

    const background = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x03131e, 1)
      .setOrigin(0)
      .setDepth(-10);
    this.uiObjects.push(background);

    if (this.textures.exists('chapter1-distant-reef-background')) {
      const reef = this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 30, 'chapter1-distant-reef-background')
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT - 110)
        .setAlpha(0.72)
        .setDepth(-9);
      this.uiObjects.push(reef);
    }

    const wash = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x03131e, 0.42)
      .setOrigin(0)
      .setDepth(-8);
    this.uiObjects.push(wash);

    const eyebrow = this.add
      .text(72, 52, 'CHAPTER 01  /  OPENING', {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(10);
    const counter = this.add
      .text(GAME_WIDTH - 72, 52, stage === 'op01' ? '01 / 02' : '02 / 02', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: Palette.textMuted,
      })
      .setOrigin(1, 0)
      .setDepth(10);
    this.uiObjects.push(eyebrow, counter);

    const title = this.add
      .text(110, 158, i18n.t('opening.videoFallbackTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '44px',
        color: Palette.textLight,
        fontStyle: 'bold',
        wordWrap: { width: 720, useAdvancedWrap: true },
      })
      .setDepth(10);
    const body = this.add
      .text(114, 246, i18n.t('opening.videoFallbackBody'), {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: Palette.textMuted,
        lineSpacing: 12,
        wordWrap: { width: 660, useAdvancedWrap: true },
      })
      .setDepth(10);
    this.uiObjects.push(title, body);

    if (stage === 'op01') {
      if (this.textures.exists('chapter1-research-vessel')) {
        const vessel = this.add
          .image(1450, 245, 'chapter1-research-vessel')
          .setCrop(39, 112, 1474, 724)
          .setDisplaySize(520, 256)
          .setAlpha(0.96)
          .setDepth(2);
        this.uiObjects.push(vessel);
      }
      const photoPositions = [
        { key: 'chapter1-old-s1', x: 1030, y: 650, angle: -7 },
        { key: 'chapter1-old-s2', x: 1325, y: 720, angle: 3 },
        { key: 'chapter1-old-s3', x: 1620, y: 635, angle: 8 },
      ] as const;
      for (const photo of photoPositions) {
        if (!this.textures.exists(photo.key)) continue;
        const card = this.add
          .rectangle(photo.x, photo.y, 250, 188, 0xe9d6ae, 0.92)
          .setAngle(photo.angle)
          .setDepth(3);
        const image = this.addOpeningPhoto(photo.key, photo.x, photo.y, 218, 146, 4);
        if (image !== null) image.setAngle(photo.angle);
        this.uiObjects.push(card);
        if (image !== null) this.uiObjects.push(image);
      }
    } else {
      if (this.textures.exists('chapter1-research-vessel')) {
        const vessel = this.add
          .image(1500, 235, 'chapter1-research-vessel')
          .setCrop(39, 112, 1474, 724)
          .setDisplaySize(470, 231)
          .setAlpha(0.9)
          .setDepth(2);
        this.uiObjects.push(vessel);
      }
      const diverKey = 'chapter1-diver-frame-00';
      if (this.textures.exists(diverKey)) {
        const diver = this.add
          .image(1350, 610, diverKey)
          .setDisplaySize(230, 230)
          .setAngle(-8)
          .setDepth(4);
        this.uiObjects.push(diver);
      }
      const pulse = this.add.graphics().setDepth(3);
      pulse.lineStyle(4, 0x9cf7ef, 0.82);
      pulse.strokeCircle(1520, 620, 92);
      pulse.lineStyle(2, 0x3fd0c9, 0.7);
      pulse.lineBetween(1420, 620, 1620, 620);
      pulse.lineBetween(1520, 520, 1520, 720);
      this.uiObjects.push(pulse);
    }

    const codecNote = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 132, i18n.t('opening.videoFallbackHint'), {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: Palette.textMuted,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.uiObjects.push(codecNote);

    const continueButton = this.addButton(
      GAME_WIDTH / 2,
      GAME_HEIGHT - 72,
      i18n.t(stage === 'op01' ? 'opening.videoFallbackArchive' : 'opening.videoFallbackSurvey'),
      true,
    );
    continueButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (stage === 'op01') {
        this.photoIndex = 0;
        this.stage = 'photoReview';
        this.renderStage();
      } else {
        this.goToDive();
      }
    });

    const skipButton = this.addButton(72, GAME_HEIGHT - 72, i18n.t('opening.skip'), false);
    skipButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (stage === 'op01') {
        this.photoIndex = 0;
        this.stage = 'photoReview';
        this.renderStage();
      } else {
        this.goToDive();
      }
    });
    const backButton = this.addButton(
      GAME_WIDTH - 72,
      GAME_HEIGHT - 72,
      i18n.t('opening.backToMenu'),
      false,
    );
    backButton.on(Phaser.Input.Events.POINTER_UP, () => this.scene.start(SceneKeys.Menu));
  }

  private addOpeningPhoto(
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

  private renderPhotoReview(): void {
    this.uiObjects.push(
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x061a28, 1).setOrigin(0).setDepth(-10),
    );
    this.uiObjects.push(
      this.add
        .text(72, 52, 'CHAPTER 01  /  FIELD ARCHIVE', {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: Palette.accentText,
          fontStyle: 'bold',
        })
        .setDepth(10),
    );
    this.uiObjects.push(
      this.add
        .text(GAME_WIDTH / 2, 104, i18n.t('opening.photoReviewTitle'), {
          fontFamily: 'sans-serif',
          fontSize: '54px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(10),
    );
    this.uiObjects.push(
      this.add
        .text(GAME_WIDTH / 2, 164, i18n.t('opening.photoReviewHint'), {
          fontFamily: 'sans-serif',
          fontSize: '28px',
          color: Palette.textMuted,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(10),
    );

    const viewportX = 760;
    const viewportY = 540;
    const viewportWidth = 1030;
    const viewportHeight = 555;
    this.uiObjects.push(
      createResearchSurface(this, viewportX, viewportY + 30, 1080, 700, {
        depth: 1,
        fill: Palette.modal,
        border: Palette.accentSoft,
        borderAlpha: 0.18,
        radius: 26,
        shadow: true,
      }),
    );
    // This hit area is intentionally invisible. The photo now floats as an
    // inspectable object instead of sitting inside a large cyan panel.
    const viewport = this.add
      .rectangle(viewportX, viewportY, viewportWidth, viewportHeight, 0xffffff, 0.001)
      .setDepth(8)
      .setInteractive({ useHandCursor: true });
    this.photoViewportHit = viewport;
    viewport.on(Phaser.Input.Events.POINTER_DOWN, this.onPhotoPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPhotoPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPhotoPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPhotoPointerUp, this);
    this.input.on('wheel', this.onPhotoWheel, this);

    const stationId = PHOTO_KEYS[this.photoIndex] ?? PHOTO_KEYS[0];
    const key = historicalPhotoKeyForStation(stationId);
    if (key !== null && this.textures.exists(key)) {
      const source = this.textures.get(key).getSourceImage();
      this.photoBaseScale = Math.min(870 / source.width, 465 / source.height);
      const displayWidth = source.width * this.photoBaseScale;
      const displayHeight = source.height * this.photoBaseScale;
      const shadow = this.add
        .ellipse(
          viewportX,
          viewportY + displayHeight / 2 + 26,
          displayWidth * 0.86,
          48,
          0x01070b,
          0.48,
        )
        .setDepth(2);
      this.photoImage = this.add.image(0, 0, key).setScale(this.photoBaseScale).setDepth(1);

      const backPaper = this.add
        .rectangle(0, 0, displayWidth, displayHeight, 0xd8c79f, 1)
        .setStrokeStyle(4, 0x8c7852, 0.85);
      const backInset = this.add
        .rectangle(0, 0, displayWidth - 42, displayHeight - 42, 0x193644, 0.94)
        .setStrokeStyle(2, 0xceb986, 0.72);
      const backTitle = this.add
        .text(0, -34, 'FIELD ARCHIVE', {
          fontFamily: 'monospace',
          fontSize: '26px',
          color: '#f0c95a',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const backNumber = this.add
        .text(0, 22, `0${this.photoIndex + 1} / 03`, {
          fontFamily: 'monospace',
          fontSize: '19px',
          color: Palette.textLight,
        })
        .setOrigin(0.5);
      this.photoBack = this.add
        .container(0, 0, [backPaper, backInset, backTitle, backNumber])
        .setVisible(false);
      this.photoInspectRoot = this.add
        .container(viewportX, viewportY, [this.photoImage, this.photoBack])
        .setDepth(9);
      this.uiObjects.push(shadow, this.photoInspectRoot);
      this.createPhotoHotspots(displayWidth, displayHeight);
      this.updatePhotoTransform();
    }

    this.createPhotoEvidencePanel();

    const label = this.add
      .text(
        viewportX,
        276,
        `${i18n.t('dive.historicalPhoto')} ${this.photoIndex + 1} / 3  ·  ${i18n.t(`dive.station${this.photoIndex + 1}`)}`,
        {
          fontFamily: 'sans-serif',
          fontSize: '31px',
          color: Palette.textLight,
          fontStyle: 'bold',
        },
      )
      .setOrigin(0.5)
      .setDepth(10);
    const narrationHighlight = this.add
      .rectangle(760, 848, 990, 116, 0xf0c95a, 0.025)
      .setStrokeStyle(4, Palette.gold, 0.9)
      .setDepth(9)
      .setVisible(false);
    const stepLabel = this.add
      .text(286, 820, i18n.t('common.stepLabel'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(10);
    const stepHint = this.add
      .text(390, 820, i18n.t('opening.photoHotspotHint'), {
        fontFamily: 'sans-serif',
        fontSize: '26px',
        color: '#e6fbff',
        fontStyle: 'bold',
        wordWrap: { width: 850, useAdvancedWrap: true },
      })
      .setOrigin(0, 0.5)
      .setDepth(10);
    const tipLabel = this.add
      .text(286, 875, i18n.t('common.tipLabel'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(10);
    const controlHint = this.add
      .text(390, 875, i18n.t('opening.photoInspectHint'), {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: Palette.textMuted,
        wordWrap: { width: 850, useAdvancedWrap: true },
      })
      .setOrigin(0, 0.5)
      .setDepth(10);
    this.uiObjects.push(
      viewport,
      label,
      narrationHighlight,
      stepLabel,
      stepHint,
      tipLabel,
      controlHint,
    );

    const tabX = 430;
    for (const [index, stationName] of [
      i18n.t('dive.station1'),
      i18n.t('dive.station2'),
      i18n.t('dive.station3'),
    ].entries()) {
      const tab = this.addButton(
        tabX + index * 330,
        220,
        `${index + 1} · ${stationName}`,
        index === this.photoIndex,
      );
      tab.setFontSize(24).setPadding(26, 14, 26, 14);
      tab.on(Phaser.Input.Events.POINTER_UP, () => {
        if (narrationService.isPlaying()) return;
        this.photoIndex = index;
        this.photoZoom = 1;
        this.photoYaw = 0;
        this.photoPitch = 0;
        this.renderStage();
      });
    }

    const previous = this.addButton(180, viewportY, '‹', false);
    previous.setFontSize(42).on(Phaser.Input.Events.POINTER_UP, () => {
      if (!narrationService.isPlaying()) this.changePhoto(-1);
    });
    const next = this.addButton(1280, viewportY, '›', false);
    next.setFontSize(42).on(Phaser.Input.Events.POINTER_UP, () => {
      if (!narrationService.isPlaying()) this.changePhoto(1);
    });
    const reset = this.addButton(1290, GAME_HEIGHT - 70, i18n.t('opening.photoReset'), false);
    reset.setFontSize(24).setPadding(26, 14, 26, 14);
    reset.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!narrationService.isPlaying()) this.resetPhotoView();
    });

    const allPhotosReviewed = this.areAllPhotoLocationsReviewed();
    const readyToFinish = this.photoIndex === PHOTO_KEYS.length - 1 && allPhotosReviewed;
    const continueButton = this.addButton(
      930,
      GAME_HEIGHT - 70,
      this.photoIndex < PHOTO_KEYS.length - 1
        ? i18n.t('opening.photoNext')
        : i18n.t('opening.continue'),
      true,
    );
    continueButton.setFontSize(25).setPadding(28, 15, 28, 15);
    if (readyToFinish) {
      const readyHint = this.add
        .text(930, GAME_HEIGHT - 126, i18n.t('opening.photoContinueReady'), {
          fontFamily: 'sans-serif',
          fontSize: '23px',
          color: '#fff3a8',
          fontStyle: 'bold',
          align: 'center',
          backgroundColor: '#4b3b13cc',
          padding: { x: 18, y: 9 },
        })
        .setOrigin(0.5)
        .setDepth(21);
      this.uiObjects.push(readyHint);
      this.tweens.add({
        targets: [continueButton, readyHint],
        alpha: { from: 0.62, to: 1 },
        scale: { from: 0.98, to: 1.05 },
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    continueButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (narrationService.isPlaying()) return;
      const currentHotspots = PHOTO_HOTSPOTS[this.photoIndex] ?? [];
      const hasObservedClue = currentHotspots.some((hotspot) =>
        this.photoHotspotFound.has(`${this.photoIndex}:${hotspot.id}`),
      );
      if (!hasObservedClue) {
        this.photoHotspotReactionText?.setText(i18n.t('opening.photoFindOneBeforeNext'));
        return;
      }
      if (this.photoIndex < PHOTO_KEYS.length - 1) {
        this.photoIndex += 1;
        this.photoZoom = 1;
        this.photoYaw = 0;
        this.photoPitch = 0;
        this.renderStage();
        return;
      }
      if (!this.areAllPhotoLocationsReviewed()) {
        this.photoHotspotReactionText?.setText(i18n.t('opening.photoReviewAllBeforeConclusion'));
        return;
      }
      this.stage = 'photoConclusion';
      this.renderStage();
    });
    const backButton = this.addButton(112, GAME_HEIGHT - 70, i18n.t('common.backStep'), false);
    backButton.setFontSize(24).setPadding(26, 14, 26, 14);
    backButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (narrationService.isPlaying()) return;
      this.photoHotspotFound.clear();
      this.photoIndex = 0;
      this.photoZoom = 1;
      this.photoYaw = 0;
      this.photoPitch = 0;
      this.stage = 'op01';
      this.startWithNarration = false;
      this.renderStage();
    });
    const voiceButton = this.addButton(
      1630,
      GAME_HEIGHT - 70,
      i18n.t('report.aiVoiceReplay'),
      false,
    );
    voiceButton.setFontSize(22).setPadding(24, 14, 24, 14);
    const playPhotoReviewNarration = (automatic = false): void => {
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).disableInteractive().setAlpha(0.72);
      const accepted = this.playNarrationCue('opening-photo-review', narrationHighlight, {
        automatic,
        onComplete: () =>
          voiceButton
            .setText(i18n.t('report.aiVoiceReplay'))
            .setInteractive({ useHandCursor: true })
            .setAlpha(1),
        onError: () =>
          voiceButton
            .setText(i18n.t('report.aiVoiceRetry'))
            .setInteractive({ useHandCursor: true })
            .setAlpha(1),
      });
      if (!accepted) {
        voiceButton
          .setText(i18n.t('report.aiVoiceReplay'))
          .setInteractive({ useHandCursor: true })
          .setAlpha(1);
      }
    };
    voiceButton.on(Phaser.Input.Events.POINTER_UP, () => playPhotoReviewNarration(false));
    playPhotoReviewNarration(true);
  }

  private renderPhotoConclusion(): void {
    const touchLayout = usesTouchControls(this);
    this.uiObjects.push(
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x04131f, 1).setOrigin(0).setDepth(-10),
    );
    const panel = createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1480, 820, {
      depth: 1,
      fill: Palette.modal,
      border: Palette.accentSoft,
      borderAlpha: 0.55,
      radius: 28,
      shadow: true,
      goldRail: true,
    });
    const narrationHighlight = this.add
      .rectangle(GAME_WIDTH / 2, 430, 1320, 430, 0xf0c95a, 0.02)
      .setStrokeStyle(4, Palette.gold, 0.88)
      .setDepth(2)
      .setVisible(false);
    const title = this.add
      .text(GAME_WIDTH / 2, 170, i18n.t('opening.photoConclusionTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '52px',
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(3);
    const question = this.add
      .text(
        GAME_WIDTH / 2,
        292,
        `${i18n.t('common.questionLabel')} ${i18n.t('opening.photoConclusionQuestion')}`,
        {
          fontFamily: 'sans-serif',
          fontSize: touchLayout ? '48px' : '40px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          wordWrap: { width: 1220, useAdvancedWrap: true },
        },
      )
      .setOrigin(0.5)
      .setDepth(3);
    const options = this.add
      .text(300, 382, i18n.t('common.optionsLabel'), {
        fontFamily: 'monospace',
        fontSize: '29px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setDepth(3);
    const feedback = this.add
      .text(GAME_WIDTH / 2, 682, '', {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#91e6a7',
        align: 'center',
        wordWrap: { width: 1240, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(3);
    this.uiObjects.push(panel, narrationHighlight, title, question, options, feedback);

    let continueButton: Phaser.GameObjects.Text | null = null;
    const choices = [
      { key: 'opening.photoConclusionA', correct: true },
      { key: 'opening.photoConclusionB', correct: false },
    ] as const;
    choices.forEach((choice, index) => {
      const centerX = index === 0 ? 635 : 1285;
      const centerY = 520;
      const card = this.add
        .rectangle(centerX, centerY, 580, 180, 0x123c50, 1)
        .setStrokeStyle(3, 0x62b7bd, 0.65)
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      const choiceText = this.add
        .text(centerX, centerY, `${index === 0 ? 'A' : 'B'}. ${i18n.t(choice.key)}`, {
          fontFamily: 'sans-serif',
          fontSize: touchLayout ? '32px' : '31px',
          color: Palette.textLight,
          fontStyle: 'bold',
          align: 'center',
          lineSpacing: 8,
          wordWrap: { width: 510, useAdvancedWrap: true },
        })
        .setOrigin(0.5)
        .setDepth(5);
      this.uiObjects.push(card, choiceText);
      card.on(Phaser.Input.Events.POINTER_OVER, () => {
        card.setFillStyle(0x18516a, 1).setStrokeStyle(3, 0x91ded8, 0.95);
      });
      card.on(Phaser.Input.Events.POINTER_OUT, () => {
        card.setFillStyle(0x123c50, 1).setStrokeStyle(3, 0x62b7bd, 0.65);
      });
      card.on(Phaser.Input.Events.POINTER_UP, () => {
        if (narrationService.isPlaying()) return;
        card
          .setFillStyle(choice.correct ? 0x176456 : 0x704138, 1)
          .setStrokeStyle(3, choice.correct ? 0x91e6a7 : 0xffb09d, 1);
        feedback
          .setText(
            i18n.t(
              choice.correct ? 'opening.photoConclusionCorrect' : 'opening.photoConclusionTryAgain',
            ),
          )
          .setColor(choice.correct ? '#91e6a7' : '#ffb09d');
        narrationService.play(choice.correct ? 'feedback-correct-v2' : 'feedback-try-again');
        continueButton?.setVisible(choice.correct);
        if (choice.correct && continueButton !== null) this.pulseTextButton(continueButton);
      });
    });
    continueButton = this.addButton(
      GAME_WIDTH / 2,
      835,
      i18n.t('opening.photoConclusionContinue'),
      true,
    ).setVisible(false);
    continueButton.setFontSize(30).setPadding(44, 19, 44, 19);
    continueButton.on(Phaser.Input.Events.POINTER_UP, () => {
      if (narrationService.isPlaying()) return;
      this.stage = 'op02';
      this.startWithNarration = true;
      this.renderStage();
    });
    const back = this.addButton(330, 835, i18n.t('common.backStep'), false);
    back.setFontSize(25).setPadding(28, 15, 28, 15);
    back.on(Phaser.Input.Events.POINTER_UP, () => {
      if (narrationService.isPlaying()) return;
      this.photoIndex = PHOTO_KEYS.length - 1;
      this.stage = 'photoReview';
      this.renderStage();
    });
    const voiceButton = this.addButton(1490, 835, i18n.t('report.aiVoiceReplay'), false);
    voiceButton.setFontSize(22).setPadding(24, 14, 24, 14);
    const playConclusionNarration = (automatic = false): void => {
      voiceButton.setText(i18n.t('report.aiVoicePlaying')).disableInteractive().setAlpha(0.72);
      const accepted = this.playNarrationCue('opening-photo-conclusion', narrationHighlight, {
        automatic,
        onComplete: () =>
          voiceButton
            .setText(i18n.t('report.aiVoiceReplay'))
            .setInteractive({ useHandCursor: true })
            .setAlpha(1),
        onError: () =>
          voiceButton
            .setText(i18n.t('report.aiVoiceRetry'))
            .setInteractive({ useHandCursor: true })
            .setAlpha(1),
      });
      if (!accepted) {
        voiceButton
          .setText(i18n.t('report.aiVoiceReplay'))
          .setInteractive({ useHandCursor: true })
          .setAlpha(1);
      }
    };
    voiceButton.on(Phaser.Input.Events.POINTER_UP, () => playConclusionNarration(false));
    playConclusionNarration(true);
  }

  private createPhotoHotspots(displayWidth: number, displayHeight: number): void {
    if (this.photoInspectRoot === null) return;
    const hotspots = PHOTO_HOTSPOTS[this.photoIndex] ?? [];
    hotspots.forEach((hotspot, index) => {
      const foundKey = `${this.photoIndex}:${hotspot.id}`;
      const found = this.photoHotspotFound.has(foundKey);
      const ring = this.add
        .circle(0, 0, 14, found ? 0x91e6a7 : 0xf0c95a, found ? 0.9 : 0.25)
        .setStrokeStyle(3, found ? 0xc9ffd5 : 0xffe58a, 1);
      const core = this.add.circle(0, 0, 5, found ? 0xd8ffe1 : 0xffdb63, 1);
      const number = this.add
        .text(0, 0, String(index + 1), {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#04121f',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const marker = this.add
        .container((hotspot.x - 0.5) * displayWidth, (hotspot.y - 0.5) * displayHeight, [
          ring,
          core,
          number,
        ])
        .setSize(46, 46)
        .setInteractive({ useHandCursor: true });
      marker.setData('ring', ring);
      marker.setData('core', core);
      marker.on(Phaser.Input.Events.POINTER_UP, () => this.revealPhotoHotspot(hotspot, marker));
      this.photoInspectRoot?.add(marker);
      this.photoHotspotObjects.push(marker, ring, core);

      if (!found) {
        this.tweens.add({
          targets: ring,
          scale: { from: 0.9, to: 1.55 },
          alpha: { from: 1, to: 0.12 },
          duration: 1050 + index * 120,
          repeat: -1,
          yoyo: false,
          ease: 'Sine.easeOut',
        });
      }
    });
  }

  private createPhotoEvidencePanel(): void {
    const left = 1328;
    const top = 220;
    const width = 542;
    const height = 700;
    const hotspots = PHOTO_HOTSPOTS[this.photoIndex] ?? [];
    const found = hotspots.filter((hotspot) =>
      this.photoHotspotFound.has(`${this.photoIndex}:${hotspot.id}`),
    ).length;
    const currentHotspot = hotspots[0];
    const currentHotspotFound =
      currentHotspot !== undefined &&
      this.photoHotspotFound.has(`${this.photoIndex}:${currentHotspot.id}`);

    const panel = this.add.graphics().setDepth(12);
    panel.fillStyle(0x092637, 0.96).fillRoundedRect(left, top, width, height, 18);
    panel.fillTriangle(left, top + 112, left - 28, top + 136, left, top + 156);
    panel.lineStyle(2, 0x62b7bd, 0.75).strokeRoundedRect(left, top, width, height, 18);
    const accent = this.add
      .rectangle(left + 5, top + 8, 6, height - 16, 0xf0c95a, 0.9)
      .setOrigin(0)
      .setDepth(13);
    const title = this.add
      .text(left + 24, top + 22, i18n.t('opening.photoHotspotTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setDepth(13);
    this.photoHotspotProgressText = this.add
      .text(left + width - 24, top + 31, this.formatHotspotProgress(found, hotspots.length), {
        fontFamily: 'monospace',
        fontSize: '23px',
        color: '#f0c95a',
      })
      .setOrigin(1, 0)
      .setDepth(13);
    const reactionLabel = this.add
      .text(left + 24, top + 88, i18n.t('opening.photoReaction'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(13);
    this.photoHotspotReactionText = this.add
      .text(
        left + 24,
        top + 128,
        currentHotspotFound && currentHotspot !== undefined
          ? i18n.t(currentHotspot.reactionKey)
          : i18n.t('opening.photoHotspotDefault'),
        {
          fontFamily: 'sans-serif',
          fontSize: '26px',
          color: '#d6eaf1',
          lineSpacing: 8,
          wordWrap: { width: width - 48, useAdvancedWrap: true },
        },
      )
      .setDepth(13);
    const recordLabel = this.add
      .text(left + 24, top + 326, i18n.t('opening.photoFishGuide'), {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#f0c95a',
        fontStyle: 'bold',
      })
      .setDepth(13);
    const guideTextureKey =
      currentHotspot === undefined
        ? null
        : this.resolveGuideTextureKey(currentHotspot.guideTextureKey);
    if (guideTextureKey !== null && this.textures.exists(guideTextureKey)) {
      const source = this.textures.get(guideTextureKey).getSourceImage();
      const scale = Math.min(126 / source.width, 92 / source.height);
      this.photoGuideImage = this.add
        .image(left + 86, top + 478, guideTextureKey)
        .setDisplaySize(source.width * scale, source.height * scale)
        .setDepth(13)
        .setVisible(found > 0);
    }
    this.photoGuideTitleText = this.add
      .text(
        left + 164,
        top + 378,
        found > 0 && currentHotspot !== undefined ? i18n.t(currentHotspot.guideTitleKey) : '—',
        {
          fontFamily: 'sans-serif',
          fontSize: '30px',
          color: '#d8fffb',
          fontStyle: 'bold',
          wordWrap: { width: width - 192, useAdvancedWrap: true },
        },
      )
      .setDepth(13);
    this.photoHotspotRecordText = this.add
      .text(
        left + 164,
        top + 428,
        found > 0 && currentHotspot !== undefined ? i18n.t(currentHotspot.guideBodyKey) : '',
        {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#a9c5d0',
          lineSpacing: 7,
          wordWrap: { width: width - 192, useAdvancedWrap: true },
        },
      )
      .setDepth(13);
    this.uiObjects.push(
      panel,
      accent,
      title,
      this.photoHotspotProgressText,
      reactionLabel,
      this.photoHotspotReactionText,
      recordLabel,
      ...(this.photoGuideImage === null ? [] : [this.photoGuideImage]),
      this.photoGuideTitleText,
      this.photoHotspotRecordText,
    );
  }

  private revealPhotoHotspot(hotspot: PhotoHotspot, marker: Phaser.GameObjects.Container): void {
    const key = `${this.photoIndex}:${hotspot.id}`;
    this.photoHotspotFound.add(key);
    const ring = marker.getData('ring') as Phaser.GameObjects.Arc | undefined;
    const core = marker.getData('core') as Phaser.GameObjects.Arc | undefined;
    if (ring !== undefined) {
      this.tweens.killTweensOf(ring);
      ring.setScale(1).setAlpha(1).setFillStyle(0x91e6a7, 0.9).setStrokeStyle(3, 0xc9ffd5, 0.95);
    }
    core?.setFillStyle(0xd8ffe1, 1);
    marker.setScale(1.12);
    this.tweens.add({ targets: marker, scale: 1, duration: 170, ease: 'Back.easeOut' });

    this.photoHotspotReactionText?.setText(i18n.t(hotspot.reactionKey));
    this.photoGuideTitleText?.setText(i18n.t(hotspot.guideTitleKey));
    this.photoGuideImage?.setVisible(true);
    this.photoHotspotRecordText?.setText(i18n.t(hotspot.guideBodyKey));
    const hotspots = PHOTO_HOTSPOTS[this.photoIndex] ?? [];
    const found = hotspots.filter((item) =>
      this.photoHotspotFound.has(`${this.photoIndex}:${item.id}`),
    ).length;
    this.photoHotspotProgressText?.setText(this.formatHotspotProgress(found, hotspots.length));

    // The final clue used to update only the evidence panel. Rebuild the
    // screen immediately so the completion hint, pulse and button state are
    // available without making the learner switch photos first.
    if (this.photoIndex === PHOTO_KEYS.length - 1 && this.areAllPhotoLocationsReviewed()) {
      this.time.delayedCall(0, () => {
        if (this.stage === 'photoReview') this.renderStage();
      });
    }
  }

  private areAllPhotoLocationsReviewed(): boolean {
    return PHOTO_HOTSPOTS.every((hotspots, index) =>
      hotspots.some((hotspot) => this.photoHotspotFound.has(`${index}:${hotspot.id}`)),
    );
  }

  private resolveGuideTextureKey(sourceKey: string): string | null {
    if (!this.textures.exists(sourceKey)) return null;
    if (
      sourceKey.startsWith('chapter1-subject-blue-damselfish-frame-') ||
      sourceKey.startsWith('chapter1-subject-silver-reef-fish-frame-')
    ) {
      const transparentKey = `${sourceKey}-edge-transparent`;
      return ensureEdgeTransparentTexture(this, sourceKey, transparentKey) &&
        this.textures.exists(transparentKey)
        ? transparentKey
        : null;
    }
    return sourceKey;
  }

  private formatHotspotProgress(found: number, total: number): string {
    return i18n
      .t('opening.photoHotspotProgress')
      .replace('{found}', String(found))
      .replace('{total}', String(total));
  }

  private addButton(x: number, y: number, label: string, active: boolean): Phaser.GameObjects.Text {
    const button = this.add
      .text(x, y, label, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.textLight,
        backgroundColor: active ? '#1c7a74' : '#123c50',
        padding: { x: 22, y: 11 },
        fontStyle: active ? 'bold' : 'normal',
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setInteractive({ useHandCursor: true });
    this.uiObjects.push(button);
    button.on(Phaser.Input.Events.POINTER_OVER, () => button.setScale(1.04));
    button.on(Phaser.Input.Events.POINTER_OUT, () => button.setScale(1));
    return button;
  }

  private pulseTextButton(button: Phaser.GameObjects.Text): void {
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
      target.setVisible(false);
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

  private handleVideoComplete(stage: 'op01' | 'op02'): void {
    if (stage === 'op01') {
      this.photoIndex = 0;
      this.stage = 'photoReview';
      this.renderStage();
      return;
    }
    this.goToDive();
  }

  private goToDive(): void {
    gameState.selectedChapter = 1;
    this.scene.start(SceneKeys.Dive);
  }

  private readonly onEscape = (): void => {
    this.scene.start(SceneKeys.Menu);
  };

  private readonly onPlayKey = (): void => {
    if (this.video !== null) this.tryPlayVideo(true);
  };

  private tryPlayVideo(enableNarration: boolean): void {
    if (this.video === null) return;
    this.narrationEnabled = enableNarration;
    this.video.setMute(!enableNarration);
    if (enableNarration) {
      this.playButton?.setVisible(false);
      this.videoStatus?.setVisible(false);
    } else {
      this.videoStatus?.setText(i18n.t('opening.videoLoading'));
    }
    this.video.play(false);
  }

  private handleVideoLocked(): void {
    if (this.video === null) return;
    if (this.narrationEnabled && !this.mutedFallbackAttempted) {
      this.mutedFallbackAttempted = true;
      this.narrationEnabled = false;
      this.video.setMute(true);
      this.videoStatus?.setText(i18n.t('opening.videoMutedHint')).setVisible(true);
      this.playButton?.setText(i18n.t('opening.videoEnableNarration')).setVisible(true);
      this.video.play(false);
      return;
    }
    this.videoStatus?.setText(i18n.t('opening.videoTapToPlay')).setVisible(true);
    this.playButton?.setVisible(true);
  }

  private showVideoPlayingState(): void {
    this.video?.setAlpha(1);
    this.videoPoster?.setVisible(false);
    if (this.narrationEnabled) {
      this.videoStatus?.setVisible(false);
      this.playButton?.setVisible(false);
      return;
    }
    this.videoStatus?.setText(i18n.t('opening.videoMutedHint')).setVisible(true);
    this.playButton?.setText(i18n.t('opening.videoEnableNarration')).setVisible(true);
  }

  private getVoiceLabel(): string {
    if (this.voice === 'eng') return i18n.t('opening.voiceEnglish');
    if (this.voice === 'pth') return i18n.t('opening.voiceMandarin');
    return i18n.t('opening.voiceCantonese');
  }

  private changePhoto(direction: -1 | 1): void {
    if (this.stage !== 'photoReview') return;
    this.photoIndex = (this.photoIndex + direction + PHOTO_KEYS.length) % PHOTO_KEYS.length;
    this.photoZoom = 1;
    this.photoYaw = 0;
    this.photoPitch = 0;
    this.renderStage();
  }

  private changePhotoZoom(amount: number): void {
    if (this.stage !== 'photoReview') return;
    this.photoZoom = Phaser.Math.Clamp(this.photoZoom + amount, 0.78, 1.28);
    this.updatePhotoTransform();
  }

  private resetPhotoView(): void {
    this.photoZoom = 1;
    this.photoYaw = 0;
    this.photoPitch = 0;
    this.updatePhotoTransform();
  }

  private updatePhotoTransform(): void {
    if (this.photoInspectRoot === null || this.photoImage === null || this.photoBack === null)
      return;
    const yaw = Phaser.Math.DegToRad(this.photoYaw);
    const pitch = Phaser.Math.DegToRad(this.photoPitch);
    const facing = Math.cos(yaw);
    const perspectiveX = Math.max(0.09, Math.abs(facing));
    const perspectiveY = Math.max(0.52, Math.cos(pitch));
    const showingFront = facing >= 0;

    this.photoImage.setVisible(showingFront);
    this.photoBack.setVisible(!showingFront);
    for (const object of this.photoHotspotObjects) object.setVisible(showingFront);
    this.photoInspectRoot
      .setScale(this.photoZoom * perspectiveX, this.photoZoom * perspectiveY)
      .setAngle(Math.sin(yaw) * -4.5 + Math.sin(pitch) * 2.2)
      .setPosition(760 + Math.sin(yaw) * 34, 525 + Math.sin(pitch) * 18);
  }

  private readonly onPhotoPrevious = (): void => this.changePhoto(-1);
  private readonly onPhotoNext = (): void => this.changePhoto(1);
  private readonly onPhotoPanUp = (): void => this.tiltPhoto(-8);
  private readonly onPhotoPanDown = (): void => this.tiltPhoto(8);

  private tiltPhoto(amount: number): void {
    if (this.stage !== 'photoReview') return;
    this.photoPitch = Phaser.Math.Clamp(this.photoPitch + amount, -68, 68);
    this.updatePhotoTransform();
  }

  private readonly onPhotoPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (this.stage !== 'photoReview') return;
    this.photoDragging = true;
    this.photoLastPointer = { x: pointer.x, y: pointer.y };
    this.game.canvas.style.cursor = 'grabbing';
  };

  private readonly onPhotoPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (!this.photoDragging || this.stage !== 'photoReview') return;
    const deltaX = pointer.x - this.photoLastPointer.x;
    const deltaY = pointer.y - this.photoLastPointer.y;
    this.photoYaw = Phaser.Math.Wrap(this.photoYaw + deltaX * 0.48, -180, 180);
    this.photoPitch = Phaser.Math.Clamp(this.photoPitch - deltaY * 0.36, -68, 68);
    this.photoLastPointer = { x: pointer.x, y: pointer.y };
    this.updatePhotoTransform();
  };

  private readonly onPhotoPointerUp = (): void => {
    this.photoDragging = false;
    if (this.stage === 'photoReview') this.game.canvas.style.cursor = 'grab';
  };

  private readonly onPhotoWheel = (
    _pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    if (
      this.stage !== 'photoReview' ||
      this.photoViewportHit === null ||
      !gameObjects.includes(this.photoViewportHit)
    )
      return;
    this.changePhotoZoom(deltaY > 0 ? -0.12 : 0.12);
  };

  private clearUi(): void {
    this.removePhotoInputHandlers();
    for (const object of this.photoHotspotObjects) this.tweens.killTweensOf(object);
    for (const object of this.uiObjects) object.destroy();
    this.uiObjects = [];
    this.videoStatus = null;
    this.playButton = null;
    this.videoPoster = null;
    this.photoImage = null;
    this.photoBack = null;
    this.photoInspectRoot = null;
    this.photoViewportHit = null;
    this.photoDragging = false;
    this.photoHotspotObjects = [];
    this.photoHotspotProgressText = null;
    this.photoHotspotReactionText = null;
    this.photoHotspotRecordText = null;
    this.photoGuideTitleText = null;
    this.photoGuideImage = null;
    this.game.canvas.style.cursor = '';
  }

  private sharpenText(): void {
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    for (const object of this.children.list) {
      if (object instanceof Phaser.GameObjects.Text) object.setResolution(resolution);
    }
  }

  private removePhotoInputHandlers(): void {
    if (this.photoViewportHit !== null) {
      this.photoViewportHit.off(Phaser.Input.Events.POINTER_DOWN, this.onPhotoPointerDown, this);
    }
    this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPhotoPointerMove, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.onPhotoPointerUp, this);
    this.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onPhotoPointerUp, this);
    this.input.off('wheel', this.onPhotoWheel, this);
  }

  private destroyVideo(): void {
    if (this.video === null) return;
    this.video.stop();
    this.video.removeAllListeners();
    this.video.destroy();
    this.video = null;
  }

  private cleanup(): void {
    this.input.keyboard?.off('keydown-ESC', this.onEscape, this);
    this.input.keyboard?.off('keydown-ENTER', this.onPlayKey, this);
    this.input.keyboard?.off('keydown-SPACE', this.onPlayKey, this);
    this.input.keyboard?.off('keydown-LEFT', this.onPhotoPrevious, this);
    this.input.keyboard?.off('keydown-RIGHT', this.onPhotoNext, this);
    this.input.keyboard?.off('keydown-UP', this.onPhotoPanUp, this);
    this.input.keyboard?.off('keydown-DOWN', this.onPhotoPanDown, this);
    this.input.keyboard?.off('keydown-A', this.onPhotoPrevious, this);
    this.input.keyboard?.off('keydown-D', this.onPhotoNext, this);
    narrationService.stop();
    this.destroyVideo();
    this.clearUi();
  }
}
