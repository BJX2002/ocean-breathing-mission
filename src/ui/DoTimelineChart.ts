import Phaser from 'phaser';
import { Palette } from '../config/constants';
import {
  DEFAULT_DAWN_DIP_SERIES,
  findLowestDoReading,
  normalizeDoReadings,
  type DoReading,
} from './DoTimelineModel';

export type { DoReading } from './DoTimelineModel';

export interface DoTimelineChartBounds {
  /** Local x position inside the supplied parent container. */
  readonly x: number;
  /** Local y position inside the supplied parent container. */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DoTimelineChartCopy {
  readonly title: string;
  readonly unit: string;
  readonly emptyStatus: string;
  readonly emptyPrompt: string;
  readonly manualStatus: string;
  readonly manualHint: string;
  readonly continuousStatus: string;
  readonly continuousHint: string;
  readonly sampleLabel: string;
  readonly detectedLabel: string;
  readonly thresholdLabel: string;
  readonly dawnLabel: string;
}

export interface DoTimelineChartOptions {
  readonly copy?: Partial<DoTimelineChartCopy>;
  /** Educational alert line only; it must not be presented as a product specification. */
  readonly thresholdMgPerL?: number;
  readonly minMgPerL?: number;
  readonly maxMgPerL?: number;
  readonly depth?: number;
}

type ChartMode = 'empty' | 'manual' | 'continuous';

const DEFAULT_COPY: DoTimelineChartCopy = {
  title: '24 小時 DO 記錄',
  unit: 'DO（mg/L）',
  emptyStatus: '等待監測',
  emptyPrompt: '選擇監測方法，看看一天內的 DO 變化。',
  manualStatus: '只量了一次',
  manualHint: '其他時間發生了什麼？',
  continuousStatus: '整晚持續記錄',
  continuousHint: '✓ 連續資料找到了清晨的變化',
  sampleLabel: '一次讀數',
  detectedLabel: '抓到了！清晨低氧',
  thresholdLabel: '教學警戒線',
  dawnLabel: '清晨',
};

const TEXT_FONT = 'Arial, "Noto Sans TC", sans-serif';
const NUMBER_FONT = '"Courier New", monospace';

interface PlotRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Compact 24-hour dissolved-oxygen chart for Chapter 2 teaching moments.
 *
 * Bounds are local to `parent`. Call one of the `show...` methods whenever the
 * monitoring method changes. `setBounds` redraws the chart for a resized modal.
 */
export class DoTimelineChart {
  readonly container: Phaser.GameObjects.Container;

  private readonly copy: DoTimelineChartCopy;
  private readonly thresholdMgPerL: number;
  private readonly minMgPerL: number;
  private readonly maxMgPerL: number;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private bounds: DoTimelineChartBounds;
  private mode: ChartMode = 'empty';
  private manualReading: DoReading = { hour: 14.33, value: 5.8 };
  private continuousReadings: readonly DoReading[] = DEFAULT_DAWN_DIP_SERIES;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    bounds: DoTimelineChartBounds,
    options: DoTimelineChartOptions = {},
  ) {
    this.bounds = this.sanitizeBounds(bounds);
    this.copy = { ...DEFAULT_COPY, ...options.copy };
    this.minMgPerL = options.minMgPerL ?? 0;
    this.maxMgPerL = Math.max(this.minMgPerL + 1, options.maxMgPerL ?? 8);
    this.thresholdMgPerL = Phaser.Math.Clamp(
      options.thresholdMgPerL ?? 4,
      this.minMgPerL,
      this.maxMgPerL,
    );

    this.container = scene.add.container(this.bounds.x, this.bounds.y).setDepth(options.depth ?? 0);
    parent.add(this.container);
    this.render();
  }

  showEmpty(): this {
    if (this.destroyed) return this;
    this.mode = 'empty';
    this.render();
    return this;
  }

