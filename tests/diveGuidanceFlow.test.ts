import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 1 guidance flow', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');

  it('introduces only the first field action in the mission briefing', () => {
    const briefing = section(
      source,
      'private showMissionBriefing(): void',
      'private updateAutomaticSurveyUnit(',
    );

    expect(briefing).toContain("i18n.t('dive.missionBriefFirstStep')");
    expect(briefing).toContain("i18n.t('dive.missionBriefProgress')");
    expect(briefing).not.toContain("'dive.missionBriefSpecies'");
    expect(briefing).not.toContain("'dive.missionBriefDevice'");
    expect(briefing).not.toContain("'dive.missionBriefReturn'");
  });

  it('keeps station comparison photography separate from organism recording', () => {
    const viewfinder = section(
      source,
      'private openViewfinder(): void',
      'private closeViewfinder(): void',
    );

    expect(viewfinder).toContain("i18n.t('dive.viewfinderMissionStation')");
    expect(viewfinder).toContain(".t('dive.viewfinderReferenceSubject')");
    expect(viewfinder).toContain('this.mapView.tryPhotographStation(');
    expect(viewfinder).toContain(".t('dive.viewfinderStationSavedNextSubject')");
    expect(viewfinder).not.toContain(".t('dive.viewfinderMission')");
  });

  it('keeps a wrong recap answer recoverable and guards the correct transition', () => {
    const recap = section(
      source,
      'private showChapter1Recap(): void',
      'private showDoQuestion(): void',
    );

    expect(recap).toContain('let transitioning = false;');
    expect(recap).toContain('if (transitioning) return;');
    expect(recap).toContain(
      ".setText(i18n.t(correct ? 'report.recapCorrect' : 'report.recapTryAgain'))",
    );
    expect(recap).toContain('if (!correct) {');
    expect(recap).toContain('transitioning = true;');
    expect(recap).toContain('choiceButton.disableInteractive()');
  });
});
