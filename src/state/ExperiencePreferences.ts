export type NarrationVoice = 'can' | 'pth' | 'eng';

/**
 * Choices made on the launch setup screen. They intentionally live outside
 * save data: the setup appears once per browser launch, then stays fixed while
 * the player moves between the menu, opening, and chapters.
 */
class ExperiencePreferences {
  private voice: NarrationVoice = 'can';
  private configured = false;

  getVoice(): NarrationVoice {
    return this.voice;
  }

  setVoice(voice: NarrationVoice): void {
    this.voice = voice;
  }

  isConfigured(): boolean {
    return this.configured;
  }

  confirm(): void {
    this.configured = true;
  }
}

export const experiencePreferences = new ExperiencePreferences();
