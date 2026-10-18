import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import narrationCues from '../src/data/narrationCues.json';

const voices = ['can', 'pth', 'eng'] as const;

describe('recorded narration assets', () => {
  it('ships every guided cue in Cantonese, Mandarin, and English', () => {
    expect(Object.keys(narrationCues)).toHaveLength(30);
    for (const cueId of Object.keys(narrationCues)) {
      for (const voice of voices) {
        const audioPath = resolve(`public/runtime-public/audio/narration/${voice}/${cueId}.mp3`);
        expect(statSync(audioPath).size).toBeGreaterThan(10_000);
      }
    }
  });

  it('keeps narration optional and highlights only while a cue is playing', () => {
    const scene = readFileSync(resolve('src/scenes/DiveScene.ts'), 'utf8');
    expect(scene).toContain("this.playNarrationCue('report-today-gallery'");
    expect(scene).toContain("this.playNarrationCue('dive-mission-brief'");
    expect(scene).toContain("this.playNarrationCue('report-food-lesson'");
    expect(scene).toContain("this.playNarrationCue('report-food-web'");
    expect(scene).toContain("this.playNarrationCue('report-fish-gills-question-v2'");
    expect(scene).toContain("this.playNarrationCue('report-do-bridge'");
    expect(scene).toContain("'feedback-correct'");
    expect(scene).toContain('hideHighlightWhenIdle: true');
    expect(scene).not.toContain('button.setEnabled(this.doBridgeNarrationCompleted);');
  });

  it('resets auto-play history for a fresh mission and uses recorded audio in Chapter 2', () => {
    const opening = readFileSync(resolve('src/scenes/OpeningScene.ts'), 'utf8');
    const lab = readFileSync(resolve('src/scenes/Chapter2LabScene.ts'), 'utf8');
    const service = readFileSync(resolve('src/services/NarrationService.ts'), 'utf8');
    expect(opening).toContain('narrationService.resetAutomaticStarts();');
    expect(lab).toContain("narrationService.play('lab-deployment-guide'");
    expect(lab).toContain("narrationService.play('lab-ending'");
    expect(lab).toContain("'lab-intro-guide'");
    expect(lab).toContain("'lab-evidence-guide'");
    expect(lab).toContain("'lab-experiment-guide'");
    expect(lab).toContain("'lab-final-quiz-1'");
    expect(lab).toContain("'lab-final-quiz-2'");
    expect(lab).toContain('private addModalNarration(');
    expect(lab).not.toContain('SpeechSynthesisUtterance');
    expect(service).toContain('this.automaticStarts.clear();');
  });

  it('keeps the replacement Cantonese fish question aligned with the displayed copy', () => {
    expect(narrationCues['report-fish-gills-question-v2'].can).toContain('魚也需要氧氣');
    expect(narrationCues['report-fish-gills-question-v2'].can).toContain(
      '魚靠身體的哪個部位，從水中取得氧氣？',
    );
    expect(narrationCues['report-fish-gills-question-v2'].can).toContain('A，魚鰓。B，魚鱗。');
  });
});
