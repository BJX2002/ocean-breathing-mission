import Phaser from 'phaser';
import { getHabitatFloorY } from '../config/constants';
import { eventBus } from '../events/EventBus';
import {
  ensureEdgeTransparentTexture,
  ensureNormalizedTextureSequence,
} from '../graphics/TextureFactory';
import { getCreatureFramePlan } from '../scenes/OpeningModel';
import type { SurveySubjectPlacement, SurveySubjectVisual } from '../types';

/** Interaction range for a field observation. */
const OBSERVATION_RADIUS = 128;

interface FishStatusLayout {
  readonly headDirection: -1 | 1;
  /** Approximate outer edge of the fish head in the selected display frame. */
  readonly headEdgeX: number;
  readonly restingY: number;
}

const FISH_STATUS_LAYOUTS: Readonly<Record<string, FishStatusLayout>> = {
  // The replacement blue-fish frames face left.
  'blue-damselfish': { headDirection: -1, headEdgeX: 46, restingY: -50 },
  // The grouper and goby frames also face left.
  'reef-grouper': { headDirection: -1, headEdgeX: 69, restingY: -48 },
  'hardy-goby': { headDirection: -1, headEdgeX: 60, restingY: -49 },
  // The replacement silver-fish frames face right.
  'silver-reef-fish': { headDirection: 1, headEdgeX: 66, restingY: -55 },
};

export interface SurveyInteraction {
  readonly subjectId: string;
  readonly tool: 'camera';
}

type SubjectVisualObject =
  Phaser.GameObjects.Graphics | Phaser.GameObjects.Image | Phaser.GameObjects.Container;

interface AnimatedFrameSprite {
  readonly sprite: Phaser.GameObjects.Image;
  readonly phaseMs: number;
  frameIndex: number;
}

/**
 * The supplied animation frames use square canvases. One target size per
 * species preserves each silhouette's native ratio while keeping clear
 * size differences between the organisms.
 */
const CREATURE_DISPLAY_SIZES: Readonly<Record<string, number>> = {
  // Keep swimming fish at 80% of the previous presentation size so the
  // enlarged diver remains the clearest player-controlled subject.
  'blue-damselfish': 77,
  'hardy-goby': 90,
  'reef-grouper': 118,
  'silver-reef-fish': 82,
  'sea-cucumber': 112,
  'tube-sponge': 110,
};

/** Approximate visible half-heights used to sit non-swimming subjects on sand. */
const GROUNDED_VISIBLE_HALF_HEIGHTS: Readonly<Record<string, number>> = {
  'sea-cucumber': 18,
  'tube-sponge': 48,
};

/**
 * An original, abstract field-survey subject. The visuals are intentionally
 * diagrammatic rather than character-like: this is a scientific observation
 * layer, not a fishing or collection system.
 */
