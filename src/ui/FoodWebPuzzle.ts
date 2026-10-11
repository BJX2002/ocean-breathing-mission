import Phaser from 'phaser';
import { Palette } from '../config/constants';
import { createResearchSurface } from './ResearchUi';

export type FoodWebZoneId = 'small-fish' | 'predator' | 'seabed';

export interface FoodWebCardSpec {
  readonly speciesId: string;
  readonly label: string;
  readonly textureKey: string | null;
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
  readonly nameBubble: Phaser.GameObjects.Graphics;
  homeX: number;
  homeY: number;
  placed: boolean;
}

interface FoodWebRoleStyle {
  readonly cardFill: number;
  readonly zoneFill: number;
  readonly border: number;
  readonly bubbleFill: number;
  readonly titleColor: string;
}

/**
 * Stable role colours help younger players match a draggable chip with its
 * destination before they have finished reading every label. Each colour is
 * paired with a dark surface so meaning never depends on colour alone.
 */
const FOOD_WEB_ROLE_STYLES: Readonly<Record<FoodWebZoneId, FoodWebRoleStyle>> = {
  'small-fish': {
    cardFill: 0x102f45,
    zoneFill: 0x102f45,
    border: 0x62cdf5,
    bubbleFill: 0x1d6686,
    titleColor: '#dff7ff',
  },
  predator: {
    cardFill: 0x3a2b19,
    zoneFill: 0x332719,
    border: 0xf3bd4e,
    bubbleFill: 0x755018,
    titleColor: '#fff4d6',
  },
  seabed: {
    cardFill: 0x173c32,
    zoneFill: 0x173c32,
    border: 0x71d7a5,
    bubbleFill: 0x28684f,
    titleColor: '#e6fff1',
  },
};

const FOOD_WEB_CARD_WIDTH = 252;
const FOOD_WEB_CARD_HEIGHT = 82;
const FOOD_WEB_CARD_GAP = 8;

/**
 * A large, tactile food-web builder used in the Chapter 1 evidence room.
 * Players arrange their photographed organisms by ecological role.
 */
