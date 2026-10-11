import Phaser from 'phaser';
import type { InputState } from '../input/InputAdapter';
import { CHAPTER1_DIVER_FRAME_KEYS } from '../graphics/assetManifest';

/** Diver visual radius in pixels. */
const RADIUS = 50;
/** Maximum swim speed in pixels per second. */
const MAX_SPEED = 390;
const ASSET_DISPLAY_SIZE = 176;
const VISUAL_SCALE = 1.5;
const ASSET_IDLE_FRAME = 0;
const SWIM_FRAME_DURATION = 75;
const IDLE_BOB_HEIGHT = 3;
const IDLE_BOB_DURATION = 2400;

/**
 * The player-controlled diver.
 *
 * A thin entity that owns its visual (a runtime-drawn placeholder, no external
 * art) and updates its position from a device-agnostic {@link InputState}. It
 * holds no gameplay rules beyond movement + bounds clamping.
 */
export class Diver {
  private readonly root: Phaser.GameObjects.Container;
  private readonly visual: Phaser.GameObjects.Container;
  private readonly velocity = new Phaser.Math.Vector2(0, 0);
  private readonly assetFrameKeys: readonly string[];
  private assetSprite: Phaser.GameObjects.Image | null = null;
  private assetFrame = 0;
  private assetAnimationElapsed = 0;
  private moving = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const availableFrameKeys = CHAPTER1_DIVER_FRAME_KEYS.filter((key) =>
      scene.textures.exists(key),
    );
    if (availableFrameKeys.length > 0) {
      this.assetFrameKeys = availableFrameKeys;
      const sprite = scene.add
        .image(0, 0, availableFrameKeys[ASSET_IDLE_FRAME] ?? availableFrameKeys[0]!)
        .setOrigin(0.5)
        .setDisplaySize(ASSET_DISPLAY_SIZE, ASSET_DISPLAY_SIZE);
      this.assetSprite = sprite;
      this.visual = scene.add.container(0, 0, [sprite]).setScale(VISUAL_SCALE);
      this.root = scene.add.container(x, y, [this.visual]).setDepth(10);
      this.addIdleMotion(scene);
      return;
    }

    this.assetFrameKeys = [];

    // Parts drawn facing +x (to the right); origin at the diver centre.
    const fin = scene.add.triangle(-33, 0, 0, -18, 0, 18, -21, 0, 0x14504c);
    const tank = scene.add.ellipse(-15, -3, 21, 36, 0x2b3a44).setStrokeStyle(3, 0x1b2830);
    const body = scene.add.ellipse(0, 0, 69, 45, 0x1c7a74).setStrokeStyle(4, 0x0a2a43);
    const belly = scene.add.ellipse(5, 8, 45, 21, 0x3fd0c9, 0.5);
    const mask = scene.add.circle(24, -4, 15, 0xbfe9ff).setStrokeStyle(3, 0x0a2a43);
    const lens = scene.add.circle(28, -4, 8, 0x04121f);

    this.visual = scene.add
      .container(0, 0, [fin, tank, body, belly, mask, lens])
      .setScale(VISUAL_SCALE);
    this.root = scene.add.container(x, y, [this.visual]).setDepth(10);

    // Gentle idle bob so the diver feels alive even when stationary.
    this.addIdleMotion(scene);
  }

  /** Whether the diver moved this frame (used by the oxygen system). */
  get isMoving(): boolean {
    return this.moving;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.root.x, y: this.root.y };
  }

  /** Developer-preview helper used only by explicit `?debug=1` routes. */
  setPosition(x: number, y: number): void {
    this.root.setPosition(x, y);
    this.stopMovement();
  }

  /** Advance the diver by one frame. */
  update(deltaMs: number, input: InputState, bounds: Phaser.Geom.Rectangle): void {
    const dt = deltaMs / 1000;

    const targetVelocity = new Phaser.Math.Vector2(input.x, input.y);
    if (targetVelocity.lengthSq() > 0.0001) {
      // Normalise so diagonal movement is not faster than axis movement.
      targetVelocity.normalize().scale(MAX_SPEED);
    }
    const response = targetVelocity.lengthSq() > 0.0001 ? 12 : 16;
    this.velocity.lerp(targetVelocity, Math.min(1, dt * response));
    this.moving = this.velocity.lengthSq() > 0.0001;

    this.updateAssetAnimation(deltaMs);

    if (this.moving) {
      // Face the travel direction; flip so the diver never appears upside-down.
      const angle = Math.atan2(this.velocity.y, this.velocity.x);
      this.visual.rotation = angle;
      this.visual.scaleY = (Math.abs(angle) > Math.PI / 2 ? -1 : 1) * VISUAL_SCALE;
    }

    const nextX = this.root.x + this.velocity.x * dt;
    const nextY = this.root.y + this.velocity.y * dt;
    this.root.x = Phaser.Math.Clamp(nextX, bounds.left, bounds.right);
    this.root.y = Phaser.Math.Clamp(nextY, bounds.top, bounds.bottom);
  }

  /** Freeze movement when another interaction mode owns the controls. */
  stopMovement(): void {
    this.velocity.set(0, 0);
    this.moving = false;
    this.updateAssetAnimation(0);
  }

  private updateAssetAnimation(deltaMs: number): void {
    if (this.assetSprite === null) return;

    this.assetAnimationElapsed += deltaMs;
    // Hold a stable neutral frame while idle. The container's slow bob and
    // tiny rotation communicate a diver hovering in the water without making
    // the full swim loop play when there is no movement input.
    if (!this.moving) {
      this.assetAnimationElapsed = 0;
      this.assetFrame = ASSET_IDLE_FRAME;
      this.assetSprite.setTexture(this.assetFrameKeys[ASSET_IDLE_FRAME] ?? this.assetFrameKeys[0]!);
      return;
    }

    if (this.assetAnimationElapsed < SWIM_FRAME_DURATION) return;

    const steps = Math.floor(this.assetAnimationElapsed / SWIM_FRAME_DURATION);
    this.assetAnimationElapsed -= steps * SWIM_FRAME_DURATION;
    this.assetFrame = (this.assetFrame + steps) % this.assetFrameKeys.length;
    this.assetSprite.setTexture(this.assetFrameKeys[this.assetFrame]!);
  }

  private addIdleMotion(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.visual,
      y: { from: -IDLE_BOB_HEIGHT, to: IDLE_BOB_HEIGHT },
      duration: IDLE_BOB_DURATION,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** Exposed so callers can reason about diver size if needed. */
export const DIVER_RADIUS = RADIUS;
