import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import narrationCues from '../src/data/narrationCues.json';

const voices = ['can', 'pth', 'eng'] as const;

describe('recorded narration assets', () => {
  it('ships every first-batch cue in Cantonese, Mandarin, and English', () => {
    expect(Object.keys(narrationCues)).toHaveLength(11);
    for (const cueId of Object.keys(narrationCues)) {
      for (const voice of voices) {
        const audioPath = resolve(
          `public/runtime-public/audio/narration/${voice}/${cueId}.mp3`,
        );
        expect(statSync(audioPath).size).toBeGreaterThan(10_000);
      }
    }
  });

  it('keeps narration optional and highlights only while a cue is playing', () => {
    const scene = readFileSync(resolve('src/scenes/DiveScene.ts'), 'utf8');
    expect(scene).toContain("this.playNarrationCue('report-today-gallery'");
    expect(scene).toContain("this.playNarrationCue('report-do-bridge'");
    expect(scene).toContain("'feedback-correct'");
    expect(scene).toContain('hideHighlightWhenIdle: true');
    expect(scene).not.toContain('button.setEnabled(this.doBridgeNarrationCompleted);');
  });
});
