/** Which of the two core loops a mission belongs to. */
export type Chapter = 1 | 2;

export interface MissionObjective {
  readonly id: string;
  readonly textEn: string;
  readonly textZh: string;
}

export interface Mission {
  readonly id: string;
  readonly titleEn: string;
  readonly titleZh: string;
  readonly locationId: string;
  readonly chapter: Chapter;
  readonly objectives: readonly MissionObjective[];
  /** Abstract oxygen budget for the dive (percentage-style, 0-100). */
  readonly oxygenBudget: number;
  readonly timeLimitSeconds: number;
}