export class SurveySubject {
  private readonly root: Phaser.GameObjects.Container;
  private readonly aura: Phaser.GameObjects.Arc;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly status: Phaser.GameObjects.Text;
  private readonly visual: SubjectVisualObject;
  private readonly frameSprites: AnimatedFrameSprite[] = [];
  private frameKeys: readonly string[] = [];
  private frameDurationMs = 0;
  private readonly isFish: boolean;
  private readonly isGrounded: boolean;
  private readonly worldX: number;
  private readonly worldY: number;
  private readonly displayName: string;
  private focused = false;
  private guided = false;
  private alertUntil = 0;
  private photoRecorded = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly data: SurveySubjectPlacement,
    label: string,
  ) {
    this.displayName = label;
    this.isFish = data.visual === 'school' || data.visual === 'goby';
    this.isGrounded = data.depthZone === 'bottom' && !this.isFish;
    this.worldX = data.x;
    this.worldY = this.isGrounded
      ? getHabitatFloorY(data.x) - (GROUNDED_VISIBLE_HALF_HEIGHTS[data.speciesId] ?? 28)
      : data.y;
    this.root = scene.add.container(this.worldX, this.worldY).setDepth(8);
    const focusRadius = this.isFish ? 92 : 78;
    this.aura = scene.add.circle(0, 0, focusRadius + 18, 0x3fd0c9, 0.07).setVisible(false);
    this.ring = scene.add
      .circle(0, 0, focusRadius, 0x3fd0c9, 0)
      .setStrokeStyle(3, 0x9cf7ef, 0.85)
      .setVisible(false);
    this.visual = this.createVisual(data.visual);
    this.root.add([this.aura, this.ring, this.visual]);

    this.label = scene.add
      .text(0, -92, label, {
        fontFamily: 'sans-serif',
        fontSize: '21px',
        color: '#e6f7ff',
        backgroundColor: '#04121fcc',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5, 1)
      .setVisible(false)
      .setDepth(20);
    this.label.setInteractive({ useHandCursor: true });
    this.label.on(Phaser.Input.Events.POINTER_UP, () => {
      eventBus.emit('subject:infoRequested', {
        subjectId: this.id,
        speciesId: this.speciesId,
        label: this.labelText,
        depthZone: this.depthZone,
      });
    });
    this.root.add(this.label);

    // Swimming fish can hover in the water column. Sea cucumbers and tube
    // sponges are grounded organisms, so they must stay attached to the
    // seabed instead of sharing the fish bobbing animation.
    if (this.isFish) {
      scene.tweens.add({
        targets: this.visual,
        y: { from: -4, to: 4 },
        duration: 1800 + (data.x % 500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.status = scene.add
      .text(52, -42, '', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#f0c95a',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(22);
    this.root.add(this.status);
  }

  get id(): string {
    return this.data.id;
  }

  get speciesId(): string {
    return this.data.speciesId;
  }

  get depthZone(): string {
    return this.data.depthZone;
  }

  get labelText(): string {
    return this.displayName;
  }

  get position(): { x: number; y: number } {
    return { x: this.worldX, y: this.worldY };
  }

  get hasPhoto(): boolean {
    return this.photoRecorded;
  }

  get isFocused(): boolean {
    return this.focused;
  }

  setGuidedTarget(guided: boolean): void {
    this.guided = guided && !this.photoRecorded;
    if (this.guided) {
      // A newly activated organism may already be inside the diver's focus
      // radius when the station photo closes. Apply the mission-yellow style
      // immediately instead of waiting for the player to swim away and back.
      this.aura.setVisible(true).setFillStyle(0xf0c95a, 0.055);
      this.ring.setVisible(true).setStrokeStyle(4, 0xf0c95a, 0.9);
      this.label.setVisible(true).setColor('#fff3a8').setBackgroundColor('#4b3b13dd');
    } else if (!this.focused) {
      this.aura.setVisible(false);
      this.ring.setVisible(false);
      this.label.setVisible(false);
    }
  }

  updateFocus(diverX: number, diverY: number): boolean {
    const distance = Phaser.Math.Distance.Between(diverX, diverY, this.worldX, this.worldY);
    const focused = distance <= OBSERVATION_RADIUS;
    const discoveredNow = focused && !this.focused;
    const now = this.scene.time.now;
    this.updateFrameAnimation(now);

    if (this.isFish && focused && !this.focused) {
      // A short startled burst makes the encounter legible before the fish
      // settles into a slower, readable observation state.
      this.alertUntil = now + 1200;
    }
    this.focused = focused;

    this.aura
      .setVisible(focused || this.guided)
      .setFillStyle(
        this.guided ? 0xf0c95a : 0x3fd0c9,
        this.guided ? 0.055 : focused ? 0.07 : 0.035,
      );
    this.ring.setVisible(focused || this.guided);
    this.label.setVisible(focused || this.guided);
    if (this.guided) {
      this.label.setColor('#fff3a8').setBackgroundColor('#4b3b13dd');
      this.ring.setStrokeStyle(4, 0xf0c95a, 0.9);
    } else if (focused) {
      this.label.setColor('#e6f7ff').setBackgroundColor('#04121fcc');
      this.ring.setStrokeStyle(3, this.photoRecorded ? 0x9aa8b8 : 0x9cf7ef, 0.85);
    }

    if (this.isFish) {
      const alert = focused && now < this.alertUntil;
      const statusLayout = FISH_STATUS_LAYOUTS[this.speciesId] ?? {
        headDirection: 1,
        headEdgeX: 44,
        restingY: -50,
      };
      // Both states use the same enlarged, diagonal head position. They
      // follow the fish's facing direction and only reserve space outside the
      // fish silhouette; the observation circle is allowed to sit behind them.
      const statusGap = 5;
      const statusX = statusLayout.headDirection * (statusLayout.headEdgeX + statusGap);
      const statusY = statusLayout.restingY;
      this.status.setPosition(statusX, statusY).setOrigin(0.5);
      this.status.setFontSize(24);
      this.status.setVisible(focused).setText(alert ? '!' : 'Zzz');
      this.status.setColor(alert ? '#ffd45a' : '#f0c95a');

      // The position is kept close to the designed placement so interaction
      // remains dependable, while the change in frequency/amplitude visibly
      // communicates fast startled swimming versus slow resting movement.
      const speed = alert ? 0.0062 : focused ? 0.00125 : 0.0022;
      const amplitude = alert ? 20 : focused ? 4 : 10;
      this.root.x = this.worldX + Math.sin(now * speed + this.worldX) * amplitude;
      this.visual.setAngle(Math.sin(now * speed * 0.84 + this.worldX) * (alert ? 4.5 : 2.2));
    }

    return discoveredNow;
  }

  tryPhotograph(diverX: number, diverY: number): SurveyInteraction | null {
    const distance = Phaser.Math.Distance.Between(diverX, diverY, this.worldX, this.worldY);
    if (distance > OBSERVATION_RADIUS) return null;
    if (this.photoRecorded) return null;

    this.photoRecorded = true;
    this.guided = false;
    this.ring.setStrokeStyle(3, 0x91e6a7, 0.9);
    return { subjectId: this.data.id, tool: 'camera' };
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private createVisual(visual: SurveySubjectVisual): SubjectVisualObject {
    const assetVisual = this.createAssetVisual();
    if (assetVisual !== null) return assetVisual;

    const g = this.scene.add.graphics();
    if (visual === 'school') {
      g.fillStyle(0xf0c95a, 0.95);
      for (const [x, y, scale] of [
        [-34, -8, 1],
        [0, 8, 0.9],
        [33, -3, 0.78],
        [12, -31, 0.62],
      ] as const) {
        g.fillEllipse(x, y, 42 * scale, 22 * scale);
        g.fillTriangle(
          x - 22 * scale,
          y,
          x - 36 * scale,
          y - 12 * scale,
          x - 36 * scale,
          y + 12 * scale,
        );
        g.fillStyle(0x7be0dc, 0.75);
        g.fillCircle(x + 10 * scale, y - 3 * scale, 2.5 * scale);
        g.fillStyle(0xf0c95a, 0.95);
      }
      return g;
    }

    if (visual === 'goby') {
      g.fillStyle(0x85a4b8, 1);
      g.fillEllipse(0, 0, 76, 37);
      g.fillTriangle(-36, 0, -62, -22, -62, 22);
      g.fillStyle(0x203c50, 0.8);
      g.fillRect(-17, -17, 7, 34);
      g.fillRect(3, -16, 7, 32);
      g.fillStyle(0xe6f7ff, 1);
      g.fillCircle(25, -7, 5);
      g.fillStyle(0x04121f, 1);
      g.fillCircle(26, -7, 2);
      return g;
    }

    if (visual === 'cucumber') {
      g.fillStyle(0x956b59, 1);
      g.fillRoundedRect(-48, -15, 96, 30, 14);
      g.fillStyle(0xc49572, 0.95);
      for (let x = -32; x <= 32; x += 16) g.fillCircle(x, 0, 4);
      g.fillStyle(0xd7b18b, 0.7);
      g.fillCircle(-28, -7, 3);
      g.fillCircle(14, 7, 3);
      return g;
    }

    if (visual === 'sponge') {
      g.fillStyle(0xd58f66, 1);
      for (const x of [-24, 0, 24]) {
        g.fillRoundedRect(x - 9, -42, 18, 84, 8);
        g.fillStyle(0x8f5e58, 1);
        g.fillCircle(x, -31, 5);
        g.fillStyle(0xd58f66, 1);
      }
      g.fillStyle(0xf0c95a, 0.5);
      g.fillEllipse(0, 36, 76, 12);
      return g;
    }

    if (visual === 'anemone') {
      g.fillStyle(0xe379a6, 1);
      g.fillCircle(0, 6, 25);
      g.lineStyle(7, 0xf4a8cf, 0.9);
      for (const x of [-26, -13, 0, 13, 26]) {
        g.beginPath();
        g.moveTo(x, 12);
        g.lineTo(x + (x % 2 === 0 ? 8 : -8), -42);
        g.strokePath();
      }
      return g;
    }

    // Shrimp-like observation marker: a small, original silhouette.
    g.lineStyle(5, 0x9ce5d7, 0.95);
    g.strokeEllipse(0, 0, 70, 30);
    g.lineBetween(30, -5, 52, -25);
    g.lineBetween(30, 5, 52, 25);
    g.fillStyle(0xf0c95a, 1);
    g.fillCircle(-22, 0, 5);
    return g;
  }

  private createAssetVisual(): SubjectVisualObject | null {
    const plan = getCreatureFramePlan(this.data.speciesId);
    if (plan !== null) {
      const preparedFrameKeys = plan.indices.flatMap((index) => {
        const indexLabel = String(index).padStart(2, '0');
        const sourceKey = `chapter1-subject-${this.data.speciesId}-frame-${indexLabel}`;
        if (!this.scene.textures.exists(sourceKey)) return [];
        if (
          this.data.speciesId !== 'tube-sponge' &&
          this.data.speciesId !== 'blue-damselfish' &&
          this.data.speciesId !== 'silver-reef-fish'
        ) {
          return [sourceKey];
        }

        const transparentKey = `${sourceKey}-edge-transparent`;
        return ensureEdgeTransparentTexture(this.scene, sourceKey, transparentKey) &&
          this.scene.textures.exists(transparentKey)
          ? [transparentKey]
          : [];
      });
      const frameKeys = ensureNormalizedTextureSequence(
        this.scene,
        preparedFrameKeys,
        `${this.data.speciesId}-stable-body`,
      );
      if (frameKeys.length > 0) {
        const targetSize = CREATURE_DISPLAY_SIZES[this.data.speciesId] ?? 112;
        const source = this.scene.textures.get(frameKeys[0]!).getSourceImage();
        const scale = targetSize / Math.max(source.width, source.height);
        const sprite = this.scene.add.image(0, 0, frameKeys[0]!).setScale(scale);
        const container = this.scene.add.container(0, 0, [sprite]);
        this.frameSprites.push({ sprite, phaseMs: 0, frameIndex: -1 });
        if (this.data.visual === 'school') {
          for (const [x, y, relativeScale, phase] of [
            [-30, -8, 0.58, 0],
            [30, 12, 0.48, 500],
            [8, -26, 0.4, 900],
          ] as const) {
            const schoolmate = this.scene.add
              .image(x, y, frameKeys[0]!)
              .setScale(scale * relativeScale)
              .setAlpha(0.88);
            container.add(schoolmate);
            this.frameSprites.push({ sprite: schoolmate, phaseMs: phase, frameIndex: -1 });
            this.scene.tweens.add({
              targets: schoolmate,
              y: { from: y - 4, to: y + 4 },
              duration: 1800 + phase,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut',
            });
          }
        }
        this.frameKeys = frameKeys;
        this.frameDurationMs = plan.frameDurationMs;
        return container;
      }
    }

    const key = `chapter1-subject-${this.data.speciesId}`;
    if (!this.scene.textures.exists(key)) return null;

    const source = this.scene.textures.get(key).getSourceImage();
    const targetSize = CREATURE_DISPLAY_SIZES[this.data.speciesId] ?? 112;
    return this.scene.add
      .image(0, 0, key)
      .setScale(targetSize / Math.max(source.width, source.height));
  }

  private updateFrameAnimation(now: number): void {
    if (this.frameSprites.length === 0 || this.frameKeys.length < 2 || this.frameDurationMs <= 0) {
      return;
    }
    for (const animated of this.frameSprites) {
      const nextIndex =
        Math.floor((now + animated.phaseMs) / this.frameDurationMs) % this.frameKeys.length;
      if (nextIndex === animated.frameIndex) continue;
      animated.frameIndex = nextIndex;
      animated.sprite.setTexture(this.frameKeys[nextIndex]!);
    }
  }
}
