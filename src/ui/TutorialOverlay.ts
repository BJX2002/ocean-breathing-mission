import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, Palette } from '../config/constants';
import { i18n } from '../i18n/LocaleService';
import { inputPrompt } from '../input/ControlScheme';
import { createResearchSurface, ResearchButton } from './ResearchUi';

const PANEL_WIDTH = 980;
const PANEL_HEIGHT = 620;

/**
 * First-time onboarding panel shown over the dive scene. Pure UI: it renders a
 * dimmed backdrop, a few control tips and a dismiss button, then calls back.
 */
export class TutorialOverlay {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, onDismiss: () => void) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    const dim = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x02060c, 0.6)
      .setOrigin(0)
      .setDepth(3000)
      .setInteractive(); // swallow clicks behind the panel
    this.objects.push(dim);

    const panel = createResearchSurface(scene, cx, cy, PANEL_WIDTH, PANEL_HEIGHT, {
      depth: 3001,
      goldRail: true,
    });
    this.objects.push(panel);

    const top = cy - PANEL_HEIGHT / 2;

    this.objects.push(
      scene.add
        .text(cx, top + 58, i18n.t('tutorial.title'), {
          fontFamily: 'sans-serif',
          fontSize: '38px',
          color: Palette.textLight,
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3002),
    );

    const tips = [
      'tutorial.move',
      'tutorial.explore',
      'tutorial.tools',
      'tutorial.evidence',
      'tutorial.oxygen',
    ];
    tips.forEach((key, i) => {
      const rowY = top + 135 + i * 74;
      const index = scene.add
        .text(cx - PANEL_WIDTH / 2 + 68, rowY, String(i + 1).padStart(2, '0'), {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#f0c95a',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(3002);
      this.objects.push(
        index,
        scene.add
          .text(cx - PANEL_WIDTH / 2 + 112, rowY, inputPrompt(scene, key), {
            fontFamily: 'sans-serif',
            fontSize: '24px',
            color: Palette.textLight,
            lineSpacing: 3,
            wordWrap: { width: PANEL_WIDTH - 180, useAdvancedWrap: true },
          })
          .setOrigin(0, 0.5)
          .setDepth(3002),
      );
    });

    const dismiss = new ResearchButton(
      scene,
      cx,
      cy + PANEL_HEIGHT / 2 - 58,
      300,
      66,
      i18n.t('tutorial.dismiss'),
      { tone: 'primary', fontSize: 27, depth: 3002 },
    );
    this.objects.push(dismiss.root);

    dismiss.onPress(() => {
      this.destroy();
      onDismiss();
    });
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }
}
