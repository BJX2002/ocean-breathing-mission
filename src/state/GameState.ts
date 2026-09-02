import type { Chapter, GameData } from '../types';
import { SAVE_VERSION } from '../config/constants';

/**
 * Serialisable cross-scene progress. Kept separate from the (non-serialisable)
 * loaded {@link GameData} so it can be persisted by the SaveService.
 */
export interface SaveData {
  readonly version: number;
  readonly currentScenarioId: string;
  readonly selectedChapter: Chapter;
  readonly completedMissionIds: string[];
  readonly unlockedLocationIds: string[];
  readonly tutorialSeen: boolean;
  readonly debugMode: boolean;
}

/**
 * Central game state shared across scenes. This is deliberately a plain state
 * container — gameplay logic lives in systems/simulation, not here.
 */
class GameState {
  /** Validated data set injected by the PreloadScene after loading. */
  private data: GameData | null = null;

  currentScenarioId = 'baseline-day';
  selectedChapter: Chapter = 1;
  completedMissionIds: string[] = [];
  unlockedLocationIds: string[] = ['coral-bay'];
  tutorialSeen = false;
  debugMode = false;

  setData(data: GameData): void {
    this.data = data;
  }

  /** Access loaded data. Throws if accessed before PreloadScene completes. */
  getData(): GameData {
    if (this.data === null) {
      throw new Error('GameData accessed before it was loaded.');
    }
    return this.data;
  }

  hasData(): boolean {
    return this.data !== null;
  }

  markMissionComplete(missionId: string): void {
    if (!this.completedMissionIds.includes(missionId)) {
      this.completedMissionIds.push(missionId);
    }
  }

  unlockLocation(locationId: string): void {
    if (!this.unlockedLocationIds.includes(locationId)) {
      this.unlockedLocationIds.push(locationId);
    }
  }

  /** Produce a serialisable snapshot for persistence. */
  toSave(): SaveData {
    return {
      version: SAVE_VERSION,
      currentScenarioId: this.currentScenarioId,
      selectedChapter: this.selectedChapter,
      completedMissionIds: [...this.completedMissionIds],
      unlockedLocationIds: [...this.unlockedLocationIds],
      tutorialSeen: this.tutorialSeen,
      debugMode: this.debugMode,
    };
  }

  /** Restore progress from a persisted snapshot. */
  loadSave(save: SaveData): void {
    this.currentScenarioId = save.currentScenarioId;
    this.selectedChapter = save.selectedChapter;
    this.completedMissionIds = [...save.completedMissionIds];
    this.unlockedLocationIds = [...save.unlockedLocationIds];
    this.tutorialSeen = save.tutorialSeen;
    this.debugMode = save.debugMode;
  }

  /** Reset progress fields (does not clear loaded data). */
  reset(): void {
    this.currentScenarioId = 'baseline-day';
    this.selectedChapter = 1;
    this.completedMissionIds = [];
    this.unlockedLocationIds = ['coral-bay'];
    this.tutorialSeen = false;
    this.debugMode = false;
  }
}

/** Application-wide singleton game state. */
export const gameState = new GameState();
