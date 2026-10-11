export type DiveFieldTask =
  | {
      readonly kind: 'station';
      readonly stationId: string;
      readonly stationNumber: 1 | 2 | 3;
    }
  | {
      readonly kind: 'subject';
      readonly stationId: string;
      readonly stationNumber: 1 | 2 | 3;
      readonly speciesId: string;
    };

/**
 * The Chapter 1 field survey is intentionally linear for first-time players:
 * each repeat-photo station immediately hands off to one representative
 * organism before the next station becomes the main target.
 */
export const DIVE_FIELD_TASKS: readonly DiveFieldTask[] = [
  { kind: 'station', stationId: 'cs-1', stationNumber: 1 },
  {
    kind: 'subject',
    stationId: 'cs-1',
    stationNumber: 1,
    speciesId: 'blue-damselfish',
  },
  { kind: 'station', stationId: 'cs-2', stationNumber: 2 },
  {
    kind: 'subject',
    stationId: 'cs-2',
    stationNumber: 2,
    speciesId: 'reef-grouper',
  },
  { kind: 'station', stationId: 'cs-3', stationNumber: 3 },
  {
    kind: 'subject',
    stationId: 'cs-3',
    stationNumber: 3,
    speciesId: 'sea-cucumber',
  },
] as const;

export const DIVE_FIELD_TASK_COUNT = DIVE_FIELD_TASKS.length;

export const REQUIRED_DIVE_SPECIES_IDS = DIVE_FIELD_TASKS.flatMap((task) =>
  task.kind === 'subject' ? [task.speciesId] : [],
);

export function getDiveFieldTask(index: number): DiveFieldTask | null {
  return DIVE_FIELD_TASKS[index] ?? null;
}

export function getTaskIndexForStation(stationId: string): number {
  return DIVE_FIELD_TASKS.findIndex(
    (task) => task.kind === 'station' && task.stationId === stationId,
  );
}

export function getRequiredSpeciesForStation(stationId: string): string | null {
  const task = DIVE_FIELD_TASKS.find(
    (candidate) => candidate.kind === 'subject' && candidate.stationId === stationId,
  );
  return task?.kind === 'subject' ? task.speciesId : null;
}
