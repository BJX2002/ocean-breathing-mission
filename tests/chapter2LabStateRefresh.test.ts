import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 lab state refresh', () => {
  it('refreshes the active researcher bubble whenever zone state changes', () => {
    const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');
    const refreshZoneStates = section(
      source,
      'private refreshZoneStates(): void',
      'private showEvidenceModal(): void',
    );

    expect(refreshZoneStates).toContain('this.updateScientistBubble(this.highlightedZoneId);');
  });
});