  showManualSample(reading: DoReading = { hour: 14.33, value: 5.8 }): this {
    if (this.destroyed) return this;
    const normalized = normalizeDoReadings([reading], this.minMgPerL, this.maxMgPerL);
    this.manualReading = normalized[0] ?? { hour: 14.33, value: 5.8 };
    this.mode = 'manual';
    this.render();
    return this;
  }

  showContinuousSeries(readings: readonly DoReading[] = DEFAULT_DAWN_DIP_SERIES): this {
    if (this.destroyed) return this;
    const normalized = normalizeDoReadings(readings, this.minMgPerL, this.maxMgPerL);
    this.continuousReadings = normalized.length > 0 ? normalized : DEFAULT_DAWN_DIP_SERIES;
    this.mode = 'continuous';
    this.render();
    return this;
  }

  /** Redraw at a new size without changing the currently displayed data mode. */
  setBounds(bounds: DoTimelineChartBounds): this {
    if (this.destroyed) return this;
    this.bounds = this.sanitizeBounds(bounds);
    this.container.setPosition(this.bounds.x, this.bounds.y);
    this.render();
    return this;
  }

  setVisible(visible: boolean): this {
    if (!this.destroyed) this.container.setVisible(visible);
    return this;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearObjects();
    this.container.destroy();
  }

  private render(): void {
    this.clearObjects();
    const { width, height } = this.bounds;
    const scale = Phaser.Math.Clamp(Math.min(width / 860, height / 310), 0.68, 1.12);
    const padding = Phaser.Math.Clamp(width * 0.032, 14, 28);
    const headerHeight = Phaser.Math.Clamp(height * 0.18, 46, 62);
    const footerHeight = Phaser.Math.Clamp(height * 0.16, 34, 50);
    const plotLeft = padding + 48 * scale;
    const plotRight = width - padding;
    const plotTop = headerHeight + 12 * scale;
    const plotBottom = Math.max(plotTop + 56, height - footerHeight);
    const plot: PlotRect = {
      left: plotLeft,
      right: plotRight,
      top: plotTop,
      bottom: plotBottom,
      width: Math.max(1, plotRight - plotLeft),
      height: Math.max(1, plotBottom - plotTop),
    };

    const surface = this.scene.add.graphics();
    surface.fillStyle(Palette.modalRaised, 0.98);
    surface.fillRoundedRect(0, 0, width, height, 18 * scale);
    surface.lineStyle(2, Palette.accent, 0.4);
    surface.strokeRoundedRect(0, 0, width, height, 18 * scale);
    this.add(surface);

    this.drawPlot(surface, plot, scale);
    this.drawHeader(surface, padding, width, scale);

    if (this.mode === 'manual') this.drawManualSeries(surface, plot, scale);
    else if (this.mode === 'continuous') this.drawContinuousSeries(surface, plot, scale);
    else this.drawEmptyState(plot, scale);

    this.drawFooter(width, height, scale);
  }

