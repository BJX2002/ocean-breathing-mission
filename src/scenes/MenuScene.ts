import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette, SceneKeys } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { i18n, type LocaleCode } from '../i18n/LocaleService';
import { gameState } from '../state/GameState';
import { experiencePreferences, type NarrationVoice } from '../state/ExperiencePreferences';
import { isDebugEnabled } from '../debug/DebugOverlay';

type MenuScreen = 'language' | 'title' | 'chapters';

interface MenuSceneData {
  readonly screen?: MenuScreen;
}

/**
 * Branded title screen and optional chapter selector. New players enter the
 * story linearly; returning players can continue or deliberately replay.
 */
export class MenuScene extends Phaser.Scene {
  private screen: MenuScreen = 'title';
  private chapterTransitionStarted = false;

  constructor() {
    super(SceneKeys.Menu);
  }

  init(data?: MenuSceneData): void {
    this.chapterTransitionStarted = false;
    if (data?.screen !== undefined) {
      this.screen = data.screen;
      return;
    }
    // The first screen is deliberately simple: one clear action starts the
    // experience. Language/narration remain available as a quiet secondary
    // setting instead of becoming a wall of choices before the story begins.
    this.screen = 'title';
  }

  create(): void {
    // Scene instances are reused by Phaser. Explicitly restore input here so a
    // previous guarded chapter transition cannot leave the chapter cards inert.
    this.input.enabled = true;
    eventBus.emit('scene:changed', { sceneKey: SceneKeys.Menu });
    gameState.debugMode = isDebugEnabled();
    const requestedScreen = new URLSearchParams(window.location.search).get('screen');
    if (gameState.debugMode && requestedScreen === 'op1') {
      gameState.selectedChapter = 1;
      this.scene.start(SceneKeys.Opening, { startWithNarration: true });
      return;
    }
    const chapter1DebugScreens = new Set([
      'briefing',
      'recap',
      'archive',
      'photo-conclusion',
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
    ]);
    if (
      gameState.debugMode &&
      requestedScreen !== null &&
      chapter1DebugScreens.has(requestedScreen)
    ) {
      gameState.selectedChapter = 1;
      this.scene.start(SceneKeys.Opening);
      return;
    }
    const chapter2DebugScreens = new Set([
      'lab-intro',
      'evidence',
      'experiment',
      'unlock',
      'comparison',
      'deployment',
      'deployment-result',
      'deployment-result-vessel',
      'deployment-result-fixed',
      'deployment-result-success',
      'summary',
      'quiz',
      'quiz-sensor',
      'ending',
    ]);
    if (
      gameState.debugMode &&
      requestedScreen !== null &&
      chapter2DebugScreens.has(requestedScreen)
    ) {
      gameState.selectedChapter = 2;
      this.scene.start(SceneKeys.Chapter2Lab);
      return;
    }

    this.createCoverBackground();
    if (this.screen === 'language') this.createLanguageSetup();
    else if (this.screen === 'chapters') this.createChapterSelect();
    else this.createTitleScreen();
    this.sharpenText();
  }

