import { eventBus } from '../events/EventBus';

export interface OxygenSystemOptions {
  /** Oxygen drained per second while idle. */
  readonly baseDrainPerSecond: number;
  /** Additional oxygen drained per second while the diver is moving. */
  readonly moveDrainPerSecond: number;
}

const DEFAULT_OPTIONS: OxygenSystemOptions = {
  // A full 100-point tank now lasts about 167 seconds of continuous
  // swimming, instead of roughly 20 seconds. Paused educational cards still
  // consume no oxygen because DiveScene does not update this system then.
  baseDrainPerSecond: 0.2,
  moveDrainPerSecond: 0.4,
};

/**
 * Tracks the diver's oxygen for a dive.
 *
 * Starts from the mission's `oxygenBudget` and drains over time (faster while
 * moving). Emits `oxygen:changed` on every change and `oxygen:depleted` once
 * when it reaches zero. Per the design there is NO death penalty — depletion
 * triggers a safe return handled by the scene.
 */
export class OxygenSystem {
  private current: number;
  private depletedEmitted = false;

  constructor(
    private readonly missionId: string,
    private readonly max: number,
    private readonly options: OxygenSystemOptions = DEFAULT_OPTIONS,
  ) {
    this.current = max;
  }

  get value(): number {
    return this.current;
  }

  get maxValue(): number {
    return this.max;
  }

  get isDepleted(): boolean {
    return this.current <= 0;
  }

  /** Emit the initial value so UI can render before the first drain. */
  start(): void {
    eventBus.emit('oxygen:changed', { current: this.current, max: this.max });
  }

  update(deltaMs: number, isMoving: boolean): void {
    if (this.isDepleted) return;

    const dt = deltaMs / 1000;
    const drainRate =
      this.options.baseDrainPerSecond + (isMoving ? this.options.moveDrainPerSecond : 0);
    const next = Math.max(0, this.current - drainRate * dt);

    if (next !== this.current) {
      this.current = next;
      eventBus.emit('oxygen:changed', { current: this.current, max: this.max });
    }

    if (this.current <= 0 && !this.depletedEmitted) {
      this.depletedEmitted = true;
      eventBus.emit('oxygen:depleted', { missionId: this.missionId });
    }
  }

  reset(): void {
    this.current = this.max;
    this.depletedEmitted = false;
    eventBus.emit('oxygen:changed', { current: this.current, max: this.max });
  }
}
