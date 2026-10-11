import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import diveMaps from '../src/data/diveMaps.json';
import missions from '../src/data/missions.json';
import species from '../src/data/species.json';
import en from '../src/i18n/en.json';
import zhHant from '../src/i18n/zh-Hant.json';
import { DIVE_FIELD_TASKS } from '../src/ui/DiveTaskModel';

describe('Chapter 1 photo-target consistency', () => {
  it('uses sea-cucumber art and copy for the third historical photo clue', () => {
    const source = readFileSync(`${process.cwd()}/src/scenes/OpeningScene.ts`, 'utf8');
    const thirdClue = source.match(
      /reactionKey: 'opening\.hotspot\.s3\.summary\.reaction',[\s\S]*?guideTextureKey: '([^']+)'/,
    );

    expect(thirdClue?.[1]).toBe('chapter1-subject-sea-cucumber-frame-00');
    expect(zhHant['opening.guide.s3.title']).toBe('海參');
    expect(en['opening.guide.s3.title']).toBe('Sea cucumber');
    expect(zhHant['opening.photoFishGuide']).toContain('海洋生物');
    expect(en['opening.photoFishGuide']).toContain('Marine life');
  });

  it('uses the replacement blue-fish frame in the historical-photo guide', () => {
    const source = readFileSync(`${process.cwd()}/src/scenes/OpeningScene.ts`, 'utf8');
    const firstClue = source.match(
      /reactionKey: 'opening\.hotspot\.s1\.summary\.reaction',[\s\S]*?guideTextureKey: '([^']+)'/,
    );

    expect(firstClue?.[1]).toBe('chapter1-subject-blue-damselfish-frame-00');
    expect(source).toContain('ensureEdgeTransparentTexture(this, sourceKey, transparentKey)');
  });

  it('places every assigned organism within the photograph radius of its station', () => {
    const map = diveMaps.find((entry) => entry.locationId === 'aquaculture-bay');
    expect(map).toBeDefined();
    if (map === undefined) return;

    for (const task of DIVE_FIELD_TASKS) {
      if (task.kind !== 'subject') continue;
      const station = map.cameraStations.find((entry) => entry.id === task.stationId);
      const subject = map.subjects.find((entry) => entry.speciesId === task.speciesId);
      expect(station, task.stationId).toBeDefined();
      expect(subject, task.speciesId).toBeDefined();
      if (station === undefined || subject === undefined) continue;

      expect(
        Math.hypot(subject.x - station.x, subject.y - station.y),
        `${task.speciesId} should be close enough to photograph after ${task.stationId}`,
      ).toBeLessThanOrEqual(128);
    }
  });

  it('keeps the mission data aligned with the three-organism runtime goal', () => {
    const mission = missions.find((entry) => entry.id === 'm1-first-dive');
    const objective = mission?.objectives.find((entry) => entry.id === 'photograph-organisms');

    expect(objective?.textEn).toContain('three');
    expect(objective?.textZh).toContain('三種');
  });

  it('anchors benthic art, guidance and interaction to one seabed position', () => {
    const subjectSource = readFileSync(`${process.cwd()}/src/entities/SurveySubject.ts`, 'utf8');
    const mapSource = readFileSync(`${process.cwd()}/src/entities/DiveMapView.ts`, 'utf8');

    expect(subjectSource).toContain(
      "this.isGrounded = data.depthZone === 'bottom' && !this.isFish",
    );
    expect(subjectSource).toContain('getHabitatFloorY(data.x)');
    expect(subjectSource).toContain('return { x: this.worldX, y: this.worldY }');
    expect(subjectSource).toContain('Between(diverX, diverY, this.worldX, this.worldY)');
    expect(mapSource).toContain('const subjectPosition = subjectEntity.position');
  });

  it('animates every fish in a school and removes opaque edge backgrounds', () => {
    const subjectSource = readFileSync(`${process.cwd()}/src/entities/SurveySubject.ts`, 'utf8');
    const mapSource = readFileSync(`${process.cwd()}/src/entities/DiveMapView.ts`, 'utf8');

    expect(subjectSource).toContain('this.frameSprites.push({ sprite: schoolmate');
    expect(subjectSource).toContain("this.data.speciesId !== 'blue-damselfish'");
    expect(subjectSource).toContain("this.data.speciesId !== 'silver-reef-fish'");
    expect(mapSource).toContain('private addAnimatedBackgroundSchool');
    expect(mapSource).toContain('image.setTexture(frameKeys');
  });

  it('animates every fish shown in both station and organism viewfinders', () => {
    const diveSource = readFileSync(`${process.cwd()}/src/scenes/DiveScene.ts`, 'utf8');

    expect(diveSource).toContain('const ambientPreviewPhotos = this.getViewfinderPhotos(stationId)');
    expect(diveSource).toContain('fish.image.setTexture(nextTextureKey)');
    expect(diveSource).toContain('...ambientPreviewPhotos.map((photo) => photo.image)');
    expect(diveSource).toContain('getCreatureDisplayFrameKeys(spec.speciesId)');
  });

  it('uses the reviewed Hong Kong species names', () => {
    const names = new Map(species.map((entry) => [entry.id, [entry.nameZh, entry.nameEn]]));

    expect(names.get('blue-damselfish')).toEqual([
      '黃尾石剎／斑氏新雀鯛',
      'Chinese damselfish',
    ]);
    expect(names.get('reef-grouper')).toEqual(['紅斑／香港石斑魚', 'Hong Kong grouper']);
    expect(names.get('hardy-goby')).toEqual(['深鰕虎魚／褐深鰕虎', 'Dusky frillgoby']);
    expect(names.get('silver-reef-fish')).toEqual(['火點／勒氏笛鯛', "Russell's snapper"]);
  });
});
