import { describe, expect, it } from 'vitest';
import {
  DIVE_FIELD_TASK_COUNT,
  DIVE_FIELD_TASKS,
  getRequiredSpeciesForStation,
  getTaskIndexForStation,
  REQUIRED_DIVE_SPECIES_IDS,
} from '../src/ui/DiveTaskModel';

describe('Chapter 1 six-step field survey', () => {
  it('alternates each station with its representative organism', () => {
    expect(DIVE_FIELD_TASK_COUNT).toBe(6);
    expect(DIVE_FIELD_TASKS.map((task) => task.kind)).toEqual([
      'station',
      'subject',
      'station',
      'subject',
      'station',
      'subject',
    ]);
  });

  it('binds the three stations to the agreed representative organisms', () => {
    expect(getRequiredSpeciesForStation('cs-1')).toBe('blue-damselfish');
    expect(getRequiredSpeciesForStation('cs-2')).toBe('reef-grouper');
    expect(getRequiredSpeciesForStation('cs-3')).toBe('sea-cucumber');
    expect(REQUIRED_DIVE_SPECIES_IDS).toEqual(['blue-damselfish', 'reef-grouper', 'sea-cucumber']);
  });

  it('provides stable station entry points for visual-QA routes', () => {
    expect(getTaskIndexForStation('cs-1')).toBe(0);
    expect(getTaskIndexForStation('cs-2')).toBe(2);
    expect(getTaskIndexForStation('cs-3')).toBe(4);
    expect(getTaskIndexForStation('unknown')).toBe(-1);
  });
});