  private createCoverBackground(): void {
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, Palette.deepSea, 1).setOrigin(0);
    if (this.textures.exists('chapter1-cover')) {
      this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'chapter1-cover')
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setAlpha(this.screen === 'title' ? 1 : 0.5)
        .setDepth(1);
    }

    const grade = this.add.graphics().setDepth(2);
    grade.fillGradientStyle(0x020b12, 0x020b12, 0x020b12, 0x020b12, 0.86, 0.34, 0.92, 0.32);
    grade.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    grade.fillStyle(0x020912, this.screen === 'title' ? 0.23 : 0.55);
    grade.fillRect(0, 0, GAME_WIDTH, 104);
    grade.fillRect(0, GAME_HEIGHT - 116, GAME_WIDTH, 116);
  }

  private createTitleScreen(): void {
    const hasProgress = gameState.tutorialSeen || gameState.completedMissionIds.length > 0;
    const cx = GAME_WIDTH / 2;
    const card = this.add
      .rectangle(cx, 548, 920, 650, 0x03131f, 0.78)
      .setStrokeStyle(2, Palette.accent, 0.42)
      .setDepth(8);

    this.add
      .text(cx, 274, 'NER OCEAN  /  FIELD MISSION', {
        fontFamily: 'monospace',
        fontSize: '21px',
        color: '#9cf7ef',
        fontStyle: 'bold',
        letterSpacing: 3,
      })
      .setOrigin(0.5)
      .setDepth(10);

    const title = this.add
      .text(cx, 332, i18n.t('menu.title'), {
        fontFamily: 'sans-serif',
        fontSize: '82px',
        color: '#f4fbff',
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: 800, useAdvancedWrap: true },
        shadow: { offsetX: 0, offsetY: 4, color: '#00101d', blur: 10, fill: true },
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    const kickerY = title.y + title.height + 22;
    this.add
      .text(cx, kickerY, i18n.t('menu.kicker'), {
        fontFamily: 'sans-serif',
        fontSize: '31px',
        color: '#bfe6ed',
        letterSpacing: 1,
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);
    this.add
      .text(cx, kickerY + 64, i18n.t('menu.subtitle'), {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#a6c5d1',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(10);

    this.addMenuButton(cx - 230, 704, 460, i18n.t('menu.start'), true, () => {
      if (!experiencePreferences.isConfigured()) experiencePreferences.confirm();
      gameState.selectedChapter = 1;
      this.scene.start(SceneKeys.Opening, { startWithNarration: true });
    });

    this.add
      .text(
        cx,
        770,
        hasProgress ? `✓  ${i18n.t('menu.progressFound')}` : i18n.t('menu.startHint'),
        {
          fontFamily: 'sans-serif',
          fontSize: '18px',
          color: hasProgress ? '#91e6a7' : '#9ab9c5',
        },
      )
      .setOrigin(0.5)
      .setDepth(10);

    this.createCornerLanguageSelector();

    const chaptersLink = this.add
      .text(GAME_WIDTH - 64, GAME_HEIGHT - 52, i18n.t('menu.chapterSelect'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#b8d4dd',
      })
      .setOrigin(1, 0)
      .setDepth(15)
      .setInteractive({ useHandCursor: true });
    chaptersLink.on(Phaser.Input.Events.POINTER_OVER, () => chaptersLink.setColor('#ffffff'));
    chaptersLink.on(Phaser.Input.Events.POINTER_OUT, () => chaptersLink.setColor('#b8d4dd'));
    chaptersLink.on(Phaser.Input.Events.POINTER_UP, () =>
      this.scene.restart({ screen: 'chapters' } satisfies MenuSceneData),
    );

    card.setName('single-start-panel');

    if (gameState.debugMode) {
      this.add
        .text(GAME_WIDTH - 32, GAME_HEIGHT - 68, i18n.t('menu.debugHint'), {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: Palette.accentText,
        })
        .setOrigin(1, 0)
        .setDepth(10);
    }
  }

  /**
   * One choice controls both narration and on-screen copy. This keeps the
   * launch screen legible for younger players while retaining the full setup
   * panel for prototype/debug use.
   */
  private createCornerLanguageSelector(): void {
    const options: ReadonlyArray<{
      readonly label: string;
      readonly voice: NarrationVoice;
      readonly locale: LocaleCode;
    }> = [
      { label: 'English', voice: 'eng', locale: 'en' },
      { label: i18n.getLocale() === 'zh-Hans' ? '粤语' : '粵語', voice: 'can', locale: 'zh-Hant' },
      {
        label: i18n.getLocale() === 'zh-Hant' ? '普通話' : '普通话',
        voice: 'pth',
        locale: 'zh-Hans',
      },
    ];
    const startX = GAME_WIDTH - 474;
    const top = 28;
    this.add
      .text(startX - 112, top + 15, i18n.t('menu.languageCornerLabel'), {
        fontFamily: 'monospace',
        fontSize: '15px',
        color: '#b8d4dd',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5)
      .setDepth(15);

    options.forEach((option, index) => {
      const selected =
        experiencePreferences.getVoice() === option.voice && i18n.getLocale() === option.locale;
      const button = this.add
        .text(startX + index * 142, top, option.label, {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: selected ? '#ffffff' : '#b8d4dd',
          backgroundColor: selected ? '#167f79' : '#092d40cc',
          padding: { x: 14, y: 8 },
          fontStyle: selected ? 'bold' : 'normal',
        })
        .setDepth(15)
        .setInteractive({ useHandCursor: true });
      button.on(Phaser.Input.Events.POINTER_OVER, () => button.setColor('#ffffff'));
      button.on(Phaser.Input.Events.POINTER_OUT, () =>
        button.setColor(selected ? '#ffffff' : '#b8d4dd'),
      );
      button.on(Phaser.Input.Events.POINTER_UP, () => {
        experiencePreferences.setVoice(option.voice);
        experiencePreferences.confirm();
        i18n.setLocale(option.locale);
        this.scene.restart({ screen: 'title' } satisfies MenuSceneData);
      });
    });
  }

  private createLanguageSetup(): void {
    const panel = this.add
      .rectangle(GAME_WIDTH / 2, 540, 1500, 850, 0x041826, 0.96)
      .setStrokeStyle(2, Palette.accent, 0.62)
      .setDepth(5);
    this.add.rectangle(218, 540, 6, 784, 0xf0c95a, 0.9).setDepth(6);

    this.add
      .text(GAME_WIDTH / 2, 154, i18n.t('menu.setupEyebrow'), {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: '#f0c95a',
        fontStyle: 'bold',
        letterSpacing: 2,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.add
      .text(GAME_WIDTH / 2, 218, i18n.t('menu.setupTitle'), {
        fontFamily: 'sans-serif',
        fontSize: '46px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.add
      .text(GAME_WIDTH / 2, 284, i18n.t('menu.setupBody'), {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#aac8d4',
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: 1080, useAdvancedWrap: true },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.add.rectangle(GAME_WIDTH / 2, 346, 1180, 2, Palette.accent, 0.24).setDepth(8);

    this.add
      .text(350, 382, i18n.t('menu.voiceLabel'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(10);
    this.add
      .text(350, 416, i18n.t('menu.voiceHint'), {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: Palette.textMuted,
      })
      .setDepth(10);

    const selectedVoice = experiencePreferences.getVoice();
    const voiceChoices: ReadonlyArray<readonly [NarrationVoice, string]> = [
      ['can', '廣東話\nCantonese'],
      ['pth', '普通話\nMandarin'],
      ['eng', 'English\nNarration'],
    ];
    voiceChoices.forEach(([voice, label], index) => {
      this.addChoiceButton(650 + index * 310, 500, 284, label, selectedVoice === voice, () => {
        experiencePreferences.setVoice(voice);
        this.scene.restart({ screen: 'language' } satisfies MenuSceneData);
      });
    });

    this.add
      .text(350, 604, i18n.t('menu.textLabel'), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: Palette.accentText,
        fontStyle: 'bold',
      })
      .setDepth(10);
    this.add
      .text(350, 638, i18n.t('menu.textHint'), {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: Palette.textMuted,
      })
      .setDepth(10);

    const localeChoices: ReadonlyArray<readonly [LocaleCode, string]> = [
      ['zh-Hant', '繁體中文\nTraditional'],
      ['zh-Hans', i18n.t('menu.simplifiedPlaceholder')],
      ['en', 'English\nText'],
    ];
    localeChoices.forEach(([locale, label], index) => {
      this.addChoiceButton(650 + index * 310, 720, 284, label, i18n.getLocale() === locale, () => {
        i18n.setLocale(locale);
        this.scene.restart({ screen: 'language' } satisfies MenuSceneData);
      });
    });

    this.addMenuButton(750, 884, 420, i18n.t('menu.confirmSetup'), true, () => {
      experiencePreferences.confirm();
      this.scene.restart({ screen: 'title' } satisfies MenuSceneData);
    });

    // Keep the panel in the display list even though it does not need direct
    // interaction; naming it here also documents the setup screen's main card.
    panel.setName('language-setup-panel');
  }

  private createChapterSelect(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, 1540, 760, 0x061a28, 0.9)
      .setStrokeStyle(2, Palette.accent, 0.42)
      .setDepth(5);

    this.add
      .text(GAME_WIDTH / 2, 126, i18n.t('menu.selectChapter'), {
        fontFamily: 'sans-serif',
        fontSize: '48px',
        color: Palette.textLight,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.add
      .text(GAME_WIDTH / 2, 180, i18n.t('menu.subtitle'), {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: Palette.textMuted,
      })
      .setOrigin(0.5)
      .setDepth(10);

    const chapterComplete = gameState.completedMissionIds.length > 0;
    this.addChapterCard(
      555,
      500,
      '01',
      i18n.t('menu.chapter1'),
      i18n.t('menu.chapter1Description'),
      i18n.t(chapterComplete ? 'menu.chapter1Complete' : 'menu.chapter1Status'),
      true,
      () => this.startChapter(1),
    );
    this.addChapterCard(
      1365,
      500,
      '02',
      i18n.t('menu.chapter2'),
      i18n.t('menu.chapter2Description'),
      i18n.t('menu.chapter2Status'),
      true,
      () => this.startChapter(2),
    );

    this.addMenuButton(112, GAME_HEIGHT - 76, 300, i18n.t('menu.backToTitle'), false, () => {
      this.scene.restart({ screen: 'title' } satisfies MenuSceneData);
    });
  }

  private startChapter(chapter: 1 | 2): void {
    if (this.chapterTransitionStarted) return;
    this.chapterTransitionStarted = true;
    gameState.selectedChapter = chapter;
    this.input.enabled = false;

    // Start on the next game tick. This prevents the chapter-card pointer-up
    // event from leaking into the newly created scene and immediately blocking
    // or activating its first modal.
    this.time.delayedCall(0, () => {
      if (chapter === 1) {
        this.scene.start(SceneKeys.Opening, { startWithNarration: true });
        return;
      }
      this.scene.start(SceneKeys.Chapter2Lab);
    });
  }

  private addChapterCard(
    x: number,
    y: number,
    number: string,
    title: string,
    description: string,
    status: string,
    enabled: boolean,
    onClick: () => void,
  ): void {
    const card = this.add
      .rectangle(x, y, 660, 470, enabled ? 0x0a3345 : 0x0b2632, 0.96)
      .setStrokeStyle(2, enabled ? Palette.accent : 0x40606d, enabled ? 0.75 : 0.5)
      .setDepth(8)
      .setInteractive({ useHandCursor: enabled });
    this.add
      .text(x - 274, y - 185, `CHAPTER  /  ${number}`, {
        fontFamily: 'monospace',
        fontSize: '17px',
        color: enabled ? Palette.accentText : Palette.textMuted,
        fontStyle: 'bold',
      })
      .setDepth(9);
    this.add
      .text(x - 274, y - 105, title, {
        fontFamily: 'sans-serif',
        fontSize: '36px',
        color: enabled ? Palette.textLight : '#7892a0',
        fontStyle: 'bold',
        wordWrap: { width: 540, useAdvancedWrap: true },
      })
      .setDepth(9);
    this.add
      .text(x - 274, y + 4, description, {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: enabled ? '#b7d2dc' : '#6f8994',
        lineSpacing: 7,
        wordWrap: { width: 540, useAdvancedWrap: true },
      })
      .setDepth(9);
    this.add
      .text(x - 274, y + 158, status, {
        fontFamily: 'sans-serif',
        fontSize: '17px',
        color: enabled ? '#91e6a7' : '#f0c95a',
        backgroundColor: enabled ? '#123f3c' : '#3d3522',
        padding: { x: 14, y: 7 },
      })
      .setDepth(9);

    if (!enabled) return;
    card.on(Phaser.Input.Events.POINTER_OVER, () => card.setFillStyle(0x0d4052, 0.98));
    card.on(Phaser.Input.Events.POINTER_OUT, () => card.setFillStyle(0x0a3345, 0.96));
    card.on(Phaser.Input.Events.POINTER_UP, onClick);
  }

  private addMenuButton(
    x: number,
    y: number,
    width: number,
    label: string,
    primary: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const height = primary ? 62 : 52;
    const glow = this.add
      .rectangle(0, 0, width + 12, height + 12, 0x168b82, 0)
      .setStrokeStyle(5, 0xa4fff5, primary ? 0.68 : 0)
      .setAlpha(primary ? 0.18 : 0);
    const background = this.add
      .rectangle(0, 0, width, height, primary ? 0x168b82 : 0x092d40, primary ? 0.98 : 0.9)
      .setStrokeStyle(2, primary ? 0xa4fff5 : 0x4f8292, primary ? 0.74 : 0.44)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'sans-serif',
        fontSize: primary ? '25px' : '20px',
        color: Palette.textLight,
        fontStyle: primary ? 'bold' : 'normal',
      })
      .setOrigin(0.5);
    const container = this.add.container(x + width / 2, y, [glow, background, text]).setDepth(15);
    if (primary) {
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.12, to: 0.72 },
        scale: { from: 0.995, to: 1.035 },
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    background.on(Phaser.Input.Events.POINTER_OVER, () => {
      background.setFillStyle(primary ? 0x20a198 : 0x10465b, 1);
      container.setScale(1.02);
    });
    background.on(Phaser.Input.Events.POINTER_OUT, () => {
      background.setFillStyle(primary ? 0x168b82 : 0x092d40, primary ? 0.98 : 0.9);
      container.setScale(1);
    });
    background.on(Phaser.Input.Events.POINTER_UP, onClick);
    return container;
  }

  private addChoiceButton(
    x: number,
    y: number,
    width: number,
    label: string,
    selected: boolean,
    onClick: () => void,
  ): Phaser.GameObjects.Container {
    const background = this.add
      .rectangle(0, 0, width, 108, selected ? 0x167f79 : 0x092d40, selected ? 1 : 0.92)
      .setStrokeStyle(2, selected ? 0xa4fff5 : 0x416f7f, selected ? 0.9 : 0.58)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, {
        fontFamily: 'sans-serif',
        fontSize: '20px',
        color: selected ? '#ffffff' : '#c4d9e1',
        align: 'center',
        fontStyle: selected ? 'bold' : 'normal',
        lineSpacing: 7,
      })
      .setOrigin(0.5);
    const check = this.add
      .text(width / 2 - 18, -54 + 13, selected ? '✓' : '', {
        fontFamily: 'sans-serif',
        fontSize: '18px',
        color: '#d7fff8',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    const container = this.add.container(x, y, [background, text, check]).setDepth(15);
    background.on(Phaser.Input.Events.POINTER_OVER, () => {
      background.setFillStyle(selected ? 0x1a9188 : 0x10465b, 1);
      container.setScale(1.02);
    });
    background.on(Phaser.Input.Events.POINTER_OUT, () => {
      background.setFillStyle(selected ? 0x167f79 : 0x092d40, selected ? 1 : 0.92);
      container.setScale(1);
    });
    background.on(Phaser.Input.Events.POINTER_UP, onClick);
    return container;
  }

  private sharpenText(): void {
    const resolution = Math.min(window.devicePixelRatio || 1, 2);
    for (const object of this.children.list) {
      if (object instanceof Phaser.GameObjects.Text) object.setResolution(resolution);
    }
  }
}
