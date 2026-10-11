import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const openingSource = readFileSync(`${process.cwd()}/src/scenes/OpeningScene.ts`, 'utf8');

describe('Chapter 1 archive typography', () => {
  it('uses classroom-readable type for the archive and evidence panel', () => {
    expect(openingSource).toMatch(/photoReviewTitle'[\s\S]*?fontSize: '54px'/);
    expect(openingSource).toMatch(/photoReviewHint'[\s\S]*?fontSize: '28px'/);
    expect(openingSource).toMatch(/photoHotspotTitle'[\s\S]*?fontSize: '36px'/);
    expect(openingSource).toMatch(/photoHotspotDefault'[\s\S]*?fontSize: '26px'/);
    expect(openingSource).toContain('const width = 542;');
    expect(openingSource).toContain('const height = 700;');
  });

  it('spaces the three enlarged archive tabs so they cannot overlap', () => {
    expect(openingSource).toContain('const tabX = 430;');
    expect(openingSource).toContain('tabX + index * 330');
    expect(openingSource).toContain('tab.setFontSize(24).setPadding(26, 14, 26, 14)');
  });

  it('turns the conclusion choices into large answer cards', () => {
    expect(openingSource).toContain(
      'createResearchSurface(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, 1480, 820',
    );
    expect(openingSource).toContain('.rectangle(centerX, centerY, 580, 180, 0x123c50, 1)');
    expect(openingSource).toMatch(/photoConclusionQuestion'[\s\S]*?fontSize: '40px'/);
    expect(openingSource).toMatch(/i18n\.t\(choice\.key\)[\s\S]*?fontSize: '31px'/);
  });

  it('uses the lower archive canvas instead of leaving a large empty footer', () => {
    expect(openingSource).toContain('const viewportY = 540;');
    expect(openingSource).toContain('viewportY + 30, 1080, 700');
    expect(openingSource).toContain(".text(286, 875, i18n.t('common.tipLabel')");
    expect(openingSource).toContain('const top = 220;');
  });

  it('refreshes the final archive page immediately after the third clue is found', () => {
    expect(openingSource).toContain('private areAllPhotoLocationsReviewed(): boolean');
    expect(openingSource).toMatch(
      /this\.photoIndex === PHOTO_KEYS\.length - 1[\s\S]*?this\.areAllPhotoLocationsReviewed\(\)[\s\S]*?delayedCall\(0, \(\) => \{[\s\S]*?this\.renderStage\(\)/,
    );
  });
});
