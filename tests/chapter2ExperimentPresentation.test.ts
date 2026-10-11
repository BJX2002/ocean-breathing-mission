import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 experiment guidance and product reveal', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');
  const zh = JSON.parse(readFileSync(`${process.cwd()}/src/i18n/zh-Hant.json`, 'utf8')) as Record<
    string,
    string
  >;
  const en = JSON.parse(readFileSync(`${process.cwd()}/src/i18n/en.json`, 'utf8')) as Record<
    string,
    string
  >;
  const experiment = section(
    source,
    'private showExperimentModal(): void',
    'private showUnlockModal(): void',
  );
  const unlock = section(
    source,
    'private showUnlockModal(): void',
    'private showConsoleModal(): void',
  );

  it('uses one pulsing coachmark that follows the active experiment step', () => {
    expect(experiment.match(/const coachRing =/g)).toHaveLength(1);
    expect(experiment).toContain('const renderCoachmark = (activeStep: number): void =>');
    expect(experiment).toContain('renderCoachmark(0);');
    expect(experiment).toContain('renderCoachmark(1);');
    expect(experiment).toContain('renderCoachmark(2);');
    expect(experiment).toContain('renderCoachmark(3);');
    expect(experiment).toContain("i18n.t('lab.experimentCoachDrag')");
    expect(experiment).toContain("i18n.t('lab.experimentCoachClick')");
    expect(experiment).toContain('coachPulse?.stop();');
  });

  it('keeps the hands-on experiment silent and free of narration controls', () => {
    expect(experiment).not.toContain('playNarration');
    expect(experiment).not.toContain('speakDoExplanation');
    expect(experiment).not.toContain("i18n.t('lab.voiceReplay')");
    expect(experiment).not.toContain('SpeechSynthesisUtterance');
    expect(zh['lab.voiceReplay']).toBe('再聽一次');
    expect(en['lab.voiceReplay']).toBe('Play again');
  });

  it('uses a balanced two-column unlock layout with a large product view', () => {
    expect(unlock).toContain('1640,\n      920,');
    expect(unlock).toContain('createResearchSurface(this, 500, 585, 560, 430');
    expect(unlock).toContain(".image(500, 560, 'chapter2-do-sensor-product')");
    expect(unlock).toContain('.setDisplaySize(470, 274)');
    expect(unlock).toContain('const columnDivider = this.add');
    expect(unlock).toContain(".text(1290, 375, i18n.t('lab.unlockPrincipleHeading')");
    expect(unlock).toContain("['01', 1030, 'lab.unlockPrincipleOxygen']");
    expect(unlock).toContain("['02', 1290, 'lab.unlockPrincipleSignal']");
    expect(unlock).toContain("['03', 1550, 'lab.unlockPrincipleData']");
    expect(unlock).toContain("[1030, 'lab.unlockAdvantageLongTerm']");
    expect(unlock).toContain("[1290, 'lab.unlockAdvantageMultiPoint']");
    expect(unlock).toContain("[1550, 'lab.unlockAdvantageReplaceable']");
  });

  it('localizes every unlock label without mixing English into Traditional Chinese', () => {
    expect(unlock).toContain("i18n.t('lab.unlockEyebrow')");
    expect(unlock).not.toContain("'COMPONENT UNLOCKED  /  01'");
    expect(zh['lab.unlockEyebrow']).toBe('解鎖新工具  /  01');
    expect(zh['lab.unlockAdvantageLongTerm']).toBe('長期記錄');
    expect(zh['lab.unlockAdvantageMultiPoint']).toBe('低成本多點');
    expect(zh['lab.unlockAdvantageReplaceable']).toContain('薄膜可換');
    expect(en['lab.unlockEyebrow']).toBe('COMPONENT UNLOCKED  /  01');
    expect(en['lab.unlockAdvantageLongTerm']).toBe('Long-term records');
  });

  it('sharpens text added by each canvas modal for high-density displays', () => {
    expect(source).toContain('this.time.delayedCall(0, () => this.sharpenVisibleText());');
    expect(source).toContain('Math.min(window.devicePixelRatio || 1, 2)');
    expect(source).toContain('object.setResolution(resolution)');
    expect(source).toContain('object.list.forEach(sharpen)');
  });
});
