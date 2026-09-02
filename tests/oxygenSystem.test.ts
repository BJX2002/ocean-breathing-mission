import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OxygenSystem } from '../src/systems/OxygenSystem';
import { eventBus } from '../src/events/EventBus';

describe('OxygenSystem', () => {
  beforeEach(() => {
    eventBus.removeAllListeners();
  });

  it('drains faster while moving', () => {
    const idle = new OxygenSystem('m1', 100, {
      baseDrainPerSecond: 2,
      moveDrainPerSecond: 3,
    });
    const moving = new OxygenSystem('m1', 100, {
      baseDrainPerSecond: 2,
      moveDrainPerSecond: 3,
    });

    idle.update(1000, false); // -2
    moving.update(1000, true); // -5

    expect(idle.value).toBeCloseTo(98);
    expect(moving.value).toBeCloseTo(95);
  });

  it('never drains below zero and emits depleted once', () => {
    const depletedSpy = vi.fn();
    eventBus.on('oxygen:depleted', depletedSpy);

    const system = new OxygenSystem('m1', 5, {
      baseDrainPerSecond: 10,
      moveDrainPerSecond: 0,
    });

    system.update(1000, false); // would be -10 -> clamped to 0
    system.update(1000, false); // already depleted, no-op

    expect(system.value).toBe(0);
    expect(system.isDepleted).toBe(true);
    expect(depletedSpy).toHaveBeenCalledTimes(1);
    expect(depletedSpy).toHaveBeenCalledWith({ missionId: 'm1' });
  });

  it('emits the initial value on start()', () => {
    const changedSpy = vi.fn();
    eventBus.on('oxygen:changed', changedSpy);

    const system = new OxygenSystem('m1', 80);
    system.start();

    expect(changedSpy).toHaveBeenCalledWith({ current: 80, max: 80 });
  });

  it('reset restores the full budget', () => {
    const system = new OxygenSystem('m1', 50, {
      baseDrainPerSecond: 10,
      moveDrainPerSecond: 0,
    });
    system.update(2000, false);
    expect(system.value).toBeLessThan(50);

    system.reset();
    expect(system.value).toBe(50);
    expect(system.isDepleted).toBe(false);
  });
});
