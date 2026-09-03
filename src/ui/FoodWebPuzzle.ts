import Phaser from 'phaser';
import { Palette } from '../config/constants';
import { createResearchSurface } from './ResearchUi';

export type FoodWebZoneId = 'small-fish' | 'predator' | 'seabed';

export interface FoodWebCardSpec {
  readonly speciesId: string;
  readonly label: string;
  readonly textureKey: string | null;
  readonly status: string;
  readonly statusColor: string;
  readonly zone: FoodWebZoneId;
}

export interface FoodWebPuzzleCopy {
  readonly title: string;
  readonly hint: string;
  readonly producer: string;
  readonly smallFish: string;
  readonly predator: string;
  readonly seabed: string;
  readonly tray: string;
  readonly progress: string;
  readonly complete: string;
  readonly wrongZone: string;
}

export interface FoodWebPuzzleOptions {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly cards: readonly FoodWebCardSpec[];
  readonly copy: FoodWebPuzzleCopy;
  readonly onComplete?: () => void;
}

interface ZoneLayout {
  readonly id: FoodWebZoneId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly slots: readonly { x: number; y: number }[];
}

interface DraggableCard {
  readonly spec: FoodWebCardSpec;
  readonly root: Phaser.GameObjects.Container;
  readonly background: Phaser.GameObjects.Graphics;
  readonly homeX: number;
  readonly homeY: number;
  placed: boolean;
}

/**
 * A compact, tactile food-web builder used in the Chapter 1 evidence room.
 * Players arrange their photographed organisms by ecological role. The
 * arrows are intentionally qualified as possible links rather than a claim
 * that one field visit proves every predator-prey relationship.
 */