export class FoodWebPuzzle {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly cards: DraggableCard[] = [];
  private readonly trayObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly occupiedSlots = new Map<FoodWebZoneId, number>();
  private readonly progressText: Phaser.GameObjects.Text;
  private readonly feedbackText: Phaser.GameObjects.Text;
  private readonly trayY: number;
  private readonly cardDepth: number;
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
      scene.add
        .text(left + 34, top + 24, copy.title, {
          fontFamily: 'sans-serif',
          fontSize: '40px',
          color: '#9cf7ef',
          fontStyle: 'bold',
        })
        .setDepth(depth + 2),
      scene.add
        .text(left + 34, top + 70, copy.hint, {
          fontFamily: 'sans-serif',
          fontSize: '27px',
          color: '#9bb9c9',
          wordWrap: { width: width - 410, useAdvancedWrap: true },
        })
        .setDepth(depth + 2),
    );

    this.progressText = scene.add
      .text(left + width - 34, top + 28, '', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#f0c95a',
        fontStyle: 'bold',
        align: 'right',
      })
      .setOrigin(1, 0)
      .setDepth(depth + 2);
    this.objects.push(this.progressText);

    const zoneTop = top + 126;
    const zoneHeight = 350;
    const producerX = left + width * 0.14;
    const hasSeabedCards = options.cards.some((card) => card.zone === 'seabed');
    const chainZones: readonly ZoneLayout[] = [
      {
        id: 'small-fish',
        x: left + width * 0.48,
        y: zoneTop + zoneHeight / 2,
        width: width * 0.34,
        height: zoneHeight,
        slots: [
          { x: left + width * 0.48, y: zoneTop + 80 },
          { x: left + width * 0.48, y: zoneTop + 175 },
          { x: left + width * 0.48, y: zoneTop + 270 },
        ],
      },
      {
        id: 'predator',
        x: left + width * 0.82,
        y: zoneTop + zoneHeight / 2,
        width: width * 0.28,
        height: zoneHeight,
        slots: [{ x: left + width * 0.82, y: zoneTop + 175 }],
      },
    ];
    const seabedZone: ZoneLayout = {
      id: 'seabed',
      x: left + width * 0.86,
      y: zoneTop + zoneHeight / 2,
      width: width * 0.18,
      height: zoneHeight,
      slots: [
        { x: left + width * 0.86, y: zoneTop + 118 },
        { x: left + width * 0.86, y: zoneTop + 242 },
      ],
    };
    const zones: readonly ZoneLayout[] = hasSeabedCards
      ? [
          {
            ...chainZones[0]!,
            x: left + width * 0.385,
            width: width * 0.2,
            slots: [
              { x: left + width * 0.385, y: zoneTop + 80 },
              { x: left + width * 0.385, y: zoneTop + 175 },
              { x: left + width * 0.385, y: zoneTop + 270 },
            ],
          },
          {
            ...chainZones[1]!,
            x: left + width * 0.635,
            width: width * 0.17,
            slots: [{ x: left + width * 0.635, y: zoneTop + 175 }],
          },
          seabedZone,
        ]
      : chainZones;

    // One continuous habitat illustration makes the task read as a single
    // ocean investigation board instead of four unrelated debug panels.
    const habitat = scene.add.graphics().setDepth(depth + 1);
    habitat.fillGradientStyle(0x0d5268, 0x0d5268, 0x082b3c, 0x082b3c, 0.92);
    habitat.fillRoundedRect(left + 24, zoneTop - 12, width - 48, zoneHeight + 72, 20);
    habitat.fillStyle(0x7f8564, 0.34);
    habitat.beginPath();
    habitat.moveTo(left + 24, zoneTop + zoneHeight - 24);
    for (let pointX = left + 24; pointX <= left + width - 24; pointX += 96) {
      habitat.lineTo(pointX, zoneTop + zoneHeight - 24 + Math.sin(pointX * 0.021) * 8);
    }
    habitat.lineTo(left + width - 24, zoneTop + zoneHeight + 60);
    habitat.lineTo(left + 24, zoneTop + zoneHeight + 60);
    habitat.closePath();
    habitat.fillPath();
    habitat.lineStyle(2, 0xb4d8c1, 0.22);
    for (let rippleX = left + 74; rippleX < left + width - 40; rippleX += 170) {
      habitat.strokeEllipse(rippleX, zoneTop + zoneHeight + 8, 76, 12);
    }
    habitat.fillStyle(0xb7f4ed, 0.2);
    for (let bubbleIndex = 0; bubbleIndex < 18; bubbleIndex += 1) {
      habitat.fillCircle(
        left + 56 + ((bubbleIndex * 181) % Math.floor(width - 112)),
        zoneTop + 18 + ((bubbleIndex * 53) % Math.floor(zoneHeight - 54)),
        2 + (bubbleIndex % 3),
      );
    }
    this.objects.push(habitat);

    this.createConnections(producerX, zoneTop, zoneHeight, zones, depth + 1);
    this.createProducerNode(producerX, zoneTop + zoneHeight / 2, copy.producer, depth + 3);

    for (const zone of zones) {
      this.occupiedSlots.set(zone.id, 0);
      this.createZone(zone, this.getZoneTitle(zone.id), depth + 2);
    }

    const trayY = zoneTop + zoneHeight + 95;
    this.trayY = trayY;
    this.cardDepth = depth + 5;
    const tray = scene.add.graphics().setDepth(depth + 1);
    tray.fillStyle(0x0a2634, 0.9);
    tray.fillRoundedRect(left + 20, trayY - 61, width - 40, 122, 14);
    tray.lineStyle(1, 0x3fd0c9, 0.2);
    tray.strokeRoundedRect(left + 20, trayY - 61, width - 40, 122, 14);
    const trayLabel = scene.add
        .text(left + 40, trayY - 51, copy.tray, {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#a8cad6',
          fontStyle: 'bold',
        })
        .setDepth(depth + 3);
    this.trayObjects.push(tray, trayLabel);
    this.objects.push(tray, trayLabel);

    const rowWidth =
      options.cards.length * FOOD_WEB_CARD_WIDTH + (options.cards.length - 1) * FOOD_WEB_CARD_GAP;
    const firstCardX = x - rowWidth / 2 + FOOD_WEB_CARD_WIDTH / 2;
    options.cards.forEach((spec, index) => {
      this.createCard(
        spec,
        firstCardX + index * (FOOD_WEB_CARD_WIDTH + FOOD_WEB_CARD_GAP),
        trayY + 13,
        depth + 5,
        zones,
      );
    });

    this.feedbackText = scene.add
      .text(x, trayY + 70, '', {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#f2a679',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(depth + 4);
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

  private createConnections(
    producerX: number,
    zoneTop: number,
    zoneHeight: number,
    zones: readonly ZoneLayout[],
    depth: number,
  ): void {
    const g = this.scene.add.graphics().setDepth(depth);
    const y = zoneTop + zoneHeight / 2;
    const smallFish = zones.find((zone) => zone.id === 'small-fish');
    const predator = zones.find((zone) => zone.id === 'predator');
    const seabed = zones.find((zone) => zone.id === 'seabed');
    if (smallFish === undefined || predator === undefined) return;
    this.drawArrow(g, producerX + 102, y, smallFish.x - smallFish.width / 2 - 16, y, 0x5ce4d9);
    this.drawArrow(
      g,
      smallFish.x + smallFish.width / 2 + 12,
      y,
      predator.x - predator.width / 2 - 16,
      y,
      0xf0c95a,
    );
    if (seabed !== undefined) {
      this.drawArrow(
        g,
        predator.x + predator.width / 2 + 12,
        y + 18,
        seabed.x - seabed.width / 2 - 16,
        y + 18,
        0x82d9b0,
      );

      g.lineStyle(3, 0x82d9b0, 0.56);
      g.beginPath();
      g.moveTo(seabed.x, zoneTop + zoneHeight - 20);
      g.lineTo(seabed.x, zoneTop + zoneHeight + 32);
      g.lineTo(producerX, zoneTop + zoneHeight + 32);
      g.lineTo(producerX, zoneTop + zoneHeight - 30);
      g.strokePath();
      g.fillStyle(0x82d9b0, 0.82);
      g.fillTriangle(
        producerX,
        zoneTop + zoneHeight - 38,
        producerX - 9,
        zoneTop + zoneHeight - 23,
        producerX + 9,
        zoneTop + zoneHeight - 23,
      );
    }
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
    graphics.lineStyle(3, color, 0.6);
    graphics.lineBetween(x1, y1, x2 - 12, y2);
    graphics.fillStyle(color, 0.78);
    graphics.fillTriangle(x2, y2, x2 - 15, y2 - 9, x2 - 15, y2 + 9);
  }

  private createProducerNode(x: number, y: number, title: string, depth: number): void {
    const root = this.scene.add.container(x, y).setDepth(depth);
    const glow = this.scene.add.circle(0, 0, 112, 0x3fd0c9, 0.07);
    const art = this.scene.add.graphics();
    art.fillStyle(0x164d4d, 1);
    art.fillRoundedRect(-92, -112, 184, 224, 24);
    art.lineStyle(1, 0x9cf7ef, 0.38);
    art.strokeRoundedRect(-92, -112, 184, 224, 24);
    art.lineStyle(10, 0x2fb985, 0.92);
    for (const offset of [-54, -22, 12, 46]) {
      art.beginPath();
      art.moveTo(offset, 58);
      art.lineTo(offset - 10, 3);
      art.lineTo(offset + 9, -59 - Math.abs(offset % 19));
      art.strokePath();
    }
    const label = this.scene.add
      .text(0, 85, title, {
        fontFamily: 'sans-serif',
        fontSize: '27px',
        color: '#d8fffb',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 172, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
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
    const style = FOOD_WEB_ROLE_STYLES[zone.id];
    const g = this.scene.add.graphics().setDepth(depth);
    g.fillStyle(style.zoneFill, 0.42);
    g.fillRoundedRect(
      zone.x - zone.width / 2,
      zone.y - zone.height / 2,
      zone.width,
      zone.height,
      16,
    );
    g.lineStyle(1, style.border, 0.34);
    g.strokeRoundedRect(
      zone.x - zone.width / 2,
      zone.y - zone.height / 2,
      zone.width,
      zone.height,
      16,
    );
    for (const slot of zone.slots) {
      const slotWidth = zone.width - 34;
      g.fillStyle(0x041923, 0.48);
      g.fillRoundedRect(slot.x - slotWidth / 2, slot.y - 34, slotWidth, 68, 15);
      g.lineStyle(1, style.border, 0.24);
      g.strokeRoundedRect(slot.x - slotWidth / 2, slot.y - 34, slotWidth, 68, 15);
    }
    const label = this.scene.add
      .text(zone.x, zone.y - zone.height / 2 - 4, title, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: style.titleColor,
        backgroundColor:
          zone.id === 'small-fish'
            ? '#1d6686dd'
            : zone.id === 'predator'
              ? '#755018dd'
              : '#28684fdd',
        padding: { x: 22, y: 10 },
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 1);
    this.objects.push(g, label);
  }

  private createCard(
    spec: FoodWebCardSpec,
    homeX: number,
    homeY: number,
    depth: number,
    zones: readonly ZoneLayout[],
  ): void {
    const root = this.scene.add
      .container(homeX, homeY)
      .setDepth(depth)
      .setSize(FOOD_WEB_CARD_WIDTH, FOOD_WEB_CARD_HEIGHT);
    const background = this.scene.add.graphics();
    const nameBubble = this.scene.add.graphics();
    this.paintCard(background, nameBubble, spec.zone, false, false);
    const icon = this.createCardIcon(spec.textureKey, spec.zone);
    const label = this.scene.add
      .text(50, 0, spec.label, {
        fontFamily: 'sans-serif',
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        wordWrap: { width: 142, useAdvancedWrap: true },
      })
      .setOrigin(0.5);
    root.add([background, nameBubble, icon, label]);
    root.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(root);

    const card: DraggableCard = { spec, root, background, nameBubble, homeX, homeY, placed: false };
    this.cards.push(card);
    this.objects.push(root);

    root.on(Phaser.Input.Events.GAMEOBJECT_DRAG_START, () => {
      if (card.placed) return;
      root.setDepth(depth + 20).setScale(1.04);
      this.paintCard(background, nameBubble, spec.zone, true, false);
      this.feedbackText.setText('');
    });
    root.on(
      Phaser.Input.Events.GAMEOBJECT_DRAG,
      (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        if (card.placed) return;
        root.setPosition(dragX, dragY);
      },
    );
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

  private createCardIcon(
    textureKey: string | null,
    role: FoodWebZoneId,
  ): Phaser.GameObjects.GameObject {
    if (textureKey !== null && this.scene.textures.exists(textureKey)) {
      const source = this.scene.textures.get(textureKey).getSourceImage();
      const scale = Math.min(92 / source.width, 60 / source.height);
      return this.scene.add
        .image(-83, 0, textureKey)
        .setDisplaySize(source.width * scale, source.height * scale);
    }
    const fallback = this.scene.add.graphics();
    fallback.fillStyle(FOOD_WEB_ROLE_STYLES[role].border, 0.9);
    fallback.fillEllipse(-83, 0, 56, 28);
    fallback.fillTriangle(-110, 0, -125, -13, -125, 13);
    return fallback;
  }

  private paintCard(
    background: Phaser.GameObjects.Graphics,
    nameBubble: Phaser.GameObjects.Graphics,
    role: FoodWebZoneId,
    active: boolean,
    placed: boolean,
  ): void {
    const style = FOOD_WEB_ROLE_STYLES[role];
    background.clear();
    if (!placed) {
      background.fillStyle(style.cardFill, 0.96);
      background.fillRoundedRect(
        -FOOD_WEB_CARD_WIDTH / 2,
        -FOOD_WEB_CARD_HEIGHT / 2,
        FOOD_WEB_CARD_WIDTH,
        FOOD_WEB_CARD_HEIGHT,
        20,
      );
      background.lineStyle(active ? 4 : 1, style.border, active ? 1 : 0.7);
      background.strokeRoundedRect(
        -FOOD_WEB_CARD_WIDTH / 2,
        -FOOD_WEB_CARD_HEIGHT / 2,
        FOOD_WEB_CARD_WIDTH,
        FOOD_WEB_CARD_HEIGHT,
        20,
      );
    }

    nameBubble.clear();
    nameBubble.fillStyle(style.bubbleFill, placed ? 0.94 : 1);
    nameBubble.fillRoundedRect(-20, -31, 142, 62, 20);
    if (active) {
      nameBubble.lineStyle(2, 0xffffff, 0.72);
      nameBubble.strokeRoundedRect(-20, -31, 142, 62, 20);
    }
  }

  private contains(zone: ZoneLayout, x: number, y: number): boolean {
    return (
      x >= zone.x - zone.width / 2 &&
      x <= zone.x + zone.width / 2 &&
      y >= zone.y - zone.height / 2 &&
      y <= zone.y + zone.height / 2
    );
  }

  private placeCard(card: DraggableCard, zone: ZoneLayout, depth: number): void {
    const occupied = this.occupiedSlots.get(zone.id) ?? 0;
    const slot = zone.slots[Math.min(occupied, zone.slots.length - 1)]!;
    this.occupiedSlots.set(zone.id, occupied + 1);
    card.placed = true;
    this.scene.input.setDraggable(card.root, false);
    card.root
      .disableInteractive()
      .setDepth(depth + 6)
      .setScale(1);
    this.paintCard(card.background, card.nameBubble, card.spec.zone, false, true);
    this.scene.tweens.add({
      targets: card.root,
      x: slot.x,
      y: slot.y,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.placedCount += 1;
    this.feedbackText.setColor('#91e6a7').setText(`✓ ${this.getZoneTitle(zone.id)}`);
    this.reflowRemainingCards();
    this.updateProgress();
  }

  private rejectCard(card: DraggableCard, depth: number): void {
    card.root.setDepth(depth + 5).setScale(1);
    this.paintCard(card.background, card.nameBubble, card.spec.zone, false, false);
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
      .setText(
        complete
          ? `✓ ${this.options.copy.complete}`
          : `${this.options.copy.progress} ${this.placedCount}/${this.cards.length}`,
      );
    if (complete) {
      for (const object of this.trayObjects) {
        const visibleObject = object as Phaser.GameObjects.GameObject & {
          setVisible(value: boolean): Phaser.GameObjects.GameObject;
        };
        visibleObject.setVisible(false).setActive(false);
      }
      // The heading already changes to the complete state. A second identical
      // line below the habitat looked doubled and collided with the next action.
      this.feedbackText.setText('').setVisible(false);
      if (!this.completeNotified) {
        this.completeNotified = true;
        this.options.onComplete?.();
      }
    }
  }

  /** Keep the still-draggable cards centred as the tray empties. */
  private reflowRemainingCards(): void {
    const remaining = this.cards.filter((card) => !card.placed);
    if (remaining.length === 0) return;
    const rowWidth =
      remaining.length * FOOD_WEB_CARD_WIDTH + (remaining.length - 1) * FOOD_WEB_CARD_GAP;
    const firstX = this.options.x - rowWidth / 2 + FOOD_WEB_CARD_WIDTH / 2;
    remaining.forEach((card, index) => {
      card.homeX = firstX + index * (FOOD_WEB_CARD_WIDTH + FOOD_WEB_CARD_GAP);
      card.homeY = this.trayY + 13;
      card.root.setDepth(this.cardDepth);
      this.scene.tweens.add({
        targets: card.root,
        x: card.homeX,
        y: card.homeY,
        duration: 220,
        ease: 'Cubic.easeOut',
      });
    });
  }
}
