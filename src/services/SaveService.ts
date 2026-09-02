import { STORAGE_KEY, SAVE_VERSION } from '../config/constants';
import type { SaveData } from '../state/GameState';

/**
 * Persistence for {@link SaveData} using localStorage. All access is guarded so
 * the game still runs in private-mode or storage-disabled environments.
 */
class SaveService {
  private isAvailable(): boolean {
    try {
      const testKey = `${STORAGE_KEY}/__test__`;
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  save(data: SaveData): boolean {
    if (!this.isAvailable()) return false;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  load(): SaveData | null {
    if (!this.isAvailable()) return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!this.isSaveData(parsed)) return null;
      // Ignore saves from a newer/incompatible schema version.
      if (parsed.version !== SAVE_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (!this.isAvailable()) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  private isSaveData(value: unknown): value is SaveData {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.version === 'number' &&
      typeof v.currentScenarioId === 'string' &&
      typeof v.selectedChapter === 'number' &&
      Array.isArray(v.completedMissionIds) &&
      Array.isArray(v.unlockedLocationIds) &&
      typeof v.tutorialSeen === 'boolean' &&
      typeof v.debugMode === 'boolean'
    );
  }
}

export const saveService = new SaveService();
