import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 final quiz recovery', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');
  const finalQuiz = section(source, 'private showFinalQuiz(): void', 'private drawDeviceGlyph(');

  it('returns after a wrong answer before choices are disabled', () => {
    const wrongBranchStart = finalQuiz.indexOf('if (!choice.correct) {');
    const wrongBranchEnd = finalQuiz.indexOf('\n        }', wrongBranchStart);
    const wrongBranch = finalQuiz.slice(wrongBranchStart, wrongBranchEnd);

    expect(wrongBranch).toContain("button.setTone('danger')");
    expect(wrongBranch).toContain("i18n.t('lab.finalQuizTryAgain')");
    expect(wrongBranch).toContain('finishButton?.setVisible(false)');
    expect(wrongBranch).toContain('return;');
    expect(wrongBranch).not.toContain('setEnabled(false)');
  });

  it('keeps the correct choice available after a retry and locks only after success', () => {
    const retryReturn = finalQuiz.indexOf('return;', finalQuiz.indexOf('if (!choice.correct) {'));
    const completion = finalQuiz.indexOf('quizComplete = true;');
    const lockChoices = finalQuiz.indexOf(
      'choiceButtons.forEach((choiceButton) => choiceButton.setEnabled(false));',
    );

    expect(finalQuiz).toContain('if (quizComplete) return;');
    expect(retryReturn).toBeLessThan(completion);
    expect(completion).toBeLessThan(lockChoices);
    expect(finalQuiz).toContain("button.setTone('primary')");
    expect(finalQuiz).toContain('finishButton?.setVisible(true)');
  });
});
