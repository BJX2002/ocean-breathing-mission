import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import narrationCues from '../src/data/narrationCues.json';

const voices = ['can', 'pth', 'eng'] as const;

describe('recorded narration assets', () => {
  it('ships every guided cue in Cantonese, Mandarin, and English', () => {
    expect(Object.keys(narrationCues)).toHaveLength(42);
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
    expect(scene).toContain("this.playNarrationCue('report-food-chain-v2'");
    expect(scene).toContain("this.playNarrationCue('report-fish-gills-question-v4'");
    expect(scene).toContain('automaticKey,');
    expect(scene).toContain("this.playNarrationCue('report-do-bridge'");
    expect(scene).toContain("'feedback-correct-v2'");
    expect(scene).toContain('hideHighlightWhenIdle: true');
    expect(scene).not.toContain('button.setEnabled(this.doBridgeNarrationCompleted);');
  });

  it('resets auto-play history for a fresh mission and uses recorded audio in Chapter 2', () => {
    const opening = readFileSync(resolve('src/scenes/OpeningScene.ts'), 'utf8');
    const dive = readFileSync(resolve('src/scenes/DiveScene.ts'), 'utf8');
    const lab = readFileSync(resolve('src/scenes/Chapter2LabScene.ts'), 'utf8');
    const service = readFileSync(resolve('src/services/NarrationService.ts'), 'utf8');
    expect(opening).toContain('narrationService.resetAutomaticStarts();');
    expect(dive).toContain('narrationService.resetAutomaticStarts();');
    expect(lab).toContain("narrationService.play('lab-deployment-guide'");
    expect(lab).toContain("narrationService.play('lab-ending'");
    expect(lab).toContain("'lab-intro-guide'");
    expect(lab).toContain("'lab-evidence-guide'");
    expect(lab).toContain("'lab-experiment-guide'");
    expect(lab).toContain("'lab-final-quiz-1'");
    expect(lab).toContain("'lab-final-quiz-2'");
    expect(lab).toContain('private addModalNarration(');
    expect(lab).toContain("'lab-deployment-result-success'");
    expect(lab).toContain("'lab-result-reason-over-budget'");
    expect(lab).not.toContain('SpeechSynthesisUtterance');
    expect(service).toContain('this.automaticStarts.clear();');
    expect(service).toContain("window.addEventListener('pointerdown', retry, true)");
    expect(service).toContain('callbacks.automaticKey ?? cue');
  });

  it('uses cache-busted Cantonese prompts for the fish question and correct feedback', () => {
    expect(narrationCues['report-fish-gills-question-v4'].can).toContain('食物鏈');
    expect(narrationCues['report-fish-gills-question-v4'].can).toContain('魚靠身體邊個部位');
    expect(narrationCues['report-fish-gills-question-v4'].can).toContain('魚鰓');
    expect(narrationCues['report-fish-gills-question-v4'].can).not.toContain('一開一合');
    expect(narrationCues['report-fish-gills-question-v4'].can).not.toContain('選項');
    expect(narrationCues['lab-final-quiz-1'].can).not.toContain('選項');
    expect(narrationCues['lab-final-quiz-1'].pth).not.toContain('选项');
    expect(narrationCues['lab-final-quiz-1'].eng).not.toContain('Options');
    expect(narrationCues['lab-final-quiz-1'].can).not.toContain('把這次調查的重點帶走');
    expect(narrationCues['lab-experiment-guide'].can).toContain('讓光照射感測膜');
    expect(narrationCues['lab-experiment-guide'].can).not.toContain('教育模擬');
    expect(narrationCues['feedback-correct-v2'].can).toContain('答對咗');
  });

  it('supports launch-time narration speed and locks progression during playback', () => {
    const preferences = readFileSync(resolve('src/state/ExperiencePreferences.ts'), 'utf8');
    const menu = readFileSync(resolve('src/scenes/MenuScene.ts'), 'utf8');
    const service = readFileSync(resolve('src/services/NarrationService.ts'), 'utf8');
    const researchUi = readFileSync(resolve('src/ui/ResearchUi.ts'), 'utf8');

    expect(preferences).toContain('type NarrationSpeed = 0.85 | 1 | 1.2');
    expect(menu).toContain("i18n.t('menu.speedLabel')");
    expect(menu).toContain("i18n.t('menu.speedCornerLabel')");
    expect(menu).toContain('experiencePreferences.setNarrationSpeed(speed)');
    expect(service).toContain('audio.playbackRate = experiencePreferences.getNarrationSpeed()');
    expect(service).toContain('utterance.rate = experiencePreferences.getNarrationSpeed()');
    expect(researchUi).toContain('narrationService.onPlaybackChange');
    expect(researchUi).toContain('!this.narrationPlaying');
  });
});