  private drawHeader(
    graphics: Phaser.GameObjects.Graphics,
    padding: number,
    width: number,
    scale: number,
  ): void {
    const status =
      this.mode === 'manual'
        ? this.copy.manualStatus
        : this.mode === 'continuous'
          ? this.copy.continuousStatus
          : this.copy.emptyStatus;
    const statusColor =
      this.mode === 'manual'
        ? Palette.gold
        : this.mode === 'continuous'
          ? Palette.success
          : Palette.accent;
    const chipWidth = Phaser.Math.Clamp(width * 0.31, 112, 194);
    const chipHeight = 30 * scale;
    const chipX = width - padding - chipWidth;
    const chipY = 14 * scale;

    graphics.fillStyle(statusColor, 0.14);
    graphics.fillRoundedRect(chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
    graphics.lineStyle(1, statusColor, 0.6);
    graphics.strokeRoundedRect(chipX, chipY, chipWidth, chipHeight, chipHeight / 2);
    graphics.fillStyle(statusColor, 1);
    graphics.fillCircle(chipX + 14 * scale, chipY + chipHeight / 2, 4 * scale);

    this.addText(padding, 14 * scale, this.copy.title, {
      fontFamily: TEXT_FONT,
      fontSize: `${Math.round(21 * scale)}px`,
      color: Palette.textLight,
      fontStyle: 'bold',
    });
    this.addText(chipX + chipWidth / 2 + 5 * scale, chipY + chipHeight / 2, status, {
      fontFamily: TEXT_FONT,
      fontSize: `${Math.round(13 * scale)}px`,
      color: this.numberToCss(statusColor),
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
  }

  private drawPlot(graphics: Phaser.GameObjects.Graphics, plot: PlotRect, scale: number): void {
    const dawnLeft = this.xForHour(4, plot);
    const dawnRight = this.xForHour(7, plot);
    const thresholdY = this.yForValue(this.thresholdMgPerL, plot);

    // Dawn and low-oxygen regions are restrained background cues, not extra panels.
    graphics.fillStyle(Palette.gold, 0.055);
    graphics.fillRect(dawnLeft, plot.top, dawnRight - dawnLeft, plot.height);
    graphics.fillStyle(Palette.danger, 0.1);
    graphics.fillRect(plot.left, thresholdY, plot.width, plot.bottom - thresholdY);

    for (const value of [0, 2, 4, 6, 8]) {
      if (value < this.minMgPerL || value > this.maxMgPerL) continue;
      const y = this.yForValue(value, plot);
      graphics.lineStyle(1, value === 0 ? Palette.accentSoft : 0x91b9c6, value === 0 ? 0.38 : 0.16);
      graphics.lineBetween(plot.left, y, plot.right, y);
      this.addText(plot.left - 9 * scale, y, String(value), {
        fontFamily: NUMBER_FONT,
        fontSize: `${Math.round(11 * scale)}px`,
        color: Palette.textMuted,
        align: 'right',
      }).setOrigin(1, 0.5);
    }

    for (const hour of [0, 6, 12, 18, 24]) {
      const x = this.xForHour(hour, plot);
      graphics.lineStyle(1, 0x91b9c6, 0.11);
      graphics.lineBetween(x, plot.top, x, plot.bottom);
      this.addText(x, plot.bottom + 9 * scale, `${String(hour).padStart(2, '0')}:00`, {
        fontFamily: NUMBER_FONT,
        fontSize: `${Math.round(11 * scale)}px`,
        color: Palette.textMuted,
      }).setOrigin(0.5, 0);
    }

    graphics.lineStyle(2, Palette.danger, 0.72);
    this.drawDashedLine(graphics, plot.left, thresholdY, plot.right, 8 * scale, 5 * scale);

    this.addText(plot.left, plot.top - 7 * scale, this.copy.unit, {
      fontFamily: NUMBER_FONT,
      fontSize: `${Math.round(11 * scale)}px`,
      color: Palette.textMuted,
      fontStyle: 'bold',
    }).setOrigin(0, 1);

    const thresholdText = `${this.copy.thresholdLabel}  ${this.thresholdMgPerL.toFixed(1)} mg/L`;
    this.addText(plot.right - 5 * scale, thresholdY - 5 * scale, thresholdText, {
      fontFamily: TEXT_FONT,
      fontSize: `${Math.round(11 * scale)}px`,
      color: '#ff9f8c',
      fontStyle: 'bold',
      backgroundColor: '#281c21dd',
      padding: { x: Math.round(5 * scale), y: Math.round(2 * scale) },
    }).setOrigin(1, 1);

    this.addText((dawnLeft + dawnRight) / 2, plot.top + 5 * scale, this.copy.dawnLabel, {
      fontFamily: TEXT_FONT,
      fontSize: `${Math.round(10 * scale)}px`,
      color: '#f5d778',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
  }

  private drawEmptyState(plot: PlotRect, scale: number): void {
    this.addText(
      (plot.left + plot.right) / 2,
      (plot.top + plot.bottom) / 2,
      this.copy.emptyPrompt,
      {
        fontFamily: TEXT_FONT,
        fontSize: `${Math.round(16 * scale)}px`,
        color: Palette.textMuted,
        align: 'center',
        wordWrap: { width: plot.width * 0.72, useAdvancedWrap: true },
      },
    ).setOrigin(0.5);
  }

  private drawManualSeries(
    graphics: Phaser.GameObjects.Graphics,
    plot: PlotRect,
    scale: number,
  ): void {
    const missingHours = [2, 6, 10, 18, 22];
    missingHours.forEach((hour, index) => {
      const value = index % 2 === 0 ? 5 : 4.7;
      this.addText(this.xForHour(hour, plot), this.yForValue(value, plot), '?', {
        fontFamily: TEXT_FONT,
        fontSize: `${Math.round(25 * scale)}px`,
        color: '#6e96a8',
        fontStyle: 'bold',
      })
        .setOrigin(0.5)
        .setAlpha(0.56);
    });

    const x = this.xForHour(this.manualReading.hour, plot);
    const y = this.yForValue(this.manualReading.value, plot);
    graphics.lineStyle(2, Palette.gold, 0.36);
    this.drawDashedVerticalLine(graphics, x, y + 10 * scale, plot.bottom, 6 * scale, 5 * scale);
    graphics.lineStyle(3, Palette.gold, 0.55);
    graphics.strokeCircle(x, y, 11 * scale);
    graphics.fillStyle(Palette.gold, 1);
    graphics.fillCircle(x, y, 5 * scale);

    const time = this.formatHour(this.manualReading.hour);
    const label = `${this.copy.sampleLabel}  ${time} · ${this.manualReading.value.toFixed(1)} mg/L`;
    this.addText(
      Phaser.Math.Clamp(x, plot.left + 95 * scale, plot.right - 95 * scale),
      y - 14 * scale,
      label,
      {
        fontFamily: TEXT_FONT,
        fontSize: `${Math.round(12 * scale)}px`,
        color: '#ffe28b',
        fontStyle: 'bold',
        backgroundColor: '#332b18ee',
        padding: { x: Math.round(7 * scale), y: Math.round(4 * scale) },
      },
    ).setOrigin(0.5, 1);
  }

  private drawContinuousSeries(
    graphics: Phaser.GameObjects.Graphics,
    plot: PlotRect,
    scale: number,
  ): void {
    const points = this.continuousReadings.map(
      (reading) =>
        new Phaser.Math.Vector2(
          this.xForHour(reading.hour, plot),
          this.yForValue(reading.value, plot),
        ),
    );
    const first = points[0];
    const last = points[points.length - 1];

    if (first !== undefined && last !== undefined) {
      graphics.fillStyle(Palette.accent, 0.11);
      graphics.fillPoints(
        [
          new Phaser.Math.Vector2(first.x, plot.bottom),
          ...points,
          new Phaser.Math.Vector2(last.x, plot.bottom),
        ],
        true,
      );
      graphics.lineStyle(Math.max(2, 3 * scale), Palette.accentSoft, 1);
      graphics.beginPath();
      graphics.moveTo(first.x, first.y);
      for (let index = 1; index < points.length; index += 1) {
        const point = points[index];
        if (point !== undefined) graphics.lineTo(point.x, point.y);
      }
      graphics.strokePath();
    }

    this.continuousReadings.forEach((reading) => {
      const x = this.xForHour(reading.hour, plot);
      const y = this.yForValue(reading.value, plot);
      const low = reading.value < this.thresholdMgPerL;
      graphics.fillStyle(low ? Palette.danger : Palette.accentSoft, 1);
      graphics.fillCircle(x, y, (low ? 4.5 : 3) * scale);
    });

    const minimum = findLowestDoReading(this.continuousReadings);
    if (minimum === null || minimum.value >= this.thresholdMgPerL) return;
    const markerX = this.xForHour(minimum.hour, plot);
    const markerY = this.yForValue(minimum.value, plot);
    graphics.lineStyle(3, Palette.danger, 0.64);
    graphics.strokeCircle(markerX, markerY, 12 * scale);
    graphics.lineStyle(2, Palette.danger, 0.3);
    this.drawDashedVerticalLine(
      graphics,
      markerX,
      plot.top + 20 * scale,
      markerY - 13 * scale,
      6 * scale,
      5 * scale,
    );

    const labelX = Phaser.Math.Clamp(
      markerX + 16 * scale,
      plot.left + 95 * scale,
      plot.right - 95 * scale,
    );
    const labelY = Math.max(plot.top + 26 * scale, markerY - 18 * scale);
    this.addText(
      labelX,
      labelY,
      `${this.copy.detectedLabel}\n${this.formatHour(minimum.hour)} · ${minimum.value.toFixed(1)} mg/L`,
      {
        fontFamily: TEXT_FONT,
        fontSize: `${Math.round(12 * scale)}px`,
        color: '#ffd7cd',
        fontStyle: 'bold',
        lineSpacing: Math.round(2 * scale),
        backgroundColor: '#442127ee',
        padding: { x: Math.round(7 * scale), y: Math.round(4 * scale) },
        align: 'center',
      },
    ).setOrigin(0.5, 1);
  }

  private drawFooter(width: number, height: number, scale: number): void {
    const text =
      this.mode === 'manual'
        ? this.copy.manualHint
        : this.mode === 'continuous'
          ? this.copy.continuousHint
          : '';
    if (text === '') return;
    this.addText(width / 2, height - 8 * scale, text, {
      fontFamily: TEXT_FONT,
      fontSize: `${Math.round(13 * scale)}px`,
      color: this.mode === 'continuous' ? '#aaf2bb' : '#f4d678',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5, 1);
  }

  private addText(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): Phaser.GameObjects.Text {
    const label = this.scene.add.text(x, y, text, style);
    this.add(label);
    return label;
  }

  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    this.container.add(object);
    return object;
  }

  private clearObjects(): void {
    for (const object of this.objects.splice(0)) object.destroy();
  }

  private xForHour(hour: number, plot: PlotRect): number {
    return plot.left + (Phaser.Math.Clamp(hour, 0, 24) / 24) * plot.width;
  }

  private yForValue(value: number, plot: PlotRect): number {
    const ratio =
      (Phaser.Math.Clamp(value, this.minMgPerL, this.maxMgPerL) - this.minMgPerL) /
      (this.maxMgPerL - this.minMgPerL);
    return plot.bottom - ratio * plot.height;
  }

  private drawDashedLine(
    graphics: Phaser.GameObjects.Graphics,
    fromX: number,
    y: number,
    toX: number,
    dash: number,
    gap: number,
  ): void {
    for (let x = fromX; x < toX; x += dash + gap) {
      graphics.lineBetween(x, y, Math.min(x + dash, toX), y);
    }
  }

  private drawDashedVerticalLine(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    fromY: number,
    toY: number,
    dash: number,
    gap: number,
  ): void {
    if (toY <= fromY) return;
    for (let y = fromY; y < toY; y += dash + gap) {
      graphics.lineBetween(x, y, x, Math.min(y + dash, toY));
    }
  }

  private formatHour(hour: number): string {
    const totalMinutes = Math.round(Phaser.Math.Clamp(hour, 0, 24) * 60);
    const displayedMinutes = totalMinutes === 1440 ? 0 : totalMinutes;
    const hours = Math.floor(displayedMinutes / 60);
    const minutes = displayedMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private sanitizeBounds(bounds: DoTimelineChartBounds): DoTimelineChartBounds {
    return {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(320, bounds.width),
      height: Math.max(180, bounds.height),
    };
  }

  private numberToCss(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`;
  }
}
