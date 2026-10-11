import { readFileSync } from 'node:fs';

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Chapter 2 evidence matching', () => {
  const source = readFileSync(`${process.cwd()}/src/scenes/Chapter2LabScene.ts`, 'utf8');
  const evidence = section(
    source,
    'private showEvidenceModal(): void',
    'private showLabIntro(): void',
  );

  it('does not reveal the answers through matching colors before a drop', () => {
    expect(source).toContain('const EVIDENCE_NEUTRAL_COLOR = 0x7895a0;');
    expect(evidence).toContain('this.drawObservedEvidenceGlyph(icon, dimension, visibleColor)');
    expect(evidence).toContain(
      'this.drawEvidenceGlyph(glyph, dimension, EVIDENCE_NEUTRAL_COLOR, 0.58)',
    );
    expect(evidence).toContain(".setData('roleColor', color)");
  });

  it('shows a single observed sample on the cards and the missing monitoring system on tokens', () => {
    const observedGlyph = section(
      source,
      'private drawObservedEvidenceGlyph(',
      'private updateScientistBubble(',
    );
    expect(observedGlyph).toContain('graphics.fillCircle(6 * scale, -2 * scale, 9 * scale)');
    expect(observedGlyph).toContain(
      'graphics.strokeRoundedRect(-42 * scale, -30 * scale, 84 * scale, 60 * scale',
    );
    expect(observedGlyph).toContain('graphics.fillRect(-30 * scale, -28 * scale, 60 * scale');
    expect(evidence).not.toContain('this.drawEvidenceGlyph(icon, dimension');
  });

  it('keeps each evidence card and the answer tray in separate, readable vertical bands', () => {
    expect(evidence).toContain('.rectangle(x, 510, 410, 300');
    expect(evidence).toContain('.setPosition(x, 423)');
    expect(evidence).toContain('.text(x, 510, i18n.t(sampleKey)');
    expect(evidence).toContain("fontSize: '24px'");
    expect(evidence).toContain('.rectangle(x, 616, 300, 66');
    expect(evidence).toContain('.rectangle(960, 788, 1220, 130');
    expect(evidence).toContain(".text(350, 687, i18n.t('lab.evidenceTray')");
    expect(evidence).toContain(".setData('homeY', 792)");
  });

  it('reveals the role color only after a correct match and keeps wrong drops retryable', () => {
    expect(evidence).toContain("const roleColor = token.getData('roleColor') as number;");
    expect(evidence).toContain('this.drawEvidenceGlyph(tokenGlyph, dimension, roleColor, 0.58)');
    expect(evidence).toContain(
      'this.drawObservedEvidenceGlyph(target.observedGlyph, dimension, roleColor)',
    );
    expect(evidence).toContain('matched.add(dimension);');
    expect(evidence).toContain("i18n.t('lab.evidenceMatched')");
    expect(evidence).toContain("i18n.t('lab.evidenceWrong')");
    expect(evidence).toContain("x: token.getData('homeX') as number");
    expect(evidence).toContain('if (matched.size !== cards.length) return;');
  });
});
