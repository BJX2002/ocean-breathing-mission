export type NarrationVoice = 'can' | 'pth' | 'eng';
export type NarrationSpeed = 0.85 | 1 | 1.2;

/**
 * Choices made on the launch setup screen. They intentionally live outside
 * save data: the setup appears once per browser launch, then stays fixed while
 * the player moves between the menu, opening, and chapters.
 */
class ExperiencePreferences {
  private voice: NarrationVoice = 'can';
  private narrationSpeed: NarrationSpeed = 1;
  private configured = false;

  getVoice(): NarrationVoice {
    return this.voice;
  }

  setVoice(voice: NarrationVoice): void {
    this.voice = voice;
  }

  getNarrationSpeed(): NarrationSpeed {
    return this.narrationSpeed;
  }

  setNarrationSpeed(speed: NarrationSpeed): void {
    this.narrationSpeed = speed;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  confirm(): void {
    this.configured = true;
  }
}

export const experiencePreferences = new ExperiencePreferences();
