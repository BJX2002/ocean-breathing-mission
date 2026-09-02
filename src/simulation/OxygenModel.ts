import type { AlertBand, DepthZone, OxygenData, OxygenReading, TimeOfDay } from '../types';

/**
 * Pure, data-driven oxygen model.
 *
 * IMPORTANT (see docs/SCIENCE_RULES.md): this model only *classifies* and looks
 * up dissolved-oxygen values that come from JSON. It deliberately contains NO
 * rule such as "if DO < 2 then delete all fish". Biological responses are a
 * separate concern handled by simulation systems reading species data.
 */
export class OxygenModel {
  constructor(private readonly data: OxygenData) {}

  /** Classify a DO value (mg/L) into a teaching alert band, if any matches. */
  classify(doMgPerL: number): AlertBand | null {
    for (const band of this.data.alertBands) {
      const aboveMin = band.minMgPerL === null || doMgPerL >= band.minMgPerL;
      const belowMax = band.maxMgPerL === null || doMgPerL < band.maxMgPerL;
      if (aboveMin && belowMax) {
        return band;
      }
    }
    return null;
  }

  /** List available scenario ids (used by the debug scenario switcher). */
  getScenarioIds(): string[] {
    return this.data.scenarios.map((s) => s.id);
  }

  /** Look up a single reading for a scenario at a depth zone and time of day. */
  getReading(
    scenarioId: string,
    depthZone: DepthZone,
    timeOfDay: TimeOfDay,
  ): OxygenReading | null {
    const scenario = this.data.scenarios.find((s) => s.id === scenarioId);
    if (scenario === undefined) return null;
    return (
      scenario.readings.find(
        (r) => r.depthZone === depthZone && r.timeOfDay === timeOfDay,
      ) ?? null
    );
  }
}
