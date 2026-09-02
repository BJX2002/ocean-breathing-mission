import { describe, it, expect, beforeEach } from 'vitest';
import { gameState } from '../src/state/GameState';

describe('GameState', () => {
  beforeEach(() => {
    gameState.reset();
  });

  it('produces a serialisable snapshot', () => {
    gameState.currentScenarioId = 'dawn-bottom-event';
    gameState.markMissionComplete('m1-first-dive');
    const save = gameState.toSave();
    expect(save.currentScenarioId).toBe('dawn-bottom-event');
    expect(save.completedMissionIds).toContain('m1-first-dive');
  });

  it('round-trips through save/load', () => {
    gameState.markMissionComplete('m1-first-dive');
    gameState.unlockLocation('aquaculture-bay');
    const save = gameState.toSave();

    gameState.reset();
    expect(gameState.completedMissionIds).toHaveLength(0);

    gameState.loadSave(save);
    expect(gameState.completedMissionIds).toContain('m1-first-dive');
    expect(gameState.unlockedLocationIds).toContain('aquaculture-bay');
  });

  it('does not duplicate completed missions', () => {
    gameState.markMissionComplete('m1');
    gameState.markMissionComplete('m1');
    expect(gameState.completedMissionIds).toEqual(['m1']);
  });

  it('throws if data is accessed before loading', () => {
    expect(() => gameState.getData()).toThrow();
  });
});
