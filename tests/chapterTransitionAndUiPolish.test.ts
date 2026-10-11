import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(`${process.cwd()}/${path}`, 'utf8');

describe('chapter selection reliability and requested UI polish', () => {
  const menu = read('src/scenes/MenuScene.ts');
  const lab = read('src/scenes/Chapter2LabScene.ts');
  const dive = read('src/scenes/DiveScene.ts');

  it('guards chapter-card transitions and restores Chapter 2 input on every entry', () => {
    expect(menu).toContain('private chapterTransitionStarted = false;');
    expect(menu).toContain('if (this.chapterTransitionStarted) return;');
    expect(menu).toContain('this.input.enabled = false;');
    expect(menu).toContain('this.time.delayedCall(0, () => {');
    expect(lab).toContain('init(): void');
    expect(lab).toContain('this.modalRoot = null;');
    expect(lab).toContain('this.zones.length = 0;');
    expect(lab).toContain('this.input.enabled = true;');
    expect(lab).toContain('this.input.keyboard.resetKeys();');
  });

  it('enlarges the scientist to 1.8 times the previous display size', () => {
    expect(lab).toContain('.setDisplaySize(684, 684)');
    expect(lab).toContain('.ellipse(330, FLOOR_Y - 8, 190, 28');
  });

  it('gives the deployment tool column breathing room and guides the introductory text', () => {
    expect(lab).toContain('.rectangle(x, y, 580, 118');
    expect(lab).toContain('const x = 450;');
    expect(lab).toContain('const y = 412 + index * 128;');
    expect(lab).toContain('createResearchSurface(this, 450, 816, 580, 132');
    expect(lab).toContain('.rectangle(600, 318, 270, 48');
    expect(lab).toContain('pulseText(equipmentTitle);');
    expect(lab).toContain('pulseText(goalsTitle);');
    expect(lab).toContain('pulseGuide(equipmentGuide);');
    expect(lab).toContain('pulseGuide(goalGuide);');
    expect(lab).toContain('.rectangle(318, 318, 292, 58');
  });

  it('uses large option labels and roomier answer cards across both chapters', () => {
    expect((dive.match(/fontSize: '29px'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect((lab.match(/fontSize: '29px'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(dive).toContain(
      '.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 1480, 720, 0x0a2a43, 0.99)',
    );
    expect(dive).toContain('wordWrap: { width: 1380, useAdvancedWrap: true }');
    expect(dive).toContain('610 + choiceIndex * 700');
    expect(dive).toContain('620,\n          140,');
    expect(dive).toContain('fontSize: 28, lineSpacing: 8');
    expect(lab).toContain('createResearchSurface(this, 960, 470, 1240, 150');
    expect(lab).toContain('630 + index * 660');
    expect(lab).toContain('620,\n        140,');
    expect(lab).toContain('fontSize: 26, lineSpacing: 8');
  });

  it('keeps the longest Chapter 1 answer on two balanced lines', () => {
    const zh = read('src/i18n/zh-Hant.json');
    expect(zh).toContain(
      '"report.recap.q3a": "不能；照片只能顯示生物變少，\\n不能證明低氧是唯一原因"',
    );
    expect(zh).toContain('"report.compareNeedEvidence": "不能。這只是線索，\\n還要收集更多證據。"');
    expect(zh).toContain(
      '"lab.finalQuizSensorA": "可組成多點連續監測網，\\n並以紫外光抑制附著、替換薄膜"',
    );
  });

  it('balances the sensing-film description without leaving an orphan period', () => {
    const zh = read('src/i18n/zh-Hant.json');
    expect(zh).toContain(
      '"lab.compareSensorMethodBody": "可組成多點連續監測網\\n紫外光抑制生物附著\\n感測薄膜可以替換"',
    );
  });
});

describe('Chapter 1 HUD labels', () => {
  it('uses a labelled tutorial button and larger field labels', () => {
    const help = read('src/ui/HelpButton.ts');
    const map = read('src/entities/DiveMapView.ts');
    const hud = read('src/ui/NormalGameplayHUD.ts');
    const zh = read('src/i18n/zh-Hant.json');

    expect(help).toContain("i18n.t('tutorial.button')");
    expect(zh).toContain('"tutorial.button": "？新手教程"');
    expect(map).toMatch(/'養殖魚排'[\s\S]*?fontSize: '20px'/);
    expect(hud).toContain('const PANEL_WIDTH = 760;');
    expect(hud).toContain("this.textStyle(17, '#fff3a8', true)");
  });
});
