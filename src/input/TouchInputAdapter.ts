import Phaser from 'phaser';
import type { InputAdapter, InputState } from './InputAdapter';
import { emptyInputState } from './InputAdapter';
import { i18n } from '../i18n/LocaleService';

const MAX_DRAG_RADIUS = 92;
const JOYSTICK_X = 190;
const JOYSTICK_Y = 860;
const ACTION_X = 1710;
const ACTION_Y = 860;
const CANCEL_X = 1740;
const CANCEL_Y = 650;
const UI_DEPTH = 5200;

/**
 * Two-thumb tablet controls. Movement and action use separate pointer IDs so
 * aiming with the joystick can never fire the camera shutter accidentally.
 */
export class TouchInputAdapter implements InputAdapter {
  private readonly elements: Array<Phaser.GameObjects.Arc | Phaser.GameObjects.Text> = [];
  private readonly joystickBase: Phaser.GameObjects.Arc;
  private readonly joystickThumb: Phaser.GameObjects.Arc;
  private readonly actionButton: Phaser.GameObjects.Arc;
  private readonly actionLabel: Phaser.GameObjects.Text;
  private readonly cancelButton: Phaser.GameObjects.Arc;
  private readonly cancelLabel: Phaser.GameObjects.Text;

  private joystickPointerId: number | null = null;
  private actionPointerId: number | null = null;
  private cancelPointerId: number | null = null;
  private actionPressed = false;
  private cancelPressed = false;
  private movement = new Phaser.Math.Vector2();
  private controlsVisible = true;
  private cancelVisible = false;

  private readonly onMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.joystickPointerId) return;

    const dx = pointer.x - JOYSTICK_X;
    const dy = pointer.y - JOYSTICK_Y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > MAX_DRAG_RADIUS ? MAX_DRAG_RADIUS / distance : 1;
    const thumbX = dx * scale;
    const thumbY = dy * scale;

    this.joystickThumb.setPosition(JOYSTICK_X + thumbX, JOYSTICK_Y + thumbY);
    this.movement.set(thumbX / MAX_DRAG_RADIUS, thumbY / MAX_DRAG_RADIUS);
  };

  private readonly onUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.joystickPointerId) {
      this.joystickPointerId = null;
      this.movement.set(0, 0);
      this.joystickThumb.setPosition(JOYSTICK_X, JOYSTICK_Y);
    }
    if (pointer.id === this.actionPointerId) this.actionPointerId = null;
    if (pointer.id === this.cancelPointerId) this.cancelPointerId = null;
  };

  constructor(private readonly scene: Phaser.Scene) {
    this.joystickBase = scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, 116, 0x041a2a, 0.7)
      .setStrokeStyle(5, 0x7ce7ff, 0.86)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setInteractive(new Phaser.Geom.Circle(116, 116, 116), Phaser.Geom.Circle.Contains);
    this.joystickThumb = scene.add
      .circle(JOYSTICK_X, JOYSTICK_Y, 53, 0x7ce7ff, 0.86)
      .setStrokeStyle(4, 0xffffff, 0.92)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);
    const joystickLabel = scene.add
      .text(JOYSTICK_X, JOYSTICK_Y + 142, i18n.t('touch.joystick'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '28px',
        color: '#d7f7ff',
        stroke: '#02121e',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);

    this.actionButton = scene.add
      .circle(ACTION_X, ACTION_Y, 102, 0x0b607a, 0.82)
      .setStrokeStyle(6, 0xffffff, 0.92)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setInteractive(new Phaser.Geom.Circle(102, 102, 102), Phaser.Geom.Circle.Contains);
    this.actionLabel = scene.add
      .text(ACTION_X, ACTION_Y, i18n.t('touch.action'), {
        fontFamily: 'Arial, sans-serif',
        fontSize: '31px',
        fontStyle: 'bold',
        color: '#ffffff',
        align: 'center',
        stroke: '#02121e',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);

    this.cancelButton = scene.add
      .circle(CANCEL_X, CANCEL_Y, 48, 0x071823, 0.82)
      .setStrokeStyle(4, 0xffffff, 0.9)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH)
      .setInteractive(new Phaser.Geom.Circle(48, 48, 48), Phaser.Geom.Circle.Contains);
    this.cancelLabel = scene.add
      .text(CANCEL_X, CANCEL_Y - 2, '×', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '60px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(UI_DEPTH + 1);

    this.elements.push(
      this.joystickBase,
      this.joystickThumb,
      joystickLabel,
      this.actionButton,
      this.actionLabel,
      this.cancelButton,
      this.cancelLabel,
    );

    this.joystickBase.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.joystickPointerId !== null) return;
        this.joystickPointerId = pointer.id;
        this.onMove(pointer);
        event.stopPropagation();
      },
    );
    this.actionButton.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.actionPointerId === null) {
          this.actionPointerId = pointer.id;
          this.actionPressed = true;
        }
        event.stopPropagation();
      },
    );
    this.cancelButton.on(
      Phaser.Input.Events.POINTER_DOWN,
      (
        pointer: Phaser.Input.Pointer,
        _x: number,
        _y: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        if (this.cancelPointerId === null) {
          this.cancelPointerId = pointer.id;
          this.cancelPressed = true;
        }
        event.stopPropagation();
      },
    );

    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
    this.syncVisibility();
  }

  getState(): InputState {
    const state = emptyInputState();
    state.x = this.movement.x;
    state.y = this.movement.y;
    state.action = this.actionPressed || this.actionPointerId !== null;
    state.cancel = this.cancelPressed || this.cancelPointerId !== null;
    this.actionPressed = false;
    this.cancelPressed = false;
    return state;
  }

  setVisible(visible: boolean): void {
    this.controlsVisible = visible;
    if (!visible) this.resetPointers();
    this.syncVisibility();
  }

  setActionLabel(label: string): void {
    this.actionLabel.setText(label);
  }

  setCancelVisible(visible: boolean): void {
    this.cancelVisible = visible;
    if (!visible) {
      this.cancelPointerId = null;
      this.cancelPressed = false;
    }
    this.syncVisibility();
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp);
    for (const element of this.elements) element.destroy();
    this.elements.length = 0;
  }

  private resetPointers(): void {
    this.joystickPointerId = null;
    this.actionPointerId = null;
    this.cancelPointerId = null;
    this.actionPressed = false;
    this.cancelPressed = false;
    this.movement.set(0, 0);
    this.joystickThumb.setPosition(JOYSTICK_X, JOYSTICK_Y);
  }

  private syncVisibility(): void {
    for (const element of this.elements) {
      const isCancelElement = element === this.cancelButton || element === this.cancelLabel;
      const visible = this.controlsVisible && (!isCancelElement || this.cancelVisible);
      element.setVisible(visible);
    }

    if (this.joystickBase.input !== null) this.joystickBase.input.enabled = this.controlsVisible;
    if (this.actionButton.input !== null) this.actionButton.input.enabled = this.controlsVisible;
    if (this.cancelButton.input !== null) {
      this.cancelButton.input.enabled = this.controlsVisible && this.cancelVisible;
    }
  }
}
