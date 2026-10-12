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

  it('uses the full viewfinder only for fixed-station comparison photos', () => {
    const viewfinder = section(
      source,
      'private openViewfinder(): void',
      'public openSubjectViewfinder(',
    );
    const capture = section(
      source,
      'private captureViewfinder(): void',
      'private closeViewfinder(): void',
    );

    expect(viewfinder).toContain("i18n.t('dive.viewfinderMissionStation')");
    expect(viewfinder).toContain(".t('dive.viewfinderReferenceSubject')");
    expect(capture).toContain('this.mapView.tryPhotographStation(');
    expect(capture).toContain('this.advanceFieldTask()');
    expect(capture).toContain(".t('dive.guidanceStationComplete')");
    expect(viewfinder).not.toContain('this.openSubjectViewfinder(');
  });

  it('uses the shared action input for the station viewfinder and organism photos', () => {
    const action = section(
      source,
      'private handleAction(x: number, y: number): void',
      'private getSpeciesLabel(',
    );

    expect(action).toContain('this.openViewfinder();');
    expect(action).not.toContain("this.showStatus(i18n.t('dive.guidanceActionOpenViewfinder'))");
    expect(action).toContain('this.mapView.tryPhotographSubject(x, y, task.speciesId)');
    expect(action).toContain('this.playShutterSound()');
    expect(action).toContain(".t('dive.guidanceSubjectComplete')");
  });

  it('keeps a target thumbnail beside the organism task and expands WASD directions', () => {
    const hudFlow = section(
      source,
      'private updateHud(diverX: number, diverY: number): void',
      'private isReadyToReturn(): boolean',
    );
    const hudSource = readFileSync(`${process.cwd()}/src/ui/NormalGameplayHUD.ts`, 'utf8');

    expect(hudFlow).toContain('targetTextureKey = this.getReportSpeciesTextureKey(task.speciesId)');
    expect(hudFlow).toContain("targetLabel = `${i18n.t('dive.guidanceTarget')}");
    expect(hudFlow).toContain('const touchControls = this.inputManager.usesTouchControls()');
    expect(hudFlow).toContain("i18n.t('touch.joystickShort')");
    expect(hudFlow).toContain("i18n.t('touch.actionShort')");
    expect(hudFlow).toContain("nearby ? 'TAKE PHOTO' : 'MOVE'");
    expect(hudFlow).toContain("const showEnglishControls = i18n.getLocale() === 'en'");
    expect(hudFlow).toContain("inputPrompt(this, 'dive.guidanceActionMoveDetailed')");
    expect(hudSource).toContain('private updateTargetCard(');
    expect(hudSource).toContain('this.targetImage.setTexture(textureKey)');
    expect(hudSource).toContain("['W ↑', 'A ←', 'S ↓', 'D →']");
  });

  it('activates the next organism and refreshes its guidance in the station-photo frame', () => {
    const advance = section(
      source,
      'private advanceFieldTask(): void',
      'private syncGuidedTarget(): void',
    );
    const capture = section(
      source,
      'private captureViewfinder(): void',
      'private closeViewfinder(): void',
    );
    const subjectSource = readFileSync(`${process.cwd()}/src/entities/SurveySubject.ts`, 'utf8');
    const guidedStyle = section(
      subjectSource,
      'setGuidedTarget(guided: boolean): void',
      'updateFocus(diverX: number, diverY: number): boolean',
    );
    const focusStyle = section(
      subjectSource,
      'updateFocus(diverX: number, diverY: number): boolean',
      'tryPhotograph(diverX: number, diverY: number): SurveyInteraction | null',
    );

    expect(advance).toContain('this.syncGuidedTarget();');
    expect(advance).toContain('this.updateHud(position.x, position.y);');
    expect(capture).toContain("'dive.viewfinderStationSavedNextSubject.touch'");
    expect(capture).toContain("'dive.viewfinderStationSavedNextSubject'");
    expect(guidedStyle).toContain('if (this.guided) {');
    expect(guidedStyle).toContain('setStrokeStyle(4, 0xf0c95a, 0.9)');
    expect(focusStyle).toContain('this.guided ? 0xf0c95a : 0x3fd0c9');
    expect(focusStyle).toContain('} else if (focused) {');
    expect(focusStyle).toContain(
      'setStrokeStyle(3, this.photoRecorded ? 0x9aa8b8 : 0x9cf7ef, 0.85)',
    );
  });

  it('keeps a wrong recap answer recoverable and guards the correct transition', () => {
    const recap = section(
      source,
      'private showChapter1Recap(): void',
      'private showDoQuestion(): void',
    );

    expect(recap).toContain('let transitioning = false;');
    expect(recap).toContain('if (transitioning) return;');
    expect(recap).toContain("correctFeedback: 'report.recapFoodWebOutcome'");
    expect(recap).toContain('const feedbackKey =');
    expect(recap).toContain('.setText(i18n.t(feedbackKey))');
    expect(recap).toContain('${index + 1}/${questions.length}');
    expect(recap).toContain('if (!correct) {');
    expect(recap).toContain('transitioning = true;');
    expect(recap).toContain('choiceButton.setEnabled(false)');
    expect(recap).toContain("i18n.t('report.continueChapter2')");
    expect(recap).toContain('continueButton.root.setVisible(true).setActive(true)');
    expect(recap).not.toContain('if (index >= questions.length - 1) this.enterChapter2()');
  });

  it('does not let Escape destroy an active learning flow', () => {
    const escapeHandler = section(
      source,
      'private readonly onEscape = (): void =>',
      'constructor() {',
    );
    expect(escapeHandler).toContain('if (this.reportOpen || this.briefingOpen');
    expect(escapeHandler).toContain('this.lessonOverlayObjects.length > 0');
  });
});
