import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 1 evidence-room flow', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');

  it('restores the then-and-now comparison before the food-chain activities', () => {
    const evidenceRoom = section(
      source,
      'private completeChapter1(): void',
      'private showPastPresentComparison(): void',
    );

    expect(evidenceRoom).toContain('new FoodWebPuzzle(this');
    expect(evidenceRoom).toContain("'blue-damselfish'");
    expect(evidenceRoom).not.toContain("'sea-cucumber'");
    expect(evidenceRoom).not.toContain("'tube-sponge'");
    expect(evidenceRoom).toContain('this.showPastPresentComparison()');
    expect(evidenceRoom).not.toContain('this.showFoodChainLesson()');
    expect(
      section(source, 'private showPastPresentComparison(): void', 'private createTodayPhotoCard('),
    ).toContain('this.showFoodChainLesson()');
    expect(evidenceRoom).not.toContain("i18n.t('report.subtitle')");
    expect(evidenceRoom).not.toContain("i18n.t('report.callout')");
    expect(evidenceRoom).not.toContain("i18n.t('report.qualified')");
  });

  it('unlocks the single continue action only after sorting all cards', () => {
    const evidenceRoom = section(
      source,
      'private completeChapter1(): void',
      'private showPastPresentComparison(): void',
    );

    expect(evidenceRoom).toContain('if (!foodWebComplete)');
    expect(evidenceRoom).toContain(".setText(i18n.t('report.followBreathingClue'))");
    expect(evidenceRoom).toContain('this.showDoQuestion()');
  });

  it('renders one habitat board and removes the outer card frame after placement', () => {
    const puzzle = readFileSync(`${process.cwd()}/src/ui/FoodWebPuzzle.ts`, 'utf8');

    expect(puzzle).toContain('One continuous habitat illustration');
    expect(puzzle).toContain('habitat.fillGradientStyle');
    expect(puzzle).toContain('if (!placed) {');
    expect(puzzle).toContain('placed ? 0.94 : 1');
    expect(puzzle).toContain('private reflowRemainingCards(): void');
    expect(puzzle).toContain('this.cards.filter((card) => !card.placed)');
  });

  it('uses the full evidence panel for large readable food-web targets and cards', () => {
    const evidenceRoom = section(
      source,
      'private completeChapter1(): void',
      'private showPastPresentComparison(): void',
    );
    const puzzle = readFileSync(`${process.cwd()}/src/ui/FoodWebPuzzle.ts`, 'utf8');

    expect(evidenceRoom).toContain('const panelHeight = 830;');
    expect(evidenceRoom).toContain('height: 690');
    expect(evidenceRoom).toContain('top + 760');
    expect(puzzle).toContain('const FOOD_WEB_CARD_WIDTH = 252;');
    expect(puzzle).toContain('const zoneHeight = 350;');
    expect(puzzle).toContain("fontSize: '40px'");
    expect(puzzle).toContain("fontSize: '27px'");
    expect(puzzle).toContain("fontSize: '28px'");
    expect(puzzle).toContain("fontSize: '22px'");
  });
});
