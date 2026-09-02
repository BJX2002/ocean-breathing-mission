/**
 * Strongly-typed map of application events. Add new events here so both
 * emitters and listeners stay type-safe. Used to decouple gameplay systems
 * from UI (they never import each other directly).
 */
export interface GameEventMap {
  'loading:progress': { progress: number; label: string };
  'loading:complete': { totalFiles: number };
  'scene:changed': { sceneKey: string };
  'oxygen:scenarioChanged': { scenarioId: string };
  'oxygen:changed': { current: number; max: number };
  'oxygen:depleted': { missionId: string };
  'station:discovered': { stationId: string; discovered: number; total: number };
  'subject:discovered': { subjectId: string; speciesId: string; label: string; depthZone: string };
  'subject:infoRequested': { subjectId: string; speciesId: string; label: string; depthZone: string };
  'debug:toggled': { enabled: boolean };
}

type Handler<T> = (payload: T) => void;
type AnyHandler = (payload: unknown) => void;

/**
 * A tiny, dependency-free typed pub/sub bus.
 *
 * Deliberately does NOT depend on Phaser so gameplay systems that use it stay
 * unit-testable without a rendering context.
 */
class TypedEventBus {
  private readonly handlers = new Map<string, Set<AnyHandler>>();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): this {
    const key = event as string;
    let set = this.handlers.get(key);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(key, set);
    }
    set.add(handler as AnyHandler);
    return this;
  }

  once<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): this {
    const wrapper: Handler<GameEventMap[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<GameEventMap[K]>): this {
    this.handlers.get(event as string)?.delete(handler as AnyHandler);
    return this;
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): this {
    const set = this.handlers.get(event as string);
    if (set !== undefined) {
      // Copy so handlers may safely unsubscribe during emit.
      for (const handler of [...set]) {
        handler(payload as unknown);
      }
    }
    return this;
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}

/** Application-wide singleton event bus. */
export const eventBus = new TypedEventBus();
