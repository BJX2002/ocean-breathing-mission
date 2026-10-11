import { readFileSync } from 'node:fs';

describe('visual QA screen routing', () => {
  const openingSource = readFileSync(`${process.cwd()}/src/scenes/OpeningScene.ts`, 'utf8');

  it('routes Dive debug screens past the opening sequence', () => {
    for (const screen of [
      'report',
      'food-chain',
      'fish-oxygen',
      'do',
      'viewfinder1',
      'viewfinder2',
      'viewfinder3',
      'subject-viewfinder3',
    ]) {
      expect(openingSource).toContain(`'${screen}'`);
    }
    expect(openingSource).toContain('this.scene.start(SceneKeys.Dive)');
    const diveSource = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');
    expect(diveSource).toContain("/^subject-viewfinder([123])$/");
    expect(diveSource).toContain('this.openSubjectViewfinder(station.id, speciesId)');
  });

  it('routes Chapter 2 debug screens directly from the menu', () => {
    const menuSource = readFileSync(`${process.cwd()}/src/scenes/MenuScene.ts`, 'utf8');
    for (const screen of [
      'evidence',
      'experiment',
      'unlock',
      'comparison',
      'deployment',
      'deployment-result',
      'deployment-result-vessel',
      'deployment-result-fixed',
      'deployment-result-success',
      'summary',
      'quiz',
      'quiz-sensor',
      'ending',
    ]) {
      expect(menuSource).toContain(`'${screen}'`);
    }
    expect(menuSource).toContain('this.scene.start(SceneKeys.Chapter2Lab);');
  });
});
