import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HABITAT_FLOOR_Y, WATER_SURFACE_Y } from '../config/constants';
import { eventBus } from '../events/EventBus';
import { decorTextureKey, SEABED_TEXTURE } from '../graphics/TextureFactory';
import { i18n } from '../i18n/LocaleService';
import { CameraStation } from './CameraStation';
import { SurveySubject, type SurveyInteraction } from './SurveySubject';
import type { LayoutRect } from '../ui/SceneLayout';
import type { DiveMap } from '../types';

export interface SubjectFocusInfo {
  readonly subjectId: string;
  readonly speciesId: string;
  readonly label: string;
  readonly depthZone: string;
  readonly x: number;
  readonly y: number;
}

export interface StationProgressInfo {
  readonly id: string;
  readonly ordinal: number;
  readonly displayName: string;
  readonly discovered: boolean;
  readonly photographed: boolean;
  readonly nearby: boolean;
}

/**
 * Renders a dive map from validated {@link DiveMap} data: a seabed strip,
 * decorative habitat elements and historical camera-station landmarks.
 *
 * Layout comes entirely from data (level design), so the scene stays free of
 * hard-coded positions. Discovery of stations is broadcast on the EventBus.
 */
export class DiveMapView {
  private readonly decor: Phaser.GameObjects.GameObject[] = [];
  private readonly stations: CameraStation[] = [];
  private readonly subjects: SurveySubject[] = [];
  private readonly stationPositions: readonly { x: number; y: number }[];
  private readonly layoutObstacles: LayoutRect[] = [];

