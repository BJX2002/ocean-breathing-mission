import { describe, expect, it } from 'vitest';
import { chooseHudInteraction, selectCurrentStation } from '../src/ui/HudModel';

describe('normal gameplay HUD model', () => {
  it('selects a nearby incomplete station before the first incomplete station', () => {
    expect(
      selectCurrentStation([
        { ordinal: 1, displayName: 'A', photographed: false, nearby: false },
        { ordinal: 2, displayName: 'B', photographed: false, nearby: true },
        { ordinal: 3, displayName: 'C', photographed: true, nearby: true },
      ]),
    ).toMatchObject({ ordinal: 2 });
  });

  it('returns no current station when all stations are complete', () => {
    expect(selectCurrentStation([{ ordinal: 1, displayName: 'A', photographed: true, nearby: false }])).toBeNull();
  });

  it('keeps only the highest-priority contextual interaction', () => {
    const station = { kind: 'station' as const, key: 'E', label: 'Enter camera view' };
    const subject = { kind: 'subject' as const, key: 'SPACE', label: 'Photograph' };
    const vessel = { kind: 'vessel' as const, key: 'SPACE', label: 'Return to vessel' };

    expect(chooseHudInteraction(station, subject, vessel)).toBe(station);
    expect(chooseHudInteraction(null, subject, vessel)).toBe(subject);
    expect(chooseHudInteraction(null, null, vessel)).toBe(vessel);
    expect(chooseHudInteraction(null, null, null)).toBeNull();
  });
});
