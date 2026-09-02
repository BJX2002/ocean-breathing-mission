import Phaser from 'phaser';
import { Palette } from '../config/constants';

export type ResearchButtonTone = 'primary' | 'secondary' | 'locked' | 'danger';

export interface ResearchSurfaceOptions {
  readonly fill?: number;
  readonly fillAlpha?: number;
  readonly border?: number;
  readonly borderAlpha?: number;
  readonly radius?: number;
  readonly depth?: number;
  readonly shadow?: boolean;
  readonly goldRail?: boolean;
}

/**
 * Shared visual language for teaching panels: rounded navy surfaces, a quiet
 * shadow and one restrained gold rail. It intentionally avoids stacking
 * several equally bright cyan rectangles around the same content.
 */
export function createResearchSurface(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  options: ResearchSurfaceOptions = {},
): Phaser.GameObjects.Graphics {
  const radius = options.radius ?? 26;
  const left = x - width / 2;
  const top = y - height / 2;
  const graphics = scene.add.graphics().setDepth(options.depth ?? 0);

  if (options.shadow ?? true) {
    graphics.fillStyle(0x01060b, 0.38);
    graphics.fillRoundedRect(left + 12, top + 16, width, height, radius);
  }

  graphics.fillStyle(options.fill ?? Palette.modal, options.fillAlpha ?? 0.99);
  graphics.fillRoundedRect(left, top, width, height, radius);
  graphics.lineStyle(2, options.border ?? Palette.accentSoft, options.borderAlpha ?? 0.44);
  graphics.strokeRoundedRect(left, top, width, height, radius);

  if (options.goldRail ?? false) {
    graphics.fillStyle(Palette.gold, 0.95);
    graphics.fillRoundedRect(left + 34, top + 22, 92, 6, 3);
  }
  return graphics;
}

export interface ResearchButtonOptions {
  readonly tone?: ResearchButtonTone;
  readonly fontSize?: number;
  readonly depth?: number;
  readonly radius?: number;
  readonly onPress?: () => void;
}

/** A reusable rounded button with hover/focus feedback and a stable hit area. */
export class ResearchButton {
  public readonly root: Phaser.GameObjects.Container;
  public readonly label: Phaser.GameObjects.Text;

  private readonly background: Phaser.GameObjects.Graphics;
  private readonly hitArea: Phaser.GameObjects.Rectangle;
  private enabled = true;
  private tone: ResearchButtonTone;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly width: number,
    private readonly height: number,
    text: string,
    private readonly options: ResearchButtonOptions = {},
  ) {
    this.tone = options.tone ?? 'secondary';
    this.root = scene.add.container(x, y).setDepth(options.depth ?? 0).setSize(width, height);
    this.background = scene.add.graphics();
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: 'sans-serif',
        fontSize: `${options.fontSize ?? 23}px`,
        color: Palette.textLight,
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: width - 40, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    this.hitArea = scene.add
      .rectangle(0, 0, width, height, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    this.root.add([this.background, this.label, this.hitArea]);
    this.paint(false);

    this.hitArea.on(Phaser.Input.Events.POINTER_OVER, () => {
      if (!this.enabled) return;
      this.paint(true);
      this.root.setScale(1.018);
    });
    this.hitArea.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.paint(false);
      this.root.setScale(1);
    });
    this.hitArea.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.enabled) this.root.setScale(0.985);
    });
    this.hitArea.on(Phaser.Input.Events.POINTER_UP, () => {
      if (!this.enabled) return;
      this.root.setScale(1.018);
      options.onPress?.();
    });
  }

  public setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  public setTone(tone: ResearchButtonTone): this {
    this.tone = tone;
    this.paint(false);
    return this;
  }

  public setEnabled(enabled: boolean): this {
    this.enabled = enabled;
    this.root.setAlpha(enabled ? 1 : 0.64);
    if (enabled) this.hitArea.setInteractive({ useHandCursor: true });
    else this.hitArea.disableInteractive();
    this.paint(false);
    return this;
  }

  public onPress(callback: () => void): this {
    this.hitArea.on(Phaser.Input.Events.POINTER_UP, () => {
      if (this.enabled) callback();
    });
    return this;
  }

  private paint(hovered: boolean): void {
    const radius = this.options.radius ?? 14;
    const fillByTone: Readonly<Record<ResearchButtonTone, number>> = {
      primary: Palette.accentDark,
      secondary: Palette.card,
      locked: 0x2a424a,
      danger: 0x754039,
    };
    const borderByTone: Readonly<Record<ResearchButtonTone, number>> = {
      primary: Palette.accentSoft,
      secondary: 0x6bbdc1,
      locked: 0x66808a,
      danger: 0xe4a294,
    };
    this.background.clear();
    this.background.fillStyle(0x01060b, 0.28);
    this.background.fillRoundedRect(-this.width / 2 + 4, -this.height / 2 + 7, this.width, this.height, radius);
    this.background.fillStyle(fillByTone[this.tone], hovered ? 1 : 0.96);
    this.background.fillRoundedRect(-this.width / 2, -this.height / 2, this.width, this.height, radius);
    this.background.lineStyle(2, borderByTone[this.tone], hovered ? 0.95 : 0.58);
    this.background.strokeRoundedRect(-this.width / 2, -this.height / 2, this.width, this.height, radius);
  }
}