  constructor(scene: Phaser.Scene, map: DiveMap, subjectLabels: ReadonlyMap<string, string>) {
    this.stationPositions = map.cameraStations.map(({ x, y }) => ({ x, y }));
    // Crop directly into the painted sand. The previous crop included a tall
    // strip of empty green water, which made the organisms appear to stand on
    // a floating shelf while the recognisable yellow seabed stayed at the
    // very bottom of the screen.
    const seabed = scene.textures.exists('chapter1-seabed-tile')
      ? scene.add
          .image(0, HABITAT_FLOOR_Y - 18, 'chapter1-seabed-tile')
          .setOrigin(0)
          .setCrop(0, 785, 1536, 205)
          .setDisplaySize(GAME_WIDTH, GAME_HEIGHT - HABITAT_FLOOR_Y + 18)
          .setAlpha(0.96)
          .setDepth(1)
      : scene.add
          .tileSprite(0, HABITAT_FLOOR_Y, GAME_WIDTH, GAME_HEIGHT - HABITAT_FLOOR_Y, SEABED_TEXTURE)
          .setOrigin(0)
          .setDepth(1);
    this.decor.push(seabed);

    // A visible sand lip joins the illustration to the water column. It is
    // deliberately brighter at the top so bottom-dwelling subjects visibly
    // touch the seabed instead of hovering above a dark empty band.
    const habitatShelf = scene.add.graphics().setDepth(2);
    habitatShelf.fillStyle(0xc9bd82, 0.28);
    habitatShelf.beginPath();
    habitatShelf.moveTo(0, HABITAT_FLOOR_Y - 14);
    for (let x = 0; x <= GAME_WIDTH; x += 96) {
      habitatShelf.lineTo(x, HABITAT_FLOOR_Y - 12 + Math.sin(x * 0.018) * 6);
    }
    habitatShelf.lineTo(GAME_WIDTH, GAME_HEIGHT);
    habitatShelf.lineTo(0, GAME_HEIGHT);
    habitatShelf.closePath();
    habitatShelf.fillPath();
    habitatShelf.lineStyle(3, 0xe9dfad, 0.42);
    habitatShelf.beginPath();
    habitatShelf.moveTo(0, HABITAT_FLOOR_Y - 14);
    for (let x = 0; x <= GAME_WIDTH; x += 96) {
      habitatShelf.lineTo(x, HABITAT_FLOOR_Y - 12 + Math.sin(x * 0.018) * 6);
    }
    habitatShelf.strokePath();
    for (let i = 0; i < 88; i += 1) {
      const x = (i * 173) % GAME_WIDTH;
      const y = HABITAT_FLOOR_Y + 6 + ((i * 47) % 148);
      const radius = 1.5 + (i % 4) * 0.7;
      habitatShelf.fillStyle(i % 3 === 0 ? 0xf0d99d : 0x758d7c, 0.38);
      habitatShelf.fillCircle(x, y, radius);
    }
    for (let i = 0; i < 12; i += 1) {
      const rippleX = 80 + i * 166;
      const rippleY = HABITAT_FLOOR_Y + 30 + (i % 3) * 28;
      habitatShelf.lineStyle(2, 0x5f7869, 0.2);
      habitatShelf.strokeEllipse(rippleX, rippleY, 88 + (i % 2) * 24, 15);
    }
    this.decor.push(habitatShelf);

    // One quiet background school gives the bay depth without filling the
    // play space with several competing fish-cluster effects.
    if (scene.textures.exists('chapter1-fish-school-small')) {
      const school = scene.add
        .image(1090, 280, 'chapter1-fish-school-small')
        .setOrigin(0.5)
        .setCrop(420, 275, 720, 350)
        .setDisplaySize(440, 214)
        .setAlpha(0.32)
        .setDepth(0);
      this.decor.push(school);
      scene.tweens.add({
        targets: school,
        x: { from: 1020, to: 1160 },
        duration: 13000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.addAquacultureRaft(scene, map);

    for (const item of map.decor) {
      const grassKey =
        item.kind === 'seagrass'
          ? item.x % 2 === 0
            ? 'chapter1-seagrass-tall'
            : 'chapter1-seagrass-short'
          : null;
      const usesIllustratedGrass = grassKey !== null && scene.textures.exists(grassKey);
      const image = scene.add
        .image(item.x, item.y, usesIllustratedGrass ? grassKey : decorTextureKey(item.kind))
        .setOrigin(0.5, 1)
        .setDepth(item.kind === 'buoy' ? 3 : 2);
      if (usesIllustratedGrass) {
        const crop =
          grassKey === 'chapter1-seagrass-tall'
            ? ([330, 50, 900, 900] as const)
            : ([320, 150, 900, 700] as const);
        const display =
          grassKey === 'chapter1-seagrass-tall' ? ([112, 132] as const) : ([112, 88] as const);
        image
          .setCrop(...crop)
          .setScale(display[0] / crop[2], display[1] / crop[3])
          .setAlpha(0.88);
      }
      this.decor.push(image);

      const decorSize = {
        buoy: { width: 150, height: 180 },
        coral: { width: 190, height: 150 },
        rock: { width: 190, height: 120 },
        seagrass: { width: 170, height: 170 },
      }[item.kind];
      this.layoutObstacles.push({
        x: item.x - decorSize.width / 2,
        y: item.y - decorSize.height,
        width: decorSize.width,
        height: decorSize.height,
      });

      // Seagrass and coral gently sway around their base for a lively feel.
      if (item.kind === 'seagrass' || item.kind === 'coral') {
        const amplitude = item.kind === 'seagrass' ? 6 : 3;
        scene.tweens.add({
          targets: image,
          angle: { from: -amplitude, to: amplitude },
          duration: 2200 + (item.x % 500),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    map.cameraStations.forEach((station, index) => {
      this.stations.push(new CameraStation(scene, station, index + 1));
      // Include the readable label and compact station icon, but not the
      // larger focus ring, in the card-avoidance area.
      this.layoutObstacles.push({
        x: station.x - 130,
        y: station.y - 105,
        width: 260,
        height: 160,
      });
    });

    for (const subject of map.subjects) {
      this.subjects.push(
        new SurveySubject(
          scene,
          subject,
          subjectLabels.get(subject.speciesId) ?? subject.speciesId,
        ),
      );
      // Reserve the subject, label, and status glyph as one conservative
      // rectangle so a card never hides the encounter it is describing.
      this.layoutObstacles.push({
        x: subject.x - 125,
        y: subject.y - 145,
        width: 250,
        height: 245,
      });
    }
  }

  /**
   * Give the second observation point an unmistakable aquaculture context.
   * The station sits at the left edge of the raft and its hanging net, which
   * makes "raft edge" readable before the player is close enough for a label.
   */
  private addAquacultureRaft(scene: Phaser.Scene, map: DiveMap): void {
    const raftStation = map.cameraStations.find((station) => station.id.endsWith('2'));
    if (raftStation === undefined) return;

    const raftX = Phaser.Math.Clamp(raftStation.x + 245, 320, GAME_WIDTH - 320);
    const raftY = WATER_SURFACE_Y + 8;
    const root = scene.add.container(raftX, raftY).setDepth(2);
    const art = scene.add.graphics();

    // Floating timber deck and orange pontoons.
    art.fillStyle(0x5c4430, 1);
    art.fillRoundedRect(-178, -18, 356, 32, 7);
    art.fillStyle(0xd99036, 1);
    art.fillRoundedRect(-166, 7, 332, 16, 8);
    art.lineStyle(3, 0xd8bd83, 0.8);
    for (let x = -150; x <= 150; x += 50) art.lineBetween(x, -16, x, 12);

    // Hanging cage. It is deliberately translucent so organisms and the
    // station remain visible through it.
    const netTop = 24;
    const netBottom = 170;
    art.lineStyle(3, 0x8fc6c5, 0.48);
    art.lineBetween(-154, netTop, -124, netBottom);
    art.lineBetween(154, netTop, 124, netBottom);
    art.lineBetween(-124, netBottom, 124, netBottom);
    for (let x = -112; x <= 112; x += 32) {
      art.lineBetween(x * 1.25, netTop, x, netBottom);
    }
    for (let y = netTop + 28; y < netBottom; y += 28) {
      const inset = (y - netTop) * 0.2;
      art.lineBetween(-154 + inset, y, 154 - inset, y);
    }

    // A few restrained fish silhouettes inside the cage communicate use
    // without turning the raft into another survey target.
    for (const [x, y, scale] of [
      [-72, 78, 0.8],
      [16, 112, 0.65],
      [84, 68, 0.55],
      [-16, 148, 0.48],
    ] as const) {
      art.fillStyle(0xc8e5df, 0.42);
      art.fillEllipse(x, y, 34 * scale, 16 * scale);
      art.fillTriangle(
        x - 16 * scale,
        y,
        x - 27 * scale,
        y - 9 * scale,
        x - 27 * scale,
        y + 9 * scale,
      );
    }

    const label = scene.add
      .text(0, -48, i18n.getLocale() === 'en' ? 'AQUACULTURE RAFT' : '養殖魚排', {
        fontFamily: 'sans-serif',
        fontSize: '16px',
        color: '#e6f7ff',
        backgroundColor: '#062838cc',
        padding: { x: 10, y: 5 },
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    root.add([art, label]);
    this.decor.push(root);
    this.layoutObstacles.push({ x: raftX - 190, y: raftY - 70, width: 380, height: 260 });

    scene.tweens.add({
      targets: root,
      y: { from: raftY - 3, to: raftY + 4 },
      angle: { from: -0.45, to: 0.45 },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  get totalStations(): number {
    return this.stations.length;
  }

  get discoveredCount(): number {
    return this.stations.filter((s) => s.isDiscovered).length;
  }

  get stationPhotoCount(): number {
    return this.stations.filter((s) => s.hasPhoto).length;
  }

  getStationProgress(diverX: number, diverY: number): readonly StationProgressInfo[] {
    return this.stations.map((station, index) => ({
      id: station.id,
      ordinal: index + 1,
      displayName: station.displayName,
      discovered: station.isDiscovered,
      photographed: station.hasPhoto,
      nearby: station.distanceTo(diverX, diverY) <= 190,
    }));
  }

  /** Check diver proximity to stations; emit an event on new discoveries. */
  update(diverX: number, diverY: number): SubjectFocusInfo | null {
    const guidedStation = this.stations.find((station) => !station.hasPhoto) ?? null;
    for (const station of this.stations) {
      station.setGuidedTarget(station === guidedStation);
      station.updateFocus(diverX, diverY);
      if (station.tryDiscover(diverX, diverY)) {
        eventBus.emit('station:discovered', {
          stationId: station.id,
          discovered: this.discoveredCount,
          total: this.totalStations,
        });
      }
    }
    const guidedSubject = this.subjects.find((subject) => !subject.hasPhoto) ?? null;
    for (const subject of this.subjects) {
      subject.setGuidedTarget(subject === guidedSubject);
      if (subject.updateFocus(diverX, diverY)) {
        eventBus.emit('subject:discovered', {
          subjectId: subject.id,
          speciesId: subject.speciesId,
          label: subject.labelText,
          depthZone: subject.depthZone,
        });
      }
    }

    const focused = this.subjects.find((subject) => subject.isFocused);
    return focused === undefined
      ? null
      : {
          subjectId: focused.id,
          speciesId: focused.speciesId,
          label: focused.labelText,
          depthZone: focused.depthZone,
          x: focused.position.x,
          y: focused.position.y,
        };
  }

  /** Photograph the closest nearby organism with the diver's camera. */
  tryPhotographSubject(diverX: number, diverY: number): SurveyInteraction | null {
    const ordered = [...this.subjects].sort(
      (a, b) =>
        Phaser.Math.Distance.Between(diverX, diverY, a.position.x, a.position.y) -
        Phaser.Math.Distance.Between(diverX, diverY, b.position.x, b.position.y),
    );
    for (const subject of ordered) {
      const interaction = subject.tryPhotograph(diverX, diverY);
      if (interaction !== null) return interaction;
    }
    return null;
  }

  /** Photograph the closest fixed historical survey point. */
  tryPhotographStation(diverX: number, diverY: number): string | null {
    const ordered = [...this.stations].sort(
      (a, b) =>
        Phaser.Math.Distance.Between(diverX, diverY, a.position.x, a.position.y) -
        Phaser.Math.Distance.Between(diverX, diverY, b.position.x, b.position.y),
    );
    for (const station of ordered) {
      if (station.tryPhotograph(diverX, diverY)) return station.id;
    }
    return null;
  }

  getNearestPhotographableStation(
    x: number,
    y: number,
  ): { id: string; displayName: string; distance: number } | null {
    let nearest: { id: string; displayName: string; distance: number } | null = null;
    for (const station of this.stations) {
      if (!station.canPhotograph) continue;
      const distance = station.distanceTo(x, y);
      if (distance > 190 || (nearest !== null && distance >= nearest.distance)) continue;
      nearest = { id: station.id, displayName: station.displayName, distance };
    }
    return nearest;
  }

  get recordedPhotoCount(): number {
    return this.subjects.filter((subject) => subject.hasPhoto).length;
  }

  /** Count unique organisms documented with a photograph. */
  get recordedSubjectCount(): number {
    return this.subjects.filter((subject) => subject.hasPhoto).length;
  }

  hasPhotographedSpecies(speciesIds: readonly string[]): boolean {
    return this.subjects.some(
      (subject) => subject.hasPhoto && speciesIds.includes(subject.speciesId),
    );
  }

  hasNearbyStation(x: number, y: number): boolean {
    return this.stationPositions.some(
      (station) => Phaser.Math.Distance.Between(x, y, station.x, station.y) <= 128,
    );
  }

  hasNearbySubject(x: number, y: number): boolean {
    return this.subjects.some(
      (subject) =>
        Phaser.Math.Distance.Between(x, y, subject.position.x, subject.position.y) <= 128,
    );
  }

  hasNearbyPhotographableSubject(x: number, y: number): boolean {
    return this.subjects.some(
      (subject) =>
        !subject.hasPhoto &&
        Phaser.Math.Distance.Between(x, y, subject.position.x, subject.position.y) <= 128,
    );
  }

  getNearestPhotographableSubject(
    x: number,
    y: number,
  ): { speciesId: string; label: string; distance: number } | null {
    let nearest: { speciesId: string; label: string; distance: number } | null = null;
    for (const subject of this.subjects) {
      if (subject.hasPhoto) continue;
      const distance = Phaser.Math.Distance.Between(x, y, subject.position.x, subject.position.y);
      if (distance > 128 || (nearest !== null && distance >= nearest.distance)) continue;
      nearest = { speciesId: subject.speciesId, label: subject.labelText, distance };
    }
    return nearest;
  }

  getLayoutObstacles(): readonly LayoutRect[] {
    return this.layoutObstacles;
  }

  destroy(): void {
    for (const image of this.decor) image.destroy();
    for (const station of this.stations) station.destroy();
    for (const subject of this.subjects) subject.destroy();
    this.decor.length = 0;
    this.stations.length = 0;
    this.subjects.length = 0;
    this.layoutObstacles.length = 0;
  }
}
