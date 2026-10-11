import { readFileSync } from 'node:fs';
import en from '../src/i18n/en.json';
import zhHant from '../src/i18n/zh-Hant.json';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('teaching-flow copy', () => {
  it('keeps English and Traditional Chinese translation keys in parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zhHant).sort());
  });

  it('does not ship raw translation-key placeholders as visible copy', () => {
    const rawKey = /^[a-z][a-z0-9-]*(?:\.[a-zA-Z0-9-]+)+$/;
    for (const table of [en, zhHant]) {
      for (const [key, value] of Object.entries(table)) {
        expect(value, key).not.toMatch(rawKey);
      }
    }
  });

  it('provides explicit question, options, A and B formatting for every Chapter 1 MC screen', () => {
    const root = process.cwd();
    const source = readFileSync(`${root}/src/scenes/DiveScene.ts`, 'utf8');
    const screens = [
      section(source, 'private showPastPresentComparison(): void', 'private createTodayPhotoCard('),
      section(source, 'private showChapter1Recap(): void', 'private showDoQuestion(): void'),
      section(source, 'private showDoQuestion(): void', 'private showDoBridge(): void'),
    ];
    for (const screen of screens) {
      expect(screen).toContain("i18n.t('common.questionLabel')");
      expect(screen).toContain("i18n.t('common.optionsLabel')");
      expect(screen).toMatch(/=== 0 \? 'A' : 'B'/);
    }
  });

  it('introduces the abbreviation only with its full scientific term', () => {
    expect(zhHant['report.doBridgeTitle']).toContain('溶解氧（Dissolved Oxygen, DO）');
    expect(en['report.doBridgeTitle']).toBe('Dissolved Oxygen (DO)');
  });

  it('keeps the persistent dive hint focused on movement', () => {
    for (const copy of [en['dive.controlsPersistent'], zhHant['dive.controlsPersistent']]) {
      expect(copy).not.toMatch(/\bE\b|SPACE/);
    }
  });

  it('separates station photography from the follow-up organism record', () => {
    expect(zhHant['dive.viewfinderMissionStation']).toContain('觀測點');
    expect(zhHant['dive.viewfinderMissionStation']).not.toContain('生物');
    expect(zhHant['dive.viewfinderStationSavedNextSubject']).toContain('{species}');
    expect(en['dive.viewfinderMissionStation']).toContain('observation point');
    expect(en['dive.viewfinderStationSavedNextSubject']).toContain('{species}');
  });

  it('keeps Traditional Chinese control labels free of English action words', () => {
    expect(zhHant['dive.guidanceActionOpenViewfinder']).toBe('打開取景器');
    expect(zhHant['dive.guidanceActionPhotograph']).toBe('拍照');
    expect(zhHant['dive.viewfinderAimControl']).not.toMatch(/AIM|MOVE/i);
    expect(zhHant['dive.viewfinderShutterControl']).not.toMatch(/TAKE|PHOTO/i);
    expect(zhHant['dive.viewfinderExitControl']).not.toMatch(/EXIT/i);
  });

  it('gives an explicit retry action after a wrong recap answer', () => {
    expect(zhHant['report.recapTryAgain']).toContain('再選一次');
    expect(en['report.recapTryAgain']).toContain('Choose again');
  });

  it('connects the food web and DO evidence in the final Chapter 1 recap', () => {
    expect(zhHant['report.recap.q4']).toContain('食物網');
    expect(zhHant['report.recapFoodWebOutcome']).toMatch(/食物鏈.*低氧.*DO/);
    expect(en['report.recap.q4']).toContain('food web');
    expect(en['report.recapFoodWebOutcome']).toMatch(/food chain.*Low DO/i);
  });

  it('defines DO before the Chapter 2 first action', () => {
    expect(zhHant['lab.introBody']).toMatch(/DO.*氧氣/);
    expect(en['lab.introBody']).toMatch(/DO.*oxygen/i);
    expect(zhHant['lab.introStart']).toContain('第一步');
    expect(en['lab.introStart']).toContain('FIRST STEP');
  });

  it('auto-plays the DO bridge once, blocks progress until completion, and has no replay button', () => {
    const source = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');
    const bridge = section(source, 'private showDoBridge(): void', 'private enterChapter2(): void');

    expect(bridge).not.toContain("i18n.t('report.doBridgeVoiceReplay')");
    expect(bridge).toContain('if (!this.doBridgeNarrationPlayed)');
    expect(bridge).toContain('experiencePreferences.getVoice()');
    expect(bridge).toContain('this.activeDoBridgeUtterance = utterance;');
    expect(bridge).toContain('synthesizer.speak(utterance);');
    expect(bridge).toContain('button.setEnabled(this.doBridgeNarrationCompleted);');
    expect(bridge).toContain(
      "button.setText(i18n.t('report.doBridgeListenFirst')).setEnabled(false)",
    );
    expect(zhHant['report.doBridgeListenFirst']).toContain('聽完');
    expect(en['report.doBridgeListenFirst']).toContain('full narration');
  });

  it('makes the historical-photo hotspot action explicit', () => {
    expect(zhHant['opening.photoHotspotHint']).toMatch(/點擊.*黃色光圈/);
    expect(en['opening.photoHotspotHint']).toMatch(/select.*yellow ring/i);
  });

  it('hides the completed evidence room while the fish-breathing lesson is open', () => {
    const source = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');
    const breathingLesson = section(
      source,
      'private showDoQuestion(): void',
      'private showDoBridge(): void',
    );
    expect(breathingLesson).toContain('this.setReportOverlayVisible(false)');
    expect(breathingLesson).toContain('this.setReportOverlayVisible(true)');
  });
});