export class FoodWebPuzzle {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly cards: DraggableCard[] = [];
  private readonly occupiedSlots = new Map<FoodWebZoneId, number>();
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly feedbackText: Phaser.GameObjects.Text;
  private placedCount = 0;
  private completeNotified = false;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: FoodWebPuzzleOptions,
  ) {
    const { x, y, width, height, depth, copy } = options;
    const left = x - width / 2;
    const top = y - height / 2;

    const panel = createResearchSurface(scene, x, y, width, height, {
      depth,
      fill: Palette.modal,
      border: Palette.accentSoft,
      borderAlpha: 0.38,
      radius: 22,
      shadow: false,
    });
    this.objects.push(panel);

    this.objects.push(
      scene.add.text(left + 28, top + 20, copy.title, {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#9cf7ef',
        fontStyle: 'bold',
      }).setDepth(depth + 2),
      scene.add.text(left + 28, top + 51, copy.hint, {
        fontFamily: 'sans-serif',
        fontSize: '19px',
        color: '#9bb9c9',
        wordWrap: { width: width - 320, useAdvancedWrap: true },
      }).setDepth(depth + 2),
    );

    this.progressText = scene.add.text(left + width - 28, top + 22, '', {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: '#f0c95a',
      fontStyle: 'bold',
      align: 'right',
    }).setOrigin(1, 0).setDepth(depth + 2);
    this.objects.push(this.progressText);

    const zoneTop = top + 96;
    const zoneHeight = 236;
    const zones: readonly ZoneLayout[] = [
      {
        id: 'small-fish',
        x: left + 520,
        y: zoneTop + zoneHeight / 2,
        width: 278,
        height: zoneHeight,
        slots: [
          { x: left + 520, y: zoneTop + 74 },
          { x: left + 520, y: zoneTop + 132 },
          { x: left + 520, y: zoneTop + 190 },
        ],
      },
      {
        id: 'predator',
        x: left + 858,
        y: zoneTop + zoneHeight / 2,
        width: 238,
        height: zoneHeight,
        slots: [{ x: left + 858, y: zoneTop + 132 }],
      },
      {
        id: 'seabed',
        x: left + 1164,
        y: zoneTop + zoneHeight / 2,
        width: 270,
        height: zoneHeight,
        slots: [
          { x: left + 1164, y: zoneTop + 100 },
          { x: left + 1164, y: zoneTop + 168 },
        ],
      },
    ];

    this.createConnections(left, zoneTop, depth + 1);
    this.createProducerNode(left + 184, zoneTop + zoneHeight / 2, copy.producer, depth + 3);

    for (const zone of zones) {
      this.occupiedSlots.set(zone.id, 0);
      this.createZone(zone, this.getZoneTitle(zone.id), depth + 2);
    }

    const trayY = top + height - 58;
    const tray = scene.add.graphics().setDepth(depth + 1);
    tray.fillStyle(0x0b2b3b, 0.96);
    tray.fillRoundedRect(left + 20, trayY - 49, width - 40, 98, 12);
    tray.lineStyle(1, 0x3fd0c9, 0.32);
    tray.strokeRoundedRect(left + 20, trayY - 49, width - 40, 98, 12);
    this.objects.push(tray);
    this.objects.push(
      scene.add.text(left + 38, trayY - 40, copy.tray, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#7fa8bd',
        fontStyle: 'bold',
      }).setDepth(depth + 3),
    );

    const cardGap = 10;
    const cardWidth = 190;
    const rowWidth = options.cards.length * cardWidth + (options.cards.length - 1) * cardGap;
    const firstCardX = x - rowWidth / 2 + cardWidth / 2;
    options.cards.forEach((spec, index) => {
      this.createCard(spec, firstCardX + index * (cardWidth + cardGap), trayY + 11, depth + 5, zones);
    });

    this.feedbackText = scene.add.text(x, zoneTop + zoneHeight + 18, '', {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: '#f2a679',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(depth + 4);
    this.objects.push(this.feedbackText);
    this.updateProgress();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const object of this.objects) {
      object.destroy();
    }
    this.objects.length = 0;
    this.cards.length = 0;
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return;
    for (const object of this.objects) {
      const visibleObject = object as Phaser.GameObjects.GameObject & {
        setVisible(value: boolean): Phaser.GameObjects.GameObject;
      };
      visibleObject.setVisible(visible).setActive(visible);
    }
  }

  private getZoneTitle(id: FoodWebZoneId): string {
    if (id === 'small-fish') return this.options.copy.smallFish;
    if (id === 'predator') return this.options.copy.predator;
    return this.options.copy.seabed;
  }

  private createConnections(left: number, zoneTop: number, depth: number): void {
    const g = this.scene.add.graphics().setDepth(depth);
    const y = zoneTop + 118;
    this.drawArrow(g, left + 286, y, left + 365, y, 0x5ce4d9);
    this.drawArrow(g, left + 662, y, left + 724, y, 0xf0c95a);
    this.drawArrow(g, left + 980, y + 18, left + 1027, y + 18, 0x82d9b0);

    g.lineStyle(3, 0x82d9b0, 0.56);
    g.beginPath();
    g.moveTo(left + 1164, zoneTop + 220);
    g.lineTo(left + 1164, zoneTop + 250);
    g.lineTo(left + 184, zoneTop + 250);
    g.lineTo(left + 184, zoneTop + 222);
    g.strokePath();
    g.fillStyle(0x82d9b0, 0.82);
    g.fillTriangle(left + 184, zoneTop + 214, left + 176, zoneTop + 227, left + 192, zoneTop + 227);
    this.objects.push(g);
  }

  private drawArrow(
    graphics: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
  ): void {
    graphics.lineStyle(4, color, 0.72);
    graphics.lineBetween(x1, y1, x2 - 12, y2);
    graphics.fillStyle(color, 0.88);
    graphics.fillTriangle(x2, y2, x2 - 15, y2 - 9, x2 - 15, y2 + 9);
  }

  private createProducerNode(x: number, y: number, title: string, depth: number): void {
    const root = this.scene.add.container(x, y).setDepth(depth);
    const glow = this.scene.add.circle(0, 0, 92, 0x3fd0c9, 0.08).setStrokeStyle(2, 0x9cf7ef, 0.7);
    const art = this.scene.add.graphics();
    art.fillStyle(0x164d4d, 1);
    art.fillRoundedRect(-82, -90, 164, 180, 18);
    art.lineStyle(2, 0x9cf7ef, 0.55);
    art.strokeRoundedRect(-82, -90, 164, 180, 18);
    art.lineStyle(8, 0x2fb985, 0.92);
    for (const offset of [-46, -20, 8, 36]) {
      art.beginPath();
      art.moveTo(offset, 48);
      art.lineTo(offset - 8, 4);
      art.lineTo(offset + 7, -46 - Math.abs(offset % 17));
      art.strokePath();
    }
    const label = this.scene.add.text(0, 68, title, {
      fontFamily: 'sans-serif',
      fontSize: '19px',
      color: '#d8fffb',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 142, useAdvancedWrap: true },
    }).setOrigin(0.5);
    root.add([glow, art, label]);
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.55, to: 1 },
      scale: { from: 0.96, to: 1.05 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.objects.push(root);
  }

  private createZone(zone: ZoneLayout, title: string, depth: number): void {
    const g = this.scene.add.graphics().setDepth(depth);
    g.fillStyle(zone.id === 'predator' ? 0x2b2836 : zone.id === 'seabed' ? 0x243d38 : 0x12384a, 0.92);
    g.fillRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 16);
    g.lineStyle(2, zone.id === 'predator' ? 0xf0c95a : 0x6eddd3, 0.52);
    g.strokeRoundedRect(zone.x - zone.width / 2, zone.y - zone.height / 2, zone.width, zone.height, 16);
    for (const slot of zone.slots) {
      g.lineStyle(2, 0xa7dcd4, 0.22);
      g.strokeRoundedRect(slot.x - 102, slot.y - 25, 204, 50, 9);
    }
    const label = this.scene.add.text(zone.x, zone.y - zone.height / 2 + 17, title, {
      fontFamily: 'sans-serif',
      fontSize: '20px',
      color: zone.id === 'predator' ? '#f0c95a' : '#9cf7ef',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5, 0).setDepth(depth + 1);
    this.objects.push(g, label);
  }

  private createCard(
    spec: FoodWebCardSpec,
    homeX: number,
    homeY: number,
    depth: number,
    zones: readonly ZoneLayout[],
  ): void {
    const root = this.scene.add.container(homeX, homeY).setDepth(depth).setSize(190, 62);
    const background = this.scene.add.graphics();
    this.paintCard(background, false);
    const icon = this.createCardIcon(spec.textureKey);
    const label = this.scene.add.text(21, -9, spec.label, {
      fontFamily: 'sans-serif',
      fontSize: '16px',
      color: '#e6f7ff',
      fontStyle: 'bold',
      align: 'center',
      wordWrap: { width: 116, useAdvancedWrap: true },
    }).setOrigin(0.5);
    const status = this.scene.add.text(21, 14, spec.status, {
      fontFamily: 'sans-serif',
      fontSize: '13px',
      color: spec.statusColor,
      align: 'center',
      wordWrap: { width: 116, useAdvancedWrap: true },
    }).setOrigin(0.5);
    root.add([background, icon, label, status]);
    root.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(root);

    const card: DraggableCard = { spec, root, background, homeX, homeY, placed: false };
    this.cards.push(card);
    this.objects.push(root);

    root.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, () => {
      if (card.placed) return;
      root.setDepth(depth + 20).setScale(1.04);
      this.paintCard(background, true);
      this.feedbackText.setText('');
    });
    root.on(Phaser.Input.Events.GAMEOBJECT_DRAG, (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (card.placed) return;
      root.setPosition(dragX, dragY);
    });
    root.on(Phaser.Input.Events.GAMEOBJECT_DRAG_END, () => {
      if (card.placed) return;
      const zone = zones.find((candidate) => this.contains(candidate, root.x, root.y));
      if (zone?.id === spec.zone) {
        this.placeCard(card, zone, depth);
      } else {
        this.rejectCard(card, depth);
      }
    });
  }

  private createCardIcon(textureKey: string | null): Phaser.GameObjects.GameObject {
    if (textureKey !== null && this.scene.textures.exists(textureKey)) {
      const source = this.scene.textures.get(textureKey).getSourceImage();
      const scale = Math.min(58 / source.width, 42 / source.height);
      return this.scene.add.image(-55, 0, textureKey).setDisplaySize(source.width * scale, source.height * scale);
    }
    const fallback = this.scene.add.graphics();
    fallback.fillStyle(0x3fd0c9, 0.85);
    fallback.fillEllipse(-55, 0, 44, 22);
    fallback.fillTriangle(-76, 0, -88, -10, -88, 10);
    return fallback;
  }

  private paintCard(background: Phaser.GameObjects.Graphics, active: boolean): void {
    background.clear();
    background.fillStyle(active ? 0x1b5963 : 0x0f4351, 0.98);
    background.fillRoundedRect(-95, -31, 190, 62, 10);
    background.lineStyle(active ? 3 : 2, active ? 0xf0c95a : 0x77ddd4, active ? 0.95 : 0.58);
    background.strokeRoundedRect(-95, -31, 190, 62, 10);
  }

  private contains(zone: ZoneLayout, x: number, y: number): boolean {
    return x >= zone.x - zone.width / 2 && x <= zone.x + zone.width / 2
      && y >= zone.y - zone.height / 2 && y <= zone.y + zone.height / 2;
  }

  private placeCard(card: DraggableCard, zone: ZoneLayout, depth: number): void {
    const occupied = this.occupiedSlots.get(zone.id) ?? 0;
    const slot = zone.slots[Math.min(occupied, zone.slots.length - 1)]!;
    this.occupiedSlots.set(zone.id, occupied + 1);
    card.placed = true;
    this.scene.input.setDraggable(card.root, false);
    card.root.disableInteractive().setDepth(depth + 6).setScale(0.93);
    this.paintCard(card.background, false);
    this.scene.tweens.add({
      targets: card.root,
      x: slot.x,
      y: slot.y,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.placedCount += 1;
    this.feedbackText.setColor('#91e6a7').setText(`✓ ${this.getZoneTitle(zone.id)}`);
    this.updateProgress();
  }

  private rejectCard(card: DraggableCard, depth: number): void {
    card.root.setDepth(depth + 5).setScale(1);
    this.paintCard(card.background, false);
    this.feedbackText.setColor('#f2a679').setText(this.options.copy.wrongZone);
    this.scene.tweens.add({
      targets: card.root,
      x: card.homeX,
      y: card.homeY,
      duration: 260,
      ease: 'Cubic.easeOut',
    });
  }

  private updateProgress(): void {
    const complete = this.placedCount === this.cards.length;
    this.progressText
      .setColor(complete ? '#91e6a7' : '#f0c95a')
      .setText(complete
        ? `✓ ${this.options.copy.complete}`
        : `${this.options.copy.progress} ${this.placedCount}/${this.cards.length}`);
    if (complete) {
      this.feedbackText.setColor('#91e6a7').setText(this.options.copy.complete);
      if (!this.completeNotified) {
        this.completeNotified = true;
        this.options.onComplete?.();
      }
    }
  }
}
