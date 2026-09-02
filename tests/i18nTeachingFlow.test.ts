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
